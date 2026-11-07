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
    if context is None:
        # Fail-closed: explicitly clear or set empty transaction-local variables in a single round-trip
        sql = """
            SELECT set_config('app.current_org_id', '', true);
            SELECT set_config('app.current_user_id', '', true);
            SELECT set_config('app.current_workspace_id', '', true);
            SELECT set_config('app.current_user_role', '', true);
            SELECT set_config('app.is_platform_admin', '', true);
        """
        if enforce_app_role:
            sql = f"SET LOCAL ROLE {app_role_name};\n" + sql
        await conn.execute(sql)
        return

    # Set sanitized transaction-local variables in a single network round-trip
    import re
    org_val = re.sub(r"[^a-zA-Z0-9_\-]", "", str(context.org_id)) if context.org_id else ""
    user_val = re.sub(r"[^a-zA-Z0-9_\-]", "", str(context.user_id)) if context.user_id else ""
    ws_val = re.sub(r"[^a-zA-Z0-9_\-]", "", str(context.workspace_id)) if context.workspace_id else ""
    role_val = re.sub(r"[^a-zA-Z0-9_\-]", "", str(context.user_role)) if context.user_role else ""
    admin_val = "true" if context.is_platform_admin else "false"

    sql = f"""
        SELECT set_config('app.current_org_id', '{org_val}', true);
        SELECT set_config('app.current_user_id', '{user_val}', true);
        SELECT set_config('app.current_workspace_id', '{ws_val}', true);
        SELECT set_config('app.current_user_role', '{role_val}', true);
        SELECT set_config('app.is_platform_admin', '{admin_val}', true);
    """
    if enforce_app_role:
        sql = f"SET LOCAL ROLE {app_role_name};\n" + sql

    await conn.execute(sql)
