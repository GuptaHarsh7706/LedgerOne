"""
Centralized exception hierarchy and error response envelopes for LedgerOne.
"""
from typing import Any, Dict
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
import structlog

logger = structlog.get_logger(__name__)


class LedgerOneException(Exception):
    """Base exception for all LedgerOne application errors."""

    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    error_code: str = "INTERNAL_SERVER_ERROR"

    def __init__(
        self,
        message: str = "An unexpected error occurred",
        details: Dict[str, Any] | None = None,
        status_code: int | None = None,
    ):
        super().__init__(message)
        self.message = message
        self.details = details or {}
        if status_code is not None:
            self.status_code = status_code


class DatabaseError(LedgerOneException):
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    error_code = "DATABASE_ERROR"


class AuthenticationError(LedgerOneException):
    status_code = status.HTTP_401_UNAUTHORIZED
    error_code = "AUTHENTICATION_REQUIRED"


class AuthorizationError(LedgerOneException):
    status_code = status.HTTP_403_FORBIDDEN
    error_code = "INSUFFICIENT_PERMISSIONS"


class ConflictError(LedgerOneException):
    status_code = status.HTTP_409_CONFLICT
    error_code = "RESOURCE_CONFLICT"


class TenantIsolationError(LedgerOneException):
    status_code = status.HTTP_403_FORBIDDEN
    error_code = "TENANT_ISOLATION_ERROR"


class NotFoundError(LedgerOneException):
    status_code = status.HTTP_404_NOT_FOUND
    error_code = "RESOURCE_NOT_FOUND"


class ValidationError(LedgerOneException):
    status_code = 422
    error_code = "VALIDATION_ERROR"


class ConfigurationError(LedgerOneException):
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    error_code = "CONFIGURATION_ERROR"


class ServiceUnavailableError(LedgerOneException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    error_code = "SERVICE_UNAVAILABLE"


def format_error_response(
    code: str,
    message: str,
    request_id: str | None = None,
    details: Dict[str, Any] | None = None,
    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
) -> JSONResponse:
    """Format standard JSON error envelope."""
    payload = {
        "error": {
            "code": code,
            "message": message,
            "request_id": request_id,
            "details": details or {},
        }
    }
    return JSONResponse(status_code=status_code, content=payload)


async def ledgerone_exception_handler(request: Request, exc: LedgerOneException) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    logger.warning(
        "Application exception handled",
        error_code=exc.error_code,
        message=exc.message,
        details=exc.details,
        status_code=exc.status_code,
        request_id=request_id,
    )
    return format_error_response(
        code=exc.error_code,
        message=exc.message,
        request_id=request_id,
        details=exc.details,
        status_code=exc.status_code,
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    return format_error_response(
        code=f"HTTP_{exc.status_code}",
        message=str(exc.detail),
        request_id=request_id,
        status_code=exc.status_code,
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    return format_error_response(
        code="REQUEST_VALIDATION_ERROR",
        message="Invalid request parameters or payload",
        request_id=request_id,
        details={"validation_errors": exc.errors()},
        status_code=422,
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    logger.exception(
        "Unhandled server exception",
        error=str(exc),
        request_id=request_id,
    )
    return format_error_response(
        code="INTERNAL_SERVER_ERROR",
        message="An unexpected server error occurred",
        request_id=request_id,
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
