"""
Tenant context definition and transaction-local RLS configuration.
"""
from dataclasses import dataclass
from typing import Any, Dict
from uuid import UUID
import asyncpg
import structlog

logger = structlog.get_logger(__name__)


@dataclass(frozen=True)
class TenantContext:
    """Immutable transaction-scoped tenant identity context."""

    org_id: UUID | str | None = None
    user_id: UUID | str | None = None
    workspace_id: UUID | str | None = None
    user_role: str | None = None
    is_platform_admin: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "org_id": str(self.org_id) if self.org_id else None,
            "user_id": str(self.user_id) if self.user_id else None,
            "workspace_id": str(self.workspace_id) if self.workspace_id else None,
            "user_role": self.user_role,
            "is_platform_admin": self.is_platform_admin,
        }


async def apply_tenant_rls_context(
    conn: asyncpg.Connection,
    context: TenantContext | None = None,
    enforce_app_role: bool = True,
    app_role_name: str = "ledgerone_app",
) -> None:
    """
    Apply transaction-local settings for PostgreSQL Row-Level Security.
    Uses `is_local=true` in `set_config` so settings automatically revert upon COMMIT or ROLLBACK.
    """
    if enforce_app_role:
        # Switch to unprivileged role inside transaction; rolbypassrls=False
        await conn.execute(f"SET LOCAL ROLE {app_role_name}")

    if context is None:
        # Fail-closed: explicitly clear or set empty transaction-local variables
        await conn.execute("SELECT set_config('app.current_org_id', '', true)")
        await conn.execute("SELECT set_config('app.current_user_id', '', true)")
        await conn.execute("SELECT set_config('app.current_workspace_id', '', true)")
        await conn.execute("SELECT set_config('app.current_user_role', '', true)")
        await conn.execute("SELECT set_config('app.is_platform_admin', '', true)")
        return

    # Set parameterized transaction-local variables
    org_val = str(context.org_id) if context.org_id else ""
    user_val = str(context.user_id) if context.user_id else ""
    ws_val = str(context.workspace_id) if context.workspace_id else ""
    role_val = str(context.user_role) if context.user_role else ""
    admin_val = "true" if context.is_platform_admin else "false"

    await conn.execute("SELECT set_config('app.current_org_id', $1, true)", org_val)
    await conn.execute("SELECT set_config('app.current_user_id', $1, true)", user_val)
    await conn.execute("SELECT set_config('app.current_workspace_id', $1, true)", ws_val)
    await conn.execute("SELECT set_config('app.current_user_role', $1, true)", role_val)
    await conn.execute("SELECT set_config('app.is_platform_admin', $1, true)", admin_val)
