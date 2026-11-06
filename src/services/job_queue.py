"""
Transactional PostgreSQL Job Queue Engine with SKIP LOCKED, Worker Leases, and Fencing Tokens.
"""
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from typing import Optional, List
import uuid
import asyncpg
import structlog

from src.exceptions import DatabaseError

logger = structlog.get_logger(__name__)


@dataclass(frozen=True)
class JobRecord:
    """Immutable representation of a document processing job."""

    id: uuid.UUID
    organization_id: uuid.UUID
    workspace_id: uuid.UUID
    document_id: uuid.UUID
    action: str
    status: str
    priority: int
    attempts: int
    max_attempts: int
    last_error: Optional[str]
    locked_by: Optional[str]
    locked_at: Optional[datetime]
    lease_expires_at: Optional[datetime]
    lease_generation: int
    fencing_token: uuid.UUID
    run_at: datetime
    idempotency_key: str
    created_at: datetime

    @classmethod
    def from_record(cls, record: asyncpg.Record) -> "JobRecord":
        return cls(
            id=record["id"],
            organization_id=record["organization_id"],
            workspace_id=record["workspace_id"],
            document_id=record["document_id"],
            action=record["action"],
            status=record["status"],
            priority=record["priority"],
            attempts=record["attempts"],
            max_attempts=record["max_attempts"],
            last_error=record.get("last_error"),
            locked_by=record.get("locked_by"),
            locked_at=record.get("locked_at"),
            lease_expires_at=record.get("lease_expires_at"),
            lease_generation=record.get("lease_generation", 0),
            fencing_token=record["fencing_token"],
            run_at=record["run_at"],
            idempotency_key=record["idempotency_key"],
            created_at=record["created_at"],
        )


