"""
Background Worker Daemon for Autonomous Document Processing (Phase 4 Step 5).
Continuously claims jobs with FOR UPDATE SKIP LOCKED, executes pipeline orchestrator,
maintains active lease heartbeats, and reclaims stale leases.
"""
from __future__ import annotations

import asyncio
from typing import Optional, Set
import uuid

import asyncpg
import structlog

from src.services.job_queue import TransactionalJobQueue, JobRecord
from src.intelligence.pipeline_orchestrator import DocumentPipelineOrchestrator

logger = structlog.get_logger(__name__)


class WorkerDaemon:
    """
    Autonomous Ingestion & Document Intelligence Worker Daemon.
    Supports configurable concurrency, graceful shutdown, lease heartbeats,
    and automatic stale lease recovery.
    """

    def __init__(
        self,
        pool: asyncpg.Pool,
        worker_id: Optional[str] = None,
        max_concurrent_jobs: int = 2,
        poll_interval_seconds: float = 1.0,
        lease_duration_seconds: int = 300,
        reaper_interval_seconds: float = 30.0,
        orchestrator: Optional[DocumentPipelineOrchestrator] = None,
        queue: Optional[TransactionalJobQueue] = None,
        organization_id: Optional[uuid.UUID] = None,
    ) -> None:
        self.pool = pool
        self.worker_id = worker_id or f"worker-{uuid.uuid4().hex[:8]}"
        self.max_concurrent_jobs = max_concurrent_jobs
        self.poll_interval_seconds = poll_interval_seconds
        self.lease_duration_seconds = lease_duration_seconds
        self.reaper_interval_seconds = reaper_interval_seconds
        self.organization_id = organization_id

        self.queue = queue or TransactionalJobQueue(pool=pool)
        self.orchestrator = orchestrator or DocumentPipelineOrchestrator(pool=pool)

        self._stop_event = asyncio.Event()
        self._active_tasks: Set[asyncio.Task[None]] = set()
        self._worker_loop_task: Optional[asyncio.Task[None]] = None
        self._reaper_task: Optional[asyncio.Task[None]] = None
        self._is_running = False

    @property
    def is_running(self) -> bool:
        return self._is_running

    def start(self) -> None:
        """Start the background worker and reaper tasks."""
        if self._is_running:
            logger.warning("WorkerDaemon is already running", worker_id=self.worker_id)
            return

        self._stop_event.clear()
        self._is_running = True
        self._worker_loop_task = asyncio.create_task(self._worker_loop(), name=f"{self.worker_id}-main")
        self._reaper_task = asyncio.create_task(self._reaper_loop(), name=f"{self.worker_id}-reaper")

        logger.info(
            "WorkerDaemon started",
            worker_id=self.worker_id,
            concurrency=self.max_concurrent_jobs,
            poll_interval=self.poll_interval_seconds,
            lease_duration=self.lease_duration_seconds,
        )

    async def stop(self, timeout_seconds: float = 10.0) -> None:
        """Gracefully stop the worker daemon and wait for active jobs to complete."""
        if not self._is_running:
            return

        logger.info("Stopping WorkerDaemon gracefully", worker_id=self.worker_id)
        self._stop_event.set()
        self._is_running = False

        # Cancel main loop and reaper
        if self._worker_loop_task and not self._worker_loop_task.done():
            self._worker_loop_task.cancel()
        if self._reaper_task and not self._reaper_task.done():
            self._reaper_task.cancel()

        # Await completion of in-flight processing tasks
        if self._active_tasks:
            logger.info("Waiting for in-flight tasks to finish", active_count=len(self._active_tasks))
            try:
                await asyncio.wait_for(
                    asyncio.gather(*self._active_tasks, return_exceptions=True),
                    timeout=timeout_seconds,
                )
            except asyncio.TimeoutError:
                logger.warning("Timed out waiting for in-flight tasks; cancelling them", count=len(self._active_tasks))
                for task in self._active_tasks:
                    task.cancel()
                await asyncio.gather(*self._active_tasks, return_exceptions=True)

        self._active_tasks.clear()
        logger.info("WorkerDaemon stopped cleanly", worker_id=self.worker_id)

    async def _worker_loop(self) -> None:
        """Continuous polling and job dispatch loop."""
        while not self._stop_event.is_set():
            try:
                # Clean up completed tasks
                self._active_tasks = {t for t in self._active_tasks if not t.done()}

                if len(self._active_tasks) < self.max_concurrent_jobs:
                    job = await self.queue.claim_job(
                        worker_id=self.worker_id,
                        lease_duration_seconds=self.lease_duration_seconds,
                        organization_id=self.organization_id,
                    )

                    if job is not None:
                        task = asyncio.create_task(
                            self._process_job_safe(job),
                            name=f"job-{job.id}",
                        )
                        self._active_tasks.add(task)
                        continue
                    else:
                        # No jobs available, wait poll interval
                        try:
                            await asyncio.wait_for(self._stop_event.wait(), timeout=self.poll_interval_seconds)
                        except asyncio.TimeoutError:
                            pass
                else:
                    # Concurrency limit reached, brief sleep to yield
                    await asyncio.sleep(0.2)

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Unexpected error in worker loop", worker_id=self.worker_id, error=str(exc))
                await asyncio.sleep(1.0)

    async def _process_job_safe(self, job: JobRecord) -> None:
        """
        Execute a claimed job with active lease heartbeats and failure containment.
        """
        heartbeat_task = asyncio.create_task(
            self._heartbeat_loop(job),
            name=f"heartbeat-{job.id}",
        )

        try:
            await self.orchestrator.process_document_job(job)
            await self.queue.complete_job(
                job_id=job.id,
                organization_id=job.organization_id,
                fencing_token=job.fencing_token,
            )
        except Exception as exc:
            logger.error(
                "Document processing failed",
                job_id=str(job.id),
                doc_id=str(job.document_id),
                error=str(exc),
            )
            await self.queue.fail_job(
                job_id=job.id,
                organization_id=job.organization_id,
                fencing_token=job.fencing_token,
                error_message=str(exc),
            )
        finally:
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass

    async def _heartbeat_loop(self, job: JobRecord) -> None:
        """Periodically renew lease while job is active."""
        interval = max(5.0, self.lease_duration_seconds / 3.0)
        while not self._stop_event.is_set():
            try:
                await asyncio.sleep(interval)
                success = await self.queue.heartbeat(
                    job_id=job.id,
                    organization_id=job.organization_id,
                    fencing_token=job.fencing_token,
                    lease_duration_seconds=self.lease_duration_seconds,
                )
                if not success:
                    logger.warning(
                        "Heartbeat rejected: fencing token invalidated",
                        job_id=str(job.id),
                        fencing_token=str(job.fencing_token),
                    )
                    break
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.warning("Heartbeat tick failed", job_id=str(job.id), error=str(exc))

    async def _reaper_loop(self) -> None:
        """Periodic background task to reclaim abandoned or expired job leases."""
        while not self._stop_event.is_set():
            try:
                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=self.reaper_interval_seconds)
                except asyncio.TimeoutError:
                    pass

                if self._stop_event.is_set():
                    break

                await self.queue.reap_stale_leases()

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Error in lease reaper loop", error=str(exc))
                await asyncio.sleep(5.0)
