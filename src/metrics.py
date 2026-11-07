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

# LLM Inference & Provider Observability
LLM_REQUESTS_TOTAL = Counter(
    "ledgerone_llm_requests_total",
    "Total LLM generation requests partitioned by provider, model, and outcome status",
    ["provider", "model", "status"],  # status: success, error, blocked, abstained
)

LLM_REQUEST_DURATION_SECONDS = Histogram(
    "ledgerone_llm_request_duration_seconds",
    "Latency distribution of LLM provider generation requests in seconds",
    ["provider", "model"],
    buckets=(0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0),
)

LLM_FALLBACK_TOTAL = Counter(
    "ledgerone_llm_fallback_total",
    "Total fallbacks to the deterministic extractive engine",
    ["reason", "source_provider"],  # reason: missing_credentials, rate_limit, timeout, provider_error, malformed_json
)

LLM_TOKENS_TOTAL = Counter(
    "ledgerone_llm_tokens_total",
    "Total input and output tokens consumed across LLM inference providers",
    ["type", "model"],  # type: prompt, completion
)


def metrics_response() -> Response:
    """Generate Prometheus metrics text response."""
    return Response(
        content=generate_latest(REGISTRY),
        media_type=CONTENT_TYPE_LATEST,
    )
