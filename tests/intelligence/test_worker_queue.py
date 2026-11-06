"""
Unit and Integration Tests for TransactionalJobQueue (Phase 4 Step 5).
Validates atomic claim with FOR UPDATE SKIP LOCKED, fencing tokens,
heartbeat extensions, retry backoff, and stale lease reclamation.
"""
import asyncio
from datetime import datetime, timezone, timedelta
from typing import AsyncGenerator
import uuid
import pytest
import pytest_asyncio
import asyncpg

from src.config import get_settings
from src.db.pool import db_manager
from src.dns import init_dns_resolver
from src.services.job_queue import TransactionalJobQueue, JobRecord

init_dns_resolver()



@pytest_asyncio.fixture
async def test_env(db_pool: asyncpg.Pool) -> AsyncGenerator[dict, None]:
    """Create isolated tenant context for queue tests."""
    org_id = uuid.uuid4()
    ws_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    doc_id2 = uuid.uuid4()

    async with db_pool.acquire() as conn:
        async with conn.transaction():
            # Create organization
            await conn.execute(
                "INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)",
                org_id,
                f"Queue Test Org {org_id.hex[:6]}",
                f"queue-test-org-{org_id.hex[:6]}",
            )
            # Create workspace
            await conn.execute(
                "INSERT INTO workspaces (id, organization_id, name, slug) VALUES ($1, $2, $3, $4)",
                ws_id,
                org_id,
                "Queue Test WS",
                f"queue-ws-{ws_id.hex[:6]}",
            )
            # Create test documents
            for d_id, fname in [(doc_id, "doc1.pdf"), (doc_id2, "doc2.pdf")]:
                await conn.execute(
                    """
                    INSERT INTO documents (
                        id, organization_id, workspace_id, filename,
                        file_size_bytes, mime_type, sha256_hash, s3_key, status
                    ) VALUES ($1, $2, $3, $4, 1024, 'application/pdf', $5, $6, 'QUEUED')
                    """,
                    d_id,
                    org_id,
                    ws_id,
                    fname,
                    uuid.uuid4().hex * 2,
                    f"test/{d_id}/{fname}",
                )

    yield {
        "org_id": org_id,
        "ws_id": ws_id,
        "doc_id": doc_id,
        "doc_id2": doc_id2,
    }

    # Teardown
    async with db_pool.acquire() as conn:
        await conn.execute("DELETE FROM document_jobs WHERE organization_id = $1", org_id)
        await conn.execute("DELETE FROM documents WHERE organization_id = $1", org_id)
        await conn.execute("DELETE FROM workspaces WHERE organization_id = $1", org_id)
        await conn.execute("DELETE FROM organizations WHERE id = $1", org_id)


@pytest.mark.asyncio
async def test_enqueue_and_priority_claim(db_pool: asyncpg.Pool, test_env: dict) -> None:
    """Validate that higher priority jobs are claimed first with a newly minted fencing token."""
    queue = TransactionalJobQueue(pool=db_pool)
    org_id = test_env["org_id"]
    ws_id = test_env["ws_id"]
    doc_id = test_env["doc_id"]
    doc_id2 = test_env["doc_id2"]

    # Enqueue low priority job first
    job_low = await queue.enqueue_job(
        organization_id=org_id,
        workspace_id=ws_id,
        document_id=doc_id,
        priority=5,
        action="PROCESS_DOC_LOW",
    )
    assert job_low is not None
    assert job_low.status == "QUEUED"
    assert job_low.priority == 5

    # Enqueue high priority job second
    job_high = await queue.enqueue_job(
        organization_id=org_id,
        workspace_id=ws_id,
        document_id=doc_id2,
        priority=20,
        action="PROCESS_DOC_HIGH",
    )
    assert job_high is not None
    assert job_high.priority == 20

    # Claim job - must claim high priority job first
    claimed_1 = await queue.claim_job(
        worker_id="test-worker-1",
        lease_duration_seconds=120,
        organization_id=org_id,
    )
    assert claimed_1 is not None
    assert claimed_1.id == job_high.id
    assert claimed_1.status == "PROCESSING"
    assert claimed_1.attempts == 1
    assert claimed_1.lease_generation == 1
    assert claimed_1.fencing_token is not None
    assert claimed_1.locked_by == "test-worker-1"

    # Claim next job - must claim low priority job
    claimed_2 = await queue.claim_job(
        worker_id="test-worker-2",
        lease_duration_seconds=120,
        organization_id=org_id,
    )
    assert claimed_2 is not None
    assert claimed_2.id == job_low.id
    assert claimed_2.status == "PROCESSING"

    # Claim again - no runnable jobs remain
    claimed_3 = await queue.claim_job(
        worker_id="test-worker-3",
        organization_id=org_id,
    )
    assert claimed_3 is None


