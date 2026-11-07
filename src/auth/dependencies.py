"""
FastAPI authentication and RBAC authorization dependencies.
"""
from typing import Any, Callable, Dict, List, Optional
import uuid
from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import structlog

from src.auth.jwt import decode_access_token
from src.db.pool import db_manager
from src.db.rls import TenantContext
from src.exceptions import AuthenticationError, AuthorizationError

logger = structlog.get_logger(__name__)
security_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
) -> Dict[str, Any]:
    """Validate Bearer access token and return authenticated user."""
    if not credentials or not credentials.credentials:
        raise AuthenticationError("Authentication credentials were not provided")

    payload = decode_access_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise AuthenticationError("Token payload missing subject identifier")

    async with db_manager.pool.acquire() as conn:
        user = await conn.fetchrow(
            """
            SELECT id, email, full_name, is_platform_admin, is_active
            FROM users WHERE id = $1
            """,
            uuid.UUID(user_id),
        )
        if not user or not user["is_active"]:
            raise AuthenticationError("User not found or account is deactivated")

        user_dict = dict(user)
        # Attach token claims for quick reference
        user_dict["token_org_id"] = payload.get("org_id")
        user_dict["token_role"] = payload.get("role")
        return user_dict


async def get_tenant_context(
    current_user: Dict[str, Any] = Depends(get_current_user),
    x_organization_id: Optional[str] = Header(None, alias="X-Organization-ID"),
) -> TenantContext:
    """
    Resolve active tenant context from request headers or access token.
    Validates organization membership and active role.
    """
    target_org_str = x_organization_id or current_user.get("token_org_id")
    user_id = current_user["id"]
    is_platform_admin = current_user.get("is_platform_admin", False)

    if not target_org_str:
        # User is authenticated but hasn't selected an active organization
        return TenantContext(
            user_id=user_id,
            org_id=None,
            user_role=None,
            is_platform_admin=is_platform_admin,
        )

    try:
        org_uuid = uuid.UUID(target_org_str)
    except ValueError:
        raise AuthorizationError("Invalid Organization UUID format")

    # If platform admin, grant immediate admin context
    if is_platform_admin:
        return TenantContext(
            org_id=org_uuid,
            user_id=user_id,
            user_role="ORGANIZATION_ADMIN",
            is_platform_admin=True,
        )

    # Validate active organization membership
    async with db_manager.pool.acquire() as conn:
        membership = await conn.fetchrow(
            """
            SELECT role, is_active FROM organization_memberships
            WHERE organization_id = $1 AND user_id = $2
            """,
            org_uuid,
            user_id,
        )

        if not membership or not membership["is_active"]:
            raise AuthorizationError("User is not an active member of the requested organization")

        return TenantContext(
            org_id=org_uuid,
            user_id=user_id,
            user_role=membership["role"],
            is_platform_admin=False,
        )


def require_role(allowed_roles: List[str]) -> Callable:
    """Enforce organization role authorization."""

    async def role_checker(tenant: TenantContext = Depends(get_tenant_context)) -> TenantContext:
        if tenant.is_platform_admin:
            return tenant

        if not tenant.org_id:
            raise AuthorizationError("Active organization context required")

        if tenant.user_role not in allowed_roles:
            raise AuthorizationError(
                f"Role '{tenant.user_role}' does not have required permissions. Required: {allowed_roles}"
            )
        return tenant

    return role_checker


def require_org_permission(permission: str) -> Callable:
    """Enforce organization-level granular permission check."""

    async def permission_checker(tenant: TenantContext = Depends(get_tenant_context)) -> TenantContext:
        if tenant.is_platform_admin:
            return tenant

        if not tenant.org_id:
            raise AuthorizationError("Active organization context required")

        from src.auth.permissions import assert_permission
        assert_permission(tenant.user_role, permission, is_platform_admin=tenant.is_platform_admin)
        return tenant

    return permission_checker


async def get_workspace_role(
    org_id: uuid.UUID,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    is_platform_admin: bool = False,
    org_role: Optional[str] = None,
) -> str:
    """
    Resolve a user's effective role within a workspace.
    Platform admins automatically possess full administrative authority.
    Organization admins possess full administrative authority within their own organization.
    Ordinary members must have an active workspace_membership in this specific workspace.
    """
    if is_platform_admin:
        return "ORGANIZATION_ADMIN"

    async with db_manager.pool.acquire() as conn:
        # First verify user is an active member of the target organization
        org_member = await conn.fetchrow(
            """
            SELECT role, is_active FROM organization_memberships
            WHERE organization_id = $1 AND user_id = $2
            """,
            org_id,
            user_id,
        )
        if not org_member or not org_member["is_active"]:
            raise AuthorizationError("User is not an active member of the requested organization")

        # If user is ORGANIZATION_ADMIN in the target organization, grant full admin authority
        if org_member["role"] == "ORGANIZATION_ADMIN":
            return "ORGANIZATION_ADMIN"

        # Otherwise verify explicit workspace membership
        ws_member = await conn.fetchrow(
            """
            SELECT role, is_active FROM workspace_memberships
            WHERE organization_id = $1 AND workspace_id = $2 AND user_id = $3
            """,
            org_id,
            workspace_id,
            user_id,
        )
        if not ws_member or not ws_member["is_active"]:
            raise AuthorizationError("User is not an active member of this workspace")
        return ws_member["role"]

