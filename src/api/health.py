"""
Health, readiness, and hardware capability endpoints.
"""
from datetime import datetime, timezone
from typing import Any, Dict
from fastapi import APIRouter, Response, status
import structlog

from src.db.pool import db_manager
from src.storage.s3 import storage_manager

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/health", tags=["Health & Observability"])


@router.get("", summary="Overall health probe")
async def health_check() -> Dict[str, Any]:
    """Lightweight health probe indicating service is reachable."""
    return {
        "status": "healthy",
        "service": "ledgerone-api",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/live", summary="Liveness probe")
async def liveness() -> Dict[str, Any]:
    """Lightweight liveness probe indicating the HTTP service is alive."""
    return {
        "status": "ok",
        "service": "ledgerone-api",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/ready", summary="Readiness probe")
async def readiness(response: Response) -> Dict[str, Any]:
    """
    Readiness probe validating database and storage dependencies.
    Readiness is strictly independent of GPU or worker status.
    """
    db_status: Dict[str, Any] = {}
    try:
        latency = await db_manager.ping()
        db_status = {"status": "healthy", "latency_ms": latency}
    except Exception as exc:
        db_status = {"status": "unhealthy", "error": str(exc)}

    storage_status = storage_manager.check_health()

    is_ready = db_status.get("status") == "healthy"

    if not is_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ready" if is_ready else "not_ready",
        "database": db_status,
        "storage": storage_status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/capabilities", summary="System capabilities and GPU reporting")
async def capabilities() -> Dict[str, Any]:
    """Detailed capability breakdown reporting API, DB, storage, worker, and GPU status."""
    # GPU Capability inspection
    gpu_info: Dict[str, Any] = {
        "cuda_available": False,
        "device_name": "CPU",
        "mode": "cpu_fallback",
    }

    try:
        import torch

        if torch.cuda.is_available():
            device_name = torch.cuda.get_device_name(0)
            total_memory_mb = round(torch.cuda.get_device_properties(0).total_memory / (1024 * 1024), 2)
            allocated_mb = round(torch.cuda.memory_allocated(0) / (1024 * 1024), 2)
            gpu_info = {
                "cuda_available": True,
                "device_name": device_name,
                "cuda_version": torch.version.cuda,
                "total_vram_mb": total_memory_mb,
                "allocated_vram_mb": allocated_mb,
                "mode": "gpu_accelerated",
            }
    except ImportError:
        gpu_info["error"] = "PyTorch not installed"
    except Exception as exc:
        gpu_info["error"] = str(exc)

    # Database info
    db_info: Dict[str, Any] = {"status": "unknown"}
    try:
        latency = await db_manager.ping()
        pool = db_manager.pool
        db_info = {
            "status": "healthy",
            "latency_ms": latency,
            "pool_size": pool.get_size(),
            "pool_idle": pool.get_idle_size(),
        }
    except Exception as exc:
        db_info = {"status": "unhealthy", "error": str(exc)}

    # Storage info
    storage_info = storage_manager.check_health()

    # Worker info (Phase 1 baseline)
    worker_info = {
        "status": "uninitialized",
        "phase": "Phase 1: Foundation (Worker queue deferred to Phase 3)",
    }

    return {
        "service": "ledgerone-api",
        "version": "3.2.0",
        "database": db_info,
        "storage": storage_info,
        "worker": worker_info,
        "gpu": gpu_info,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
