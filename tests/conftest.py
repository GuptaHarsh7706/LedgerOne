"""
Pytest fixtures and configuration for LedgerOne test suite.
"""
import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from dotenv import load_dotenv

from src.config import get_settings
from src.dns import init_dns_resolver
from src.db.pool import db_manager
from src.main import create_app
from src.tests_support import error_router

# Load environment & DNS patch
load_dotenv(r"D:\Projects\LedgerOne\.env")
init_dns_resolver()


@pytest_asyncio.fixture(scope="session")
async def app_instance():
    """Create and initialize FastAPI application with session-scoped database pool."""
    app = create_app()
    app.include_router(error_router)
    settings = get_settings()

    # Use direct/unpooled connection string for tests
    dsn = settings.DATABASE_URL_UNPOOLED or settings.DATABASE_URL

    await db_manager.connect(
        dsn=dsn,
        min_size=2,
        max_size=5,
        timeout=20.0,
    )

    yield app

    await db_manager.disconnect()


@pytest_asyncio.fixture(scope="session")
async def client(app_instance):
    """HTTP client for testing API endpoints."""
    transport = ASGITransport(app=app_instance, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


@pytest_asyncio.fixture(scope="session")
async def db_pool(app_instance):
    """Provide AsyncPG connection pool."""
    return db_manager.pool
