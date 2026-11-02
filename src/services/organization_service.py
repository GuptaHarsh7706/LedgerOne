"""
Organization management service with tenant creation, membership bootstrap, and listing.
"""
from typing import Any, Dict, List
import uuid
import asyncpg
import structlog

from src.db.pool import db_manager
from src.db.rls import TenantContext
from src.db.session import transactional_tenant_session
from src.exceptions import ConflictError, NotFoundError, AuthorizationError

logger = structlog.get_logger(__name__)


class OrganizationService:
    """Service managing multi-tenant organizations and memberships."""

    def __init__(self, pool: asyncpg.Pool | None = None) -> None:
        self._pool = pool

    @property
    def pool(self) -> asyncpg.Pool:
        return self._pool or db_manager.pool

    async def create_organization(
        self,
        name: str,
        slug: str,
        creator_user_id: uuid.UUID | str,
    ) -> Dict[str, Any]:
        """
        Create a new tenant organization and automatically assign the creator as ORGANIZATION_ADMIN.
        Executes inside a single atomic transaction.
        """
        user_uuid = uuid.UUID(str(creator_user_id))
        slug_clean = slug.strip().lower()
        name_clean = name.strip()
        org_id = uuid.uuid4()

        # Context allows organization insert by authenticated user
        context = TenantContext(user_id=user_uuid, org_id=org_id, is_platform_admin=False)

        async with transactional_tenant_session(self.pool, context=context, enforce_app_role=True) as conn:
            # Check slug uniqueness
            existing = await conn.fetchval("SELECT id FROM organizations WHERE slug = $1", slug_clean)
            if existing:
                raise ConflictError("Organization slug already exists", details={"slug": slug_clean})

            # 1. Insert organization
            org_row = await conn.fetchrow(
                """
                INSERT INTO organizations (id, name, slug)
                VALUES ($1, $2, $3)
                RETURNING id, name, slug, is_active, created_at
                """,
                org_id,
                name_clean,
                slug_clean,
            )

            # 2. Add creator as ORGANIZATION_ADMIN
            await conn.execute(
                """
                INSERT INTO organization_memberships (organization_id, user_id, role, is_active)
                VALUES ($1, $2, 'ORGANIZATION_ADMIN', TRUE)
                """,
                org_id,
                user_uuid,
            )

            logger.info("Organization created", org_id=str(org_id), slug=slug_clean, creator=str(user_uuid))
            return dict(org_row)

    async def list_user_organizations(self, user_id: uuid.UUID | str) -> List[Dict[str, Any]]:
        """List all active organizations the user belongs to."""
        user_uuid = uuid.UUID(str(user_id))
        context = TenantContext(user_id=user_uuid)

        async with transactional_tenant_session(self.pool, context=context, enforce_app_role=True) as conn:
            rows = await conn.fetch(
                """
                SELECT o.id, o.name, o.slug, o.is_active, o.created_at, om.role as user_role
                FROM organizations o
                INNER JOIN organization_memberships om ON o.id = om.organization_id
                WHERE om.user_id = $1 AND om.is_active = TRUE AND o.is_active = TRUE
                ORDER BY o.name ASC
                """,
                user_uuid,
            )
            return [dict(r) for r in rows]

    async def get_organization(self, org_id: uuid.UUID | str, user_id: uuid.UUID | str) -> Dict[str, Any]:
        """Retrieve organization details."""
        org_uuid = uuid.UUID(str(org_id))
        user_uuid = uuid.UUID(str(user_id))
        context = TenantContext(org_id=org_uuid, user_id=user_uuid)

        async with transactional_tenant_session(self.pool, context=context, enforce_app_role=True) as conn:
            row = await conn.fetchrow(
                """
                SELECT o.id, o.name, o.slug, o.is_active, o.created_at, om.role as user_role
                FROM organizations o
                LEFT JOIN organization_memberships om ON o.id = om.organization_id AND om.user_id = $2
                WHERE o.id = $1 AND o.is_active = TRUE
                """,
                org_uuid,
                user_uuid,
            )
            if not row:
                raise NotFoundError("Organization not found", details={"org_id": str(org_uuid)})
            return dict(row)

    async def add_organization_member(
        self,
        org_id: uuid.UUID | str,
        user_id: uuid.UUID | str,
        role: str,
        actor_id: uuid.UUID | str,
    ) -> Dict[str, Any]:
        """Add a member to an organization (requires ORGANIZATION_ADMIN)."""
        org_uuid = uuid.UUID(str(org_id))
        target_user = uuid.UUID(str(user_id))
        actor_uuid = uuid.UUID(str(actor_id))

        if role not in {"ORGANIZATION_ADMIN", "MEMBER"}:
            raise ConflictError(f"Invalid organization role: {role}")

        context = TenantContext(org_id=org_uuid, user_id=actor_uuid, user_role="ORGANIZATION_ADMIN")

        async with transactional_tenant_session(self.pool, context=context, enforce_app_role=True) as conn:
            try:
                membership = await conn.fetchrow(
                    """
                    INSERT INTO organization_memberships (organization_id, user_id, role, is_active)
                    VALUES ($1, $2, $3, TRUE)
                    ON CONFLICT (organization_id, user_id)
                    DO UPDATE SET role = EXCLUDED.role, is_active = TRUE
                    RETURNING id, organization_id, user_id, role, is_active, created_at
                    """,
                    org_uuid,
                    target_user,
                    role,
                )
                if not membership:
                    raise ConflictError("Failed to add or update organization membership")
                return dict(membership)
            except asyncpg.exceptions.ForeignKeyViolationError:
                raise NotFoundError("User does not exist", details={"user_id": str(target_user)})

    async def list_organization_members(self, org_id: uuid.UUID | str, actor_id: uuid.UUID | str) -> List[Dict[str, Any]]:
        """List all members of an organization."""
        org_uuid = uuid.UUID(str(org_id))
        actor_uuid = uuid.UUID(str(actor_id))
        context = TenantContext(org_id=org_uuid, user_id=actor_uuid)

        async with transactional_tenant_session(self.pool, context=context, enforce_app_role=True) as conn:
            rows = await conn.fetch(
                """
                SELECT u.id, u.email, u.full_name, om.role, om.is_active, om.created_at
                FROM organization_memberships om
                JOIN users u ON om.user_id = u.id
                WHERE om.organization_id = $1 AND om.is_active = TRUE
                ORDER BY u.full_name ASC
                """,
                org_uuid,
            )
            return [dict(r) for r in rows]


organization_service = OrganizationService()