@pytest.mark.asyncio
async def test_concurrent_worker_claiming_no_collisions(db_pool: asyncpg.Pool, test_env: dict) -> None:
    """Validate that concurrent workers claiming simultaneously receive distinct jobs (no duplicate claims)."""
    queue = TransactionalJobQueue(pool=db_pool)
    org_id = test_env["org_id"]
    ws_id = test_env["ws_id"]
    doc_id = test_env["doc_id"]
    doc_id2 = test_env["doc_id2"]

    # Enqueue two distinct jobs
    await queue.enqueue_job(org_id, ws_id, doc_id, priority=10, idempotency_key=f"c1-{doc_id}")
    await queue.enqueue_job(org_id, ws_id, doc_id2, priority=10, idempotency_key=f"c2-{doc_id2}")

    # Launch two simultaneous claims
    claim_task_1 = queue.claim_job(worker_id="worker-A", organization_id=org_id)
    claim_task_2 = queue.claim_job(worker_id="worker-B", organization_id=org_id)

    res_1, res_2 = await asyncio.gather(claim_task_1, claim_task_2)

    assert res_1 is not None
    assert res_2 is not None
    # Must be distinct jobs
    assert res_1.id != res_2.id
    assert {res_1.locked_by, res_2.locked_by} == {"worker-A", "worker-B"}


@pytest.mark.asyncio
async def test_heartbeat_renewal_and_fencing_token(db_pool: asyncpg.Pool, test_env: dict) -> None:
    """Validate heartbeat extension with valid fencing token and rejection on invalid token."""
    queue = TransactionalJobQueue(pool=db_pool)
    org_id = test_env["org_id"]
    ws_id = test_env["ws_id"]
    doc_id = test_env["doc_id"]

    await queue.enqueue_job(org_id, ws_id, doc_id, idempotency_key=f"hb-{doc_id}")
    job = await queue.claim_job(worker_id="worker-hb", lease_duration_seconds=60, organization_id=org_id)
    assert job is not None

    # Valid heartbeat succeeds
    renewed = await queue.heartbeat(
        job_id=job.id,
        organization_id=org_id,
        fencing_token=job.fencing_token,
        lease_duration_seconds=180,
    )
    assert renewed is True

    # Invalid fencing token fails
    bogus_token = uuid.uuid4()
    bad_renewed = await queue.heartbeat(
        job_id=job.id,
        organization_id=org_id,
        fencing_token=bogus_token,
        lease_duration_seconds=180,
    )
    assert bad_renewed is False


@pytest.mark.asyncio
async def test_job_completion_with_fencing_token(db_pool: asyncpg.Pool, test_env: dict) -> None:
    """Validate that completing a job requires a valid fencing token and transitions status to COMPLETED."""
    queue = TransactionalJobQueue(pool=db_pool)
    org_id = test_env["org_id"]
    ws_id = test_env["ws_id"]
    doc_id = test_env["doc_id"]

    await queue.enqueue_job(org_id, ws_id, doc_id, idempotency_key=f"cmp-{doc_id}")
    job = await queue.claim_job(worker_id="worker-cmp", organization_id=org_id)
    assert job is not None

    # Complete with invalid fencing token fails
    invalid_comp = await queue.complete_job(job.id, org_id, uuid.uuid4())
    assert invalid_comp is False

    # Complete with valid fencing token succeeds
    valid_comp = await queue.complete_job(job.id, org_id, job.fencing_token)
    assert valid_comp is True

    # Verify state in database
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT status, locked_by, lease_expires_at FROM document_jobs WHERE id = $1", job.id)
        assert row["status"] == "COMPLETED"
        assert row["locked_by"] is None
        assert row["lease_expires_at"] is None


