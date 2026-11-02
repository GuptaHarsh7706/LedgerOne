"""
Unit tests for request correlation middleware and centralized exception handling.
"""
import pytest


@pytest.mark.asyncio
async def test_request_id_generation(client):
    response = await client.get("/health/live")
    assert response.status_code == 200
    assert "X-Request-ID" in response.headers
    assert len(response.headers["X-Request-ID"]) > 10


@pytest.mark.asyncio
async def test_request_id_propagation(client):
    custom_id = "test-custom-request-id-98765"
    response = await client.get("/health/live", headers={"X-Request-ID": custom_id})
    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == custom_id


@pytest.mark.asyncio
async def test_custom_exception_envelope(client):
    response = await client.get("/test-errors/custom-exception")
    assert response.status_code == 403
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "TENANT_ISOLATION_ERROR"
    assert "Cross-tenant access" in data["error"]["message"]
    assert data["error"]["details"]["target_org"] == "org-99"
    assert "request_id" in data["error"]


@pytest.mark.asyncio
async def test_not_found_exception_envelope(client):
    response = await client.get("/test-errors/not-found")
    assert response.status_code == 404
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "RESOURCE_NOT_FOUND"
    assert "request_id" in data["error"]


@pytest.mark.asyncio
async def test_unhandled_exception_envelope(client):
    response = await client.get("/test-errors/unhandled-error")
    assert response.status_code == 500
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "INTERNAL_SERVER_ERROR"
    assert "An unexpected server error occurred" in data["error"]["message"]
    assert "request_id" in data["error"]
