"""
Transaction-scoped database session and context management with RLS enforcement.
"""
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional
import asyncpg
import structlog

from src.db.pool import db_manager
from src.db.rls import TenantContext, apply_tenant_rls_context
from src.exceptions import DatabaseError

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def transactional_tenant_session(
    pool: Optional[asyncpg.Pool] = None,
    context: Optional[TenantContext] = None,
    enforce_app_role: bool = True,
    app_role_name: str = "ledgerone_app",
) -> AsyncGenerator[asyncpg.Connection, None]:
    """
    Context manager providing a transaction-scoped database connection.
    Enforces unprivileged role and transaction-local RLS settings.
    All tenant settings and role modifications automatically revert upon COMMIT or ROLLBACK.
    """
    target_pool = pool or db_manager.pool
    async with target_pool.acquire() as conn:
        async with conn.transaction():
            await apply_tenant_rls_context(
                conn=conn,
                context=context,
                enforce_app_role=enforce_app_role,
                app_role_name=app_role_name,
            )
            try:
                yield conn
            except Exception:
                # Transaction will automatically rollback, restoring transaction-local settings
                raise


async def get_tenant_db_session(
    context: Optional[TenantContext] = None,
) -> AsyncGenerator[asyncpg.Connection, None]:
    """FastAPI dependency for obtaining a transaction-scoped tenant connection."""
    async with transactional_tenant_session(context=context) as conn:
        yield conn
