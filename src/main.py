"""
FastAPI application factory and lifecycle management for LedgerOne.
"""
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
import structlog

from src.config import get_settings
from src.dns import init_dns_resolver
from src.logging import configure_logging
from src.middleware import RequestCorrelationMiddleware
from src.exceptions import (
    LedgerOneException,
    ledgerone_exception_handler,
    http_exception_handler,
    validation_exception_handler,
    unhandled_exception_handler,
)
from src.db.pool import db_manager
from src.api.router import api_router

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan managing database pool and services."""
    settings = get_settings()

    # 1. Initialize DNS resolution fallback
    init_dns_resolver()

    # 2. Configure structured JSON logging
    configure_logging(log_level=settings.LOG_LEVEL)
    logger.info(
        "Starting LedgerOne Application",
        env=settings.ENV,
        debug=settings.DEBUG,
        version="3.2.0",
    )

    # 3. Connect to PostgreSQL connection pool
    try:
        await db_manager.connect(
            dsn=settings.DATABASE_URL,
            min_size=settings.DB_POOL_MIN_SIZE,
            max_size=settings.DB_POOL_MAX_SIZE,
            timeout=settings.DB_POOL_TIMEOUT,
            max_inactive_connection_lifetime=settings.DB_POOL_MAX_INACTIVE_LIFETIME,
        )
    except Exception as exc:
        logger.error("Failed to connect to database during startup", error=str(exc))
        # Keep application alive to serve liveness and report degraded readiness

    yield

    # 4. Graceful shutdown: close database connection pool
    logger.info("Shutting down LedgerOne Application")
    await db_manager.disconnect()


def create_app() -> FastAPI:
    """FastAPI application factory."""
    settings = get_settings()

    app = FastAPI(
        title="LedgerOne Enterprise Document Intelligence Platform",
        description="Master API Foundation for LedgerOne (Phase 1)",
        version="3.2.0",
        docs_url="/docs" if settings.ENV != "production" else None,
        redoc_url="/redoc" if settings.ENV != "production" else None,
        lifespan=lifespan,
    )

    # 1. Request correlation and metrics middleware
    app.add_middleware(RequestCorrelationMiddleware)

    # 2. CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 3. Exception handlers
    app.add_exception_handler(LedgerOneException, ledgerone_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    # 4. Include routers
    app.include_router(api_router)

    @app.get("/", tags=["Root"], summary="Platform root overview")
    async def root():
        return {
            "name": "LedgerOne",
            "version": "3.2.0",
            "description": "Enterprise Document Intelligence Platform",
            "docs": "/docs" if settings.ENV != "production" else None,
            "status": "operational",
        }

    return app


app = create_app()