@pytest.mark.asyncio
async def test_job_failure_retry_and_max_attempts(db_pool: asyncpg.Pool, test_env: dict) -> None:
    """Validate exponential backoff retry and final FAILED state when max_attempts is reached."""
    queue = TransactionalJobQueue(pool=db_pool)
    org_id = test_env["org_id"]
    ws_id = test_env["ws_id"]
    doc_id = test_env["doc_id"]

    # Enqueue with max_attempts = 2
    await queue.enqueue_job(
        org_id, ws_id, doc_id,
        max_attempts=2,
        idempotency_key=f"fail-{doc_id}",
    )

    # Attempt 1
    job1 = await queue.claim_job(worker_id="worker-err", organization_id=org_id)
    assert job1 is not None
    assert job1.attempts == 1

    # Record first failure -> should reschedule (status QUEUED)
    fail1 = await queue.fail_job(job1.id, org_id, job1.fencing_token, error_message="Network glitch", base_backoff_seconds=1)
    assert fail1 is True

    async with db_pool.acquire() as conn:
        r1 = await conn.fetchrow("SELECT status, attempts, last_error, run_at FROM document_jobs WHERE id = $1", job1.id)
        assert r1["status"] == "QUEUED"
        assert r1["attempts"] == 1
        assert "Network glitch" in r1["last_error"]
        # Reset run_at to past for immediate attempt 2
        await conn.execute("UPDATE document_jobs SET run_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id = $1", job1.id)

    # Attempt 2
    job2 = await queue.claim_job(worker_id="worker-err", organization_id=org_id)
    assert job2 is not None
    assert job2.attempts == 2

    # Record second failure -> max_attempts (2) reached -> terminal FAILED
    fail2 = await queue.fail_job(job2.id, org_id, job2.fencing_token, error_message="Fatal corruption")
    assert fail2 is True

    async with db_pool.acquire() as conn:
        r2 = await conn.fetchrow("SELECT status, last_error FROM document_jobs WHERE id = $1", job2.id)
        assert r2["status"] == "FAILED"
        assert "Fatal corruption" in r2["last_error"]

        # Verify corresponding document was also marked FAILED
        doc_row = await conn.fetchrow("SELECT status FROM documents WHERE id = $1", doc_id)
        assert doc_row["status"] == "FAILED"


@pytest.mark.asyncio
async def test_stale_lease_reaper(db_pool: asyncpg.Pool, test_env: dict) -> None:
    """Validate that stale/expired worker leases are reclaimed by the reaper."""
    queue = TransactionalJobQueue(pool=db_pool)
    org_id = test_env["org_id"]
    ws_id = test_env["ws_id"]
    doc_id = test_env["doc_id"]

    await queue.enqueue_job(org_id, ws_id, doc_id, max_attempts=3, idempotency_key=f"reap-{doc_id}")
    job = await queue.claim_job(worker_id="crashed-worker", organization_id=org_id)
    assert job is not None

    # Manually expire the lease in the database to simulate crash
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE document_jobs
            SET lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 seconds'
            WHERE id = $1
            """,
            job.id,
        )

    # Execute reaper
    reaped = await queue.reap_stale_leases(batch_size=10, base_backoff_seconds=1)
    assert reaped >= 1

    # Verify job was reclaimed to QUEUED
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT status, locked_by, last_error FROM document_jobs WHERE id = $1", job.id)
        assert row["status"] == "QUEUED"
        assert row["locked_by"] is None
        assert "Worker lease expired" in row["last_error"]