class TransactionalJobQueue:
    """
    Transactional Queue Service backed by PostgreSQL document_jobs table.
    Enforces atomic claiming via FOR UPDATE SKIP LOCKED, monotonic lease generations,
    fencing tokens to defeat zombie workers, and automatic stale lease recovery.
    """

    def __init__(self, pool: asyncpg.Pool) -> None:
        self.pool = pool

    async def enqueue_job(
        self,
        organization_id: uuid.UUID,
        workspace_id: uuid.UUID,
        document_id: uuid.UUID,
        action: str = "DOCUMENT_EXTRACTION",
        priority: int = 10,
        max_attempts: int = 5,
        idempotency_key: Optional[str] = None,
        conn: Optional[asyncpg.Connection] = None,
    ) -> Optional[JobRecord]:
        """
        Enqueue a new job with idempotency protection.
        If idempotency_key already exists, returns None or existing job without duplicate insertion.
        """
        if idempotency_key is None:
            idempotency_key = f"{action.lower()}-{document_id}-{uuid.uuid4().hex[:8]}"

        query = """
            INSERT INTO document_jobs (
                organization_id, workspace_id, document_id,
                action, status, priority, max_attempts,
                idempotency_key, run_at
            )
            VALUES ($1, $2, $3, $4, 'QUEUED', $5, $6, $7, CURRENT_TIMESTAMP)
            ON CONFLICT (idempotency_key) DO NOTHING
            RETURNING *;
        """

        execute_conn = conn if conn is not None else self.pool

        row = await execute_conn.fetchrow(
            query,
            organization_id,
            workspace_id,
            document_id,
            action,
            priority,
            max_attempts,
            idempotency_key,
        )

        if row is None:
            logger.info("Job already exists (idempotent skip)", idempotency_key=idempotency_key)
            return None

        return JobRecord.from_record(row)

    async def claim_job(
        self,
        worker_id: str,
        lease_duration_seconds: int = 300,
        action: Optional[str] = None,
        organization_id: Optional[uuid.UUID] = None,
    ) -> Optional[JobRecord]:
        """
        Atomically claim the highest-priority runnable queued job using FOR UPDATE SKIP LOCKED.
        Generates a new fencing_token and increments lease_generation.
        """
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=lease_duration_seconds)

        where_clauses = ["status = 'QUEUED'", "run_at <= CURRENT_TIMESTAMP"]
        params: List[object] = [worker_id, expires_at]
        param_idx = 3

        if action:
            where_clauses.append(f"action = ${param_idx}")
            params.append(action)
            param_idx += 1

        if organization_id:
            where_clauses.append(f"organization_id = ${param_idx}")
            params.append(organization_id)
            param_idx += 1

        where_sql = " AND ".join(where_clauses)

        query = f"""
            WITH next_job AS (
                SELECT organization_id, id
                FROM document_jobs
                WHERE {where_sql}
                ORDER BY priority DESC, run_at ASC, id ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            UPDATE document_jobs j
            SET status = 'PROCESSING',
                locked_by = $1,
                locked_at = CURRENT_TIMESTAMP,
                lease_expires_at = $2,
                lease_generation = j.lease_generation + 1,
                fencing_token = uuid_generate_v4(),
                attempts = j.attempts + 1
            FROM next_job
            WHERE j.organization_id = next_job.organization_id AND j.id = next_job.id
            RETURNING j.*;
        """

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(query, *params)
                if row is None:
                    return None

                job = JobRecord.from_record(row)
                logger.info(
                    "Claimed job",
                    job_id=str(job.id),
                    action=job.action,
                    doc_id=str(job.document_id),
                    worker_id=worker_id,
                    fencing_token=str(job.fencing_token),
                    lease_gen=job.lease_generation,
                )
                return job

    async def heartbeat(
        self,
        job_id: uuid.UUID,
        organization_id: uuid.UUID,
        fencing_token: uuid.UUID,
        lease_duration_seconds: int = 300,
    ) -> bool:
        """
        Extend the active lease on a running job.
        Fails and returns False if fencing_token has been invalidated or lease was reclaimed.
        """
        new_expires_at = datetime.now(timezone.utc) + timedelta(seconds=lease_duration_seconds)

        query = """
            UPDATE document_jobs
            SET lease_expires_at = $1
            WHERE organization_id = $2
              AND id = $3
              AND fencing_token = $4
              AND status = 'PROCESSING'
            RETURNING id;
        """

        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(query, new_expires_at, organization_id, job_id, fencing_token)
            if row is None:
                logger.warning(
                    "Heartbeat failed: fencing token invalid or lease reclaimed",
                    job_id=str(job_id),
                    fencing_token=str(fencing_token),
                )
                return False
            return True

    async def complete_job(
        self,
        job_id: uuid.UUID,
        organization_id: uuid.UUID,
        fencing_token: uuid.UUID,
    ) -> bool:
        """
        Mark an active job as COMPLETED upon successful processing.
        Requires valid fencing token to guarantee exactly-once state finalization.
        """
        query = """
            UPDATE document_jobs
            SET status = 'COMPLETED',
                locked_by = NULL,
                lease_expires_at = NULL
            WHERE organization_id = $1
              AND id = $2
              AND fencing_token = $3
              AND status = 'PROCESSING'
            RETURNING id;
        """

        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(query, organization_id, job_id, fencing_token)
            if row is None:
                logger.error(
                    "Failed to complete job: fencing token mismatch (zombie worker detected)",
                    job_id=str(job_id),
                    fencing_token=str(fencing_token),
                )
                return False

            logger.info("Job completed successfully", job_id=str(job_id))
            return True

    async def fail_job(
        self,
        job_id: uuid.UUID,
        organization_id: uuid.UUID,
        fencing_token: uuid.UUID,
        error_message: str,
        base_backoff_seconds: int = 30,
    ) -> bool:
        """
        Record a job processing failure.
        If attempts < max_attempts, reschedules for retry with exponential backoff.
        If attempts >= max_attempts, marks job and corresponding document as FAILED.
        """
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                job_row = await conn.fetchrow(
                    """
                    SELECT attempts, max_attempts, document_id, workspace_id
                    FROM document_jobs
                    WHERE organization_id = $1 AND id = $2 AND fencing_token = $3 AND status = 'PROCESSING'
                    FOR UPDATE
                    """,
                    organization_id,
                    job_id,
                    fencing_token,
                )

                if job_row is None:
                    logger.warning(
                        "Cannot record failure: fencing token mismatch",
                        job_id=str(job_id),
                        fencing_token=str(fencing_token),
                    )
                    return False

                attempts = job_row["attempts"]
                max_attempts = job_row["max_attempts"]
                doc_id = job_row["document_id"]
                ws_id = job_row["workspace_id"]

                if attempts >= max_attempts:
                    # Terminal failure
                    await conn.execute(
                        """
                        UPDATE document_jobs
                        SET status = 'FAILED',
                            locked_by = NULL,
                            lease_expires_at = NULL,
                            last_error = $1
                        WHERE organization_id = $2 AND id = $3
                        """,
                        error_message,
                        organization_id,
                        job_id,
                    )
                    # Mark document as FAILED
                    await conn.execute(
                        """
                        UPDATE documents
                        SET status = 'FAILED',
                            updated_at = CURRENT_TIMESTAMP
                        WHERE organization_id = $1 AND workspace_id = $2 AND id = $3
                        """,
                        organization_id,
                        ws_id,
                        doc_id,
                    )
                    logger.error(
                        "Job permanently failed (max attempts exhausted)",
                        job_id=str(job_id),
                        doc_id=str(doc_id),
                        attempts=attempts,
                        error=error_message,
                    )
                else:
                    # Reschedule with exponential backoff
                    backoff = base_backoff_seconds * (2 ** (attempts - 1))
                    next_run = datetime.now(timezone.utc) + timedelta(seconds=backoff)
                    await conn.execute(
                        """
                        UPDATE document_jobs
                        SET status = 'QUEUED',
                            run_at = $1,
                            locked_by = NULL,
                            lease_expires_at = NULL,
                            last_error = $2
                        WHERE organization_id = $3 AND id = $4
                        """,
                        next_run,
                        error_message,
                        organization_id,
                        job_id,
                    )
                    logger.warning(
                        "Job rescheduled for retry",
                        job_id=str(job_id),
                        attempt=attempts,
                        max_attempts=max_attempts,
                        next_run=str(next_run),
                        error=error_message,
                    )

                return True

    async def reap_stale_leases(
        self,
        batch_size: int = 50,
        base_backoff_seconds: int = 30,
    ) -> int:
        """
        Find and reclaim jobs whose worker lease has expired (e.g. worker crashed or network severed).
        If attempts >= max_attempts, marks FAILED.
        Otherwise resets to QUEUED with backoff.
        """
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                stale_jobs = await conn.fetch(
                    """
                    SELECT organization_id, workspace_id, document_id, id, attempts, max_attempts
                    FROM document_jobs
                    WHERE status = 'PROCESSING'
                      AND lease_expires_at < CURRENT_TIMESTAMP
                    ORDER BY lease_expires_at ASC
                    LIMIT $1
                    FOR UPDATE SKIP LOCKED
                    """,
                    batch_size,
                )

                if not stale_jobs:
                    return 0

                reaped_count = 0
                for row in stale_jobs:
                    org_id = row["organization_id"]
                    ws_id = row["workspace_id"]
                    doc_id = row["document_id"]
                    job_id = row["id"]
                    attempts = row["attempts"]
                    max_attempts = row["max_attempts"]

                    if attempts >= max_attempts:
                        await conn.execute(
                            """
                            UPDATE document_jobs
                            SET status = 'FAILED',
                                locked_by = NULL,
                                lease_expires_at = NULL,
                                last_error = 'Worker lease expired and max attempts reached'
                            WHERE organization_id = $1 AND id = $2
                            """,
                            org_id,
                            job_id,
                        )
                        await conn.execute(
                            """
                            UPDATE documents
                            SET status = 'FAILED',
                                updated_at = CURRENT_TIMESTAMP
                            WHERE organization_id = $1 AND workspace_id = $2 AND id = $3
                            """,
                            org_id,
                            ws_id,
                            doc_id,
                        )
                    else:
                        backoff = base_backoff_seconds * (2 ** max(0, attempts - 1))
                        next_run = datetime.now(timezone.utc) + timedelta(seconds=backoff)
                        await conn.execute(
                            """
                            UPDATE document_jobs
                            SET status = 'QUEUED',
                                run_at = $1,
                                locked_by = NULL,
                                lease_expires_at = NULL,
                                last_error = 'Worker lease expired; re-queued by reaper'
                            WHERE organization_id = $2 AND id = $3
                            """,
                            next_run,
                            org_id,
                            job_id,
                        )
                    reaped_count += 1

                logger.info("Reaped stale job leases", count=reaped_count)
                return reaped_count
