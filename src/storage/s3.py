"""
S3 Object Storage service client and health checks.
"""
import time
from typing import Any, Dict, Optional
import boto3
import botocore.exceptions
import structlog

from src.config import get_settings

logger = structlog.get_logger(__name__)


class StorageManager:
    """Manages S3 object storage client and health telemetry."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self._client: Optional[Any] = None

    @property
    def client(self) -> Any:
        if self._client is None:
            if not self.settings.AWS_ACCESS_KEY_ID or not self.settings.AWS_SECRET_ACCESS_KEY:
                return None

            session = boto3.session.Session()
            self._client = session.client(
                service_name="s3",
                aws_access_key_id=self.settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=self.settings.AWS_SECRET_ACCESS_KEY,
                endpoint_url=self.settings.AWS_ENDPOINT_URL_S3,
                region_name=self.settings.AWS_REGION,
            )
        return self._client

    def check_health(self) -> Dict[str, Any]:
        """Verify S3 connectivity and bucket accessibility."""
        if not self.client:
            return {
                "status": "unconfigured",
                "message": "S3 credentials are not configured",
            }

        start = time.perf_counter()
        bucket = self.settings.S3_BUCKET_ASSETS
        try:
            # Quick metadata inspection
            self.client.head_bucket(Bucket=bucket)
            latency_ms = round((time.perf_counter() - start) * 1000.0, 2)
            return {
                "status": "healthy",
                "bucket": bucket,
                "latency_ms": latency_ms,
            }
        except botocore.exceptions.ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "Unknown")
            latency_ms = round((time.perf_counter() - start) * 1000.0, 2)
            # If 403 or 404, we can still report status accurately
            return {
                "status": "degraded" if code == "403" else "unhealthy",
                "bucket": bucket,
                "error_code": code,
                "latency_ms": latency_ms,
            }
        except Exception as exc:
            latency_ms = round((time.perf_counter() - start) * 1000.0, 2)
            logger.error("Storage health check failed", error=str(exc))
            return {
                "status": "unhealthy",
                "bucket": bucket,
                "error": str(exc),
                "latency_ms": latency_ms,
            }


storage_manager = StorageManager()
