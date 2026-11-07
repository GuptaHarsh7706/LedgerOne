"""
AsyncPG connection pool manager with health check and Prometheus metrics.
"""
import socket
import ssl
import time
from typing import Optional
import asyncpg
import structlog

# Resilient DNS fallback for restricted ISP environments refusing *.neon.tech resolution
_orig_getaddrinfo = socket.getaddrinfo

def _resilient_getaddrinfo(host, port, *args, **kwargs):
    try:
        return _orig_getaddrinfo(host, port, *args, **kwargs)
    except socket.gaierror:
        if isinstance(host, str) and ("neon.tech" in host or "aws" in host):
            try:
                import dns.resolver
                resolver = dns.resolver.Resolver()
                resolver.nameservers = ["8.8.8.8", "1.1.1.1"]
                answers = resolver.resolve(host, "A")
                for rdata in answers:
                    return _orig_getaddrinfo(rdata.address, port, *args, **kwargs)
            except Exception:
                pass
        raise

socket.getaddrinfo = _resilient_getaddrinfo

from src.metrics import DB_POOL_CONNECTIONS, DB_QUERY_DURATION_SECONDS
from src.exceptions import DatabaseError

logger = structlog.get_logger(__name__)


class DatabaseManager:
    """Manages AsyncPG connection pool lifecycle and telemetry."""

    def __init__(self) -> None:
        self._pool: Optional[asyncpg.Pool] = None

    @property
    def pool(self) -> asyncpg.Pool:
        if self._pool is None:
            raise DatabaseError("Database connection pool is not initialized")
        return self._pool

    async def connect(
        self,
        dsn: str,
        min_size: int = 2,
        max_size: int = 10,
        timeout: float = 30.0,
        max_inactive_connection_lifetime: float = 300.0,
    ) -> None:
        """Initialize the AsyncPG connection pool."""
        if self._pool is not None:
            logger.info("Database pool already initialized")
            return

        logger.info("Initializing database connection pool", min_size=min_size, max_size=max_size)

        ssl_ctx: ssl.SSLContext | bool = False
        if "sslmode=require" in dsn or "channel_binding=" in dsn or "neon.tech" in dsn:
            ssl_ctx = ssl.create_default_context()

        try:
            self._pool = await asyncpg.create_pool(
                dsn=dsn,
                min_size=min_size,
                max_size=max_size,
                timeout=timeout,
                max_inactive_connection_lifetime=max_inactive_connection_lifetime,
                ssl=ssl_ctx,
                statement_cache_size=0,
            )
            self.update_metrics()
            logger.info("Database connection pool initialized successfully")
        except Exception as exc:
            logger.exception("Failed to connect to PostgreSQL", error=str(exc))
            raise DatabaseError(f"Failed to connect to PostgreSQL: {exc}") from exc

    async def disconnect(self) -> None:
        """Close all connections in the pool."""
        if self._pool is not None:
            logger.info("Closing database connection pool")
            await self._pool.close()
            self._pool = None
            DB_POOL_CONNECTIONS.labels(state="total").set(0)
            DB_POOL_CONNECTIONS.labels(state="free").set(0)
            DB_POOL_CONNECTIONS.labels(state="used").set(0)
            logger.info("Database connection pool closed")

    async def ping(self) -> float:
        """Ping database and return round-trip latency in milliseconds."""
        if self._pool is None:
            raise DatabaseError("Database pool is not connected")

        start = time.perf_counter()
        try:
            async with self._pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
            latency = (time.perf_counter() - start) * 1000.0
            DB_QUERY_DURATION_SECONDS.labels(operation="ping").observe(latency / 1000.0)
            self.update_metrics()
            return round(latency, 2)
        except Exception as exc:
            logger.error("Database ping failed", error=str(exc))
            raise DatabaseError(f"Database ping failed: {exc}") from exc

    def update_metrics(self) -> None:
        """Update Prometheus gauges with connection pool status."""
        if self._pool is not None:
            size = self._pool.get_size()
            idle = self._pool.get_idle_size()
            used = size - idle
            DB_POOL_CONNECTIONS.labels(state="total").set(size)
            DB_POOL_CONNECTIONS.labels(state="free").set(idle)
            DB_POOL_CONNECTIONS.labels(state="used").set(used)


db_manager = DatabaseManager()
