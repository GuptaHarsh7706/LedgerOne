"""
S3 Object Storage service client and health checks.
Supports direct uploads, downloads, presigned URLs, and mock fallback for tests.
"""
import io
import time
from typing import Any, Dict, Optional
import boto3
from botocore.config import Config
import botocore.exceptions
import structlog

from src.config import get_settings
from src.dns import init_dns_resolver

logger = structlog.get_logger(__name__)


class StorageManager:
    """Manages S3 object storage client and health telemetry."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self._client: Optional[Any] = None
        # In-memory storage cache for local testing / offline fallback
        self._local_storage: Dict[str, bytes] = {}

    @property
    def client(self) -> Any:
        if self._client is None:
            if not self.settings.AWS_ACCESS_KEY_ID or not self.settings.AWS_SECRET_ACCESS_KEY:
                return None

            init_dns_resolver()
            session = boto3.session.Session()
            s3_config = Config(
                s3={"addressing_style": "path"},
                signature_version="s3v4",
                connect_timeout=5,
                read_timeout=15,
            )
            self._client = session.client(
                service_name="s3",
                aws_access_key_id=self.settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=self.settings.AWS_SECRET_ACCESS_KEY,
                endpoint_url=self.settings.AWS_ENDPOINT_URL_S3,
                region_name=self.settings.AWS_REGION,
                config=s3_config,
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

    def upload_bytes(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload binary data to S3 bucket or local memory fallback."""
        bucket = self.settings.S3_BUCKET_ASSETS
        if self.client:
            try:
                self.client.put_object(
                    Bucket=bucket,
                    Key=key,
                    Body=data,
                    ContentType=content_type,
                )
                logger.info("Object uploaded to S3", bucket=bucket, key=key, size=len(data))
                return key
            except Exception as exc:
                logger.warning("S3 upload failed, using local storage fallback", key=key, error=str(exc))

        self._local_storage[key] = data
        return key

    def download_bytes(self, key: str) -> bytes:
        """Download binary data from S3 or local memory fallback."""
        bucket = self.settings.S3_BUCKET_ASSETS
        if self.client:
            try:
                response = self.client.get_object(Bucket=bucket, Key=key)
                return response["Body"].read()
            except Exception as exc:
                logger.warning("S3 download failed, checking local storage", key=key, error=str(exc))

        if key in self._local_storage:
            return self._local_storage[key]
        raise FileNotFoundError(f"Object not found in storage: {key}")

    def generate_presigned_upload_url(
        self,
        key: str,
        expires_in: int = 900,
    ) -> str:
        """Generate a presigned PUT URL for direct client upload."""
        bucket = self.settings.S3_BUCKET_ASSETS
        if self.client:
            try:
                url = self.client.generate_presigned_url(
                    ClientMethod="put_object",
                    Params={"Bucket": bucket, "Key": key},
                    ExpiresIn=expires_in,
                )
                return str(url)
            except Exception as exc:
                logger.warning("Failed to generate presigned upload URL", key=key, error=str(exc))

        return f"http://localhost:8000/api/v1/mock-storage/upload/{key}"

    def generate_presigned_download_url(
        self,
        key: str,
        expires_in: int = 3600,
    ) -> str:
        """Generate a presigned GET URL for secure document preview."""
        bucket = self.settings.S3_BUCKET_ASSETS
        if self.client:
            try:
                url = self.client.generate_presigned_url(
                    ClientMethod="get_object",
                    Params={"Bucket": bucket, "Key": key},
                    ExpiresIn=expires_in,
                )
                return str(url)
            except Exception as exc:
                logger.warning("Failed to generate presigned download URL", key=key, error=str(exc))

        return f"http://localhost:8000/api/v1/mock-storage/download/{key}"

    def delete_object(self, key: str) -> None:
        """Delete an object from S3 or local storage."""
        bucket = self.settings.S3_BUCKET_ASSETS
        if self.client:
            try:
                self.client.delete_object(Bucket=bucket, Key=key)
            except Exception as exc:
                logger.warning("S3 delete failed", key=key, error=str(exc))

        self._local_storage.pop(key, None)

    def object_exists(self, key: str) -> bool:
        """Check if an object exists in storage."""
        bucket = self.settings.S3_BUCKET_ASSETS
        if self.client:
            try:
                self.client.head_object(Bucket=bucket, Key=key)
                return True
            except Exception:
                pass
        return key in self._local_storage


storage_manager = StorageManager()
