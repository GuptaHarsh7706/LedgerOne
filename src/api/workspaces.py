"""
Workspace management API endpoints.
"""
from typing import Any, Dict, List
import uuid
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, status

from src.auth.dependencies import get_current_user, require_org_permission, require_role
from src.auth.permissions import Permission
from src.db.rls import TenantContext
from src.services.workspace_service import workspace_service, VALID_WORKSPACE_ROLES

router = APIRouter(prefix="/organizations/{org_id}/workspaces", tags=["Workspaces"])


class CreateWorkspaceRequest(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    slug: str = Field(min_length=2, max_length=100, pattern=r"^[a-z0-9-]+$")


class AddWorkspaceMemberRequest(BaseModel):
    user_id: uuid.UUID
    role: str = Field(description="Granular workspace role")


@router.post("", status_code=status.HTTP_201_CREATED, summary="Create workspace")
async def create_workspace(
    org_id: uuid.UUID,
    payload: CreateWorkspaceRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(require_org_permission(Permission.ORG_WORKSPACES_MANAGE.value)),
) -> Dict[str, Any]:
    """Create a new workspace within the organization (requires ORGANIZATION_ADMIN)."""
    ws = await workspace_service.create_workspace(
        org_id=org_id,
        name=payload.name,
        slug=payload.slug,
        actor_id=current_user["id"],
    )
    return {
        "status": "success",
        "workspace": {
            "id": str(ws["id"]),
            "organization_id": str(ws["organization_id"]),
            "name": ws["name"],
            "slug": ws["slug"],
            "created_at": ws["created_at"].isoformat() if ws.get("created_at") else None,
        },
    }


@router.get("", summary="List workspaces")
async def list_workspaces(
    org_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(require_org_permission(Permission.ORG_READ.value)),
) -> List[Dict[str, Any]]:
    """List workspaces in the organization accessible to the current user."""
    workspaces = await workspace_service.list_workspaces(
        org_id=org_id,
        user_id=current_user["id"],
        user_role=tenant.user_role,
    )
    return [
        {
            "id": str(w["id"]),
            "organization_id": str(w["organization_id"]),
            "name": w["name"],
            "slug": w["slug"],
            "user_role": w.get("user_role"),
            "created_at": w["created_at"].isoformat() if w.get("created_at") else None,
        }
        for w in workspaces
    ]


@router.post("/{workspace_id}/members", status_code=status.HTTP_201_CREATED, summary="Add workspace member")
async def add_workspace_member(
    org_id: uuid.UUID,
    workspace_id: uuid.UUID,
    payload: AddWorkspaceMemberRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(require_org_permission(Permission.WS_MEMBERS_MANAGE.value)),
) -> Dict[str, Any]:
    """Assign a user to a workspace with a specific role."""
    membership = await workspace_service.add_workspace_member(
        org_id=org_id,
        workspace_id=workspace_id,
        user_id=payload.user_id,
        role=payload.role,
        actor_id=current_user["id"],
    )
    return {
        "status": "success",
        "membership": {
            "id": str(membership["id"]),
            "organization_id": str(membership["organization_id"]),
            "workspace_id": str(membership["workspace_id"]),
            "user_id": str(membership["user_id"]),
            "role": membership["role"],
        },
    }
