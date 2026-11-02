"""
Workspace management service with RBAC enforcement and membership allocation.
"""
from typing import Any, Dict, List, Optional
import uuid
import asyncpg
import structlog

from src.db.pool import db_manager
from src.db.rls import TenantContext
from src.db.session import transactional_tenant_session
from src.exceptions import ConflictError, NotFoundError, AuthorizationError

logger = structlog.get_logger(__name__)

VALID_WORKSPACE_ROLES = {
    "WORKSPACE_ADMIN",
    "DOCUMENT_MANAGER",
    "REVIEWER",
    "ANALYST",
    "VIEWER",
}


class WorkspaceService:
    """Service managing workspaces and granular workspace memberships."""

    def __init__(self, pool: asyncpg.Pool | None = None) -> None:
        self._pool = pool

    @property
    def pool(self) -> asyncpg.Pool:
        return self._pool or db_manager.pool

    async def create_workspace(
        self,
        org_id: uuid.UUID | str,
        name: str,
        slug: str,
        actor_id: uuid.UUID | str,
    ) -> Dict[str, Any]:
        """Create a new workspace inside an organization."""
        org_uuid = uuid.UUID(str(org_id))
        actor_uuid = uuid.UUID(str(actor_id))
        slug_clean = slug.strip().lower()
        name_clean = name.strip()
        ws_id = uuid.uuid4()

        context = TenantContext(org_id=org_uuid, user_id=actor_uuid, user_role="ORGANIZATION_ADMIN")

        async with transactional_tenant_session(self.pool, context=context, enforce_app_role=True) as conn:
            # Check slug uniqueness in this organization
            existing = await conn.fetchval(
                "SELECT id FROM workspaces WHERE organization_id = $1 AND slug = $2",
                org_uuid,
                slug_clean,
            )
            if existing:
                raise ConflictError("Workspace slug already exists in this organization", details={"slug": slug_clean})

            row = await conn.fetchrow(
                """
                INSERT INTO workspaces (id, organization_id, name, slug)
                VALUES ($1, $2, $3, $4)
                RETURNING id, organization_id, name, slug, created_at
                """,
                ws_id,
                org_uuid,
                name_clean,
                slug_clean,
            )

            # Assign actor as WORKSPACE_ADMIN
            await conn.execute(
                """
                INSERT INTO workspace_memberships (organization_id, workspace_id, user_id, role, is_active)
                VALUES ($1, $2, $3, 'WORKSPACE_ADMIN', TRUE)
                """,
                org_uuid,
                ws_id,
                actor_uuid,
            )

            logger.info("Workspace created", org_id=str(org_uuid), ws_id=str(ws_id), slug=slug_clean)
            return dict(row)

    async def list_workspaces(
        self,
        org_id: uuid.UUID | str,
        user_id: uuid.UUID | str,
        user_role: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """List workspaces in organization visible to user."""
        org_uuid = uuid.UUID(str(org_id))
        user_uuid = uuid.UUID(str(user_id))
        context = TenantContext(org_id=org_uuid, user_id=user_uuid, user_role=user_role)

        async with transactional_tenant_session(self.pool, context=context, enforce_app_role=True) as conn:
            if user_role == "ORGANIZATION_ADMIN":
                rows = await conn.fetch(
                    """
                    SELECT id, organization_id, name, slug, created_at
                    FROM workspaces
                    WHERE organization_id = $1 AND is_archived = FALSE
                    ORDER BY name ASC
                    """,
                    org_uuid,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT w.id, w.organization_id, w.name, w.slug, w.created_at, wm.role as user_role
                    FROM workspaces w
                    INNER JOIN workspace_memberships wm 
                        ON w.organization_id = wm.organization_id AND w.id = wm.workspace_id
                    WHERE w.organization_id = $1 AND wm.user_id = $2 AND wm.is_active = TRUE AND w.is_archived = FALSE
                    ORDER BY w.name ASC
                    """,
                    org_uuid,
                    user_uuid,
                )
            return [dict(r) for r in rows]

    async def add_workspace_member(
        self,
        org_id: uuid.UUID | str,
        workspace_id: uuid.UUID | str,
        user_id: uuid.UUID | str,
        role: str,
        actor_id: uuid.UUID | str,
    ) -> Dict[str, Any]:
        """Add a member to a workspace with one of the 5 granular roles."""
        org_uuid = uuid.UUID(str(org_id))
        ws_uuid = uuid.UUID(str(workspace_id))
        target_user = uuid.UUID(str(user_id))
        actor_uuid = uuid.UUID(str(actor_id))

        if role not in VALID_WORKSPACE_ROLES:
            raise ConflictError(
                f"Invalid workspace role: '{role}'. Must be one of: {VALID_WORKSPACE_ROLES}"
            )

        context = TenantContext(org_id=org_uuid, user_id=actor_uuid, user_role="ORGANIZATION_ADMIN")

        async with transactional_tenant_session(self.pool, context=context, enforce_app_role=True) as conn:
            # Confirm user belongs to the parent organization
            org_member = await conn.fetchval(
                "SELECT id FROM organization_memberships WHERE organization_id = $1 AND user_id = $2 AND is_active = TRUE",
                org_uuid,
                target_user,
            )
            if not org_member:
                raise ConflictError("User must be an active member of the organization before joining a workspace")

            membership = await conn.fetchrow(
                """
                INSERT INTO workspace_memberships (organization_id, workspace_id, user_id, role, is_active)
                VALUES ($1, $2, $3, $4, TRUE)
                ON CONFLICT (organization_id, workspace_id, user_id)
                DO UPDATE SET role = EXCLUDED.role, is_active = TRUE
                RETURNING id, organization_id, workspace_id, user_id, role, is_active, created_at
                """,
                org_uuid,
                ws_uuid,
                target_user,
                role,
            )
            return dict(membership)


workspace_service = WorkspaceService()
