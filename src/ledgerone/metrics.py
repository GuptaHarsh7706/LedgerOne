"""
Prometheus metrics instrumentation module.
"""
from prometheus_client import (
    Counter,
    Histogram,
    Gauge,
    generate_latest,
    CONTENT_TYPE_LATEST,
    REGISTRY,
)
from fastapi import Response

# HTTP metrics
HTTP_REQUESTS_TOTAL = Counter(
    "ledgerone_http_requests_total",
    "Total HTTP requests received",
    ["method", "endpoint", "status_code"],
)

HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "ledgerone_http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "endpoint"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)

# Database pool metrics
DB_POOL_CONNECTIONS = Gauge(
    "ledgerone_db_pool_connections",
    "Database connection pool size and status",
    ["state"],  # 'total', 'free', 'used'
)

DB_QUERY_DURATION_SECONDS = Histogram(
    "ledgerone_db_query_duration_seconds",
    "Database query execution latency in seconds",
    ["operation"],
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5),
)


def metrics_response() -> Response:
    """Generate Prometheus metrics text response."""
    return Response(
        content=generate_latest(REGISTRY),
        media_type=CONTENT_TYPE_LATEST,
    )
