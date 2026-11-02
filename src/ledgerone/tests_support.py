"""
Test routes supporting exception handler validation.
"""
from fastapi import APIRouter
from ledgerone.exceptions import TenantIsolationError, NotFoundError

error_router = APIRouter(prefix="/test-errors", tags=["Testing"])


@error_router.get("/custom-exception")
async def trigger_custom_exception():
    raise TenantIsolationError(
        "Cross-tenant access strictly forbidden", details={"target_org": "org-99"}
    )


@error_router.get("/not-found")
async def trigger_not_found():
    raise NotFoundError("Requested entity does not exist", details={"id": "item-123"})


@error_router.get("/unhandled-error")
async def trigger_unhandled_error():
    raise ZeroDivisionError("Simulated server division by zero")
