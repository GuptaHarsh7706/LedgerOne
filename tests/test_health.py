"""
Unit and integration tests for /health, /metrics and root endpoints.
"""
import pytest


@pytest.mark.asyncio
async def test_root_endpoint(client):
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "LedgerOne"
    assert data["version"] == "3.2.0"
    assert data["status"] == "operational"


@pytest.mark.asyncio
async def test_liveness_endpoint(client):
    response = await client.get("/health/live")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "ledgerone-api"
    assert "timestamp" in data


@pytest.mark.asyncio
async def test_readiness_endpoint(client):
    response = await client.get("/health/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["database"]["status"] == "healthy"
    assert "latency_ms" in data["database"]
    assert "storage" in data
    # Verify readiness is independent of GPU
    assert "gpu" not in data


@pytest.mark.asyncio
async def test_capabilities_endpoint(client):
    response = await client.get("/health/capabilities")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "ledgerone-api"
    assert data["version"] == "3.2.0"
    assert "database" in data
    assert "storage" in data
    assert "worker" in data
    assert data["worker"]["status"] == "uninitialized"
    assert "gpu" in data
    assert "cuda_available" in data["gpu"]
    assert "mode" in data["gpu"]


@pytest.mark.asyncio
async def test_prometheus_metrics_endpoint(client):
    response = await client.get("/metrics")
    assert response.status_code == 200
    text = response.text
    assert "ledgerone_http_requests_total" in text
    assert "ledgerone_http_request_duration_seconds" in text
