"""
Organization management API endpoints.
"""
from typing import Any, Dict, List, Optional
import uuid
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, status

from src.auth.dependencies import get_current_user, require_role
from src.db.rls import TenantContext
from src.services.organization_service import organization_service

router = APIRouter(prefix="/organizations", tags=["Organizations & Tenants"])


class CreateOrgRequest(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    slug: str = Field(min_length=2, max_length=100, pattern=r"^[a-z0-9-]+$")


class AddOrgMemberRequest(BaseModel):
    user_id: uuid.UUID
    role: str = Field(default="MEMBER", pattern=r"^(ORGANIZATION_ADMIN|MEMBER)$")


@router.post("", status_code=status.HTTP_201_CREATED, summary="Create organization")
async def create_organization(
    payload: CreateOrgRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """Create a new multi-tenant organization. Creator becomes ORGANIZATION_ADMIN."""
    org = await organization_service.create_organization(
        name=payload.name,
        slug=payload.slug,
        creator_user_id=current_user["id"],
    )
    return {
        "status": "success",
        "organization": {
            "id": str(org["id"]),
            "name": org["name"],
            "slug": org["slug"],
            "is_active": org["is_active"],
            "created_at": org["created_at"].isoformat() if org.get("created_at") else None,
        },
    }


@router.get("", summary="List organizations for current user")
async def list_organizations(
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """List all organizations the current user belongs to."""
    orgs = await organization_service.list_user_organizations(user_id=current_user["id"])
    return [
        {
            "id": str(o["id"]),
            "name": o["name"],
            "slug": o["slug"],
            "user_role": o.get("user_role"),
            "created_at": o["created_at"].isoformat() if o.get("created_at") else None,
        }
        for o in orgs
    ]


@router.get("/{org_id}", summary="Get organization details")
async def get_organization(
    org_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """Get details for a specific organization."""
    org = await organization_service.get_organization(org_id=org_id, user_id=current_user["id"])
    return {
        "id": str(org["id"]),
        "name": org["name"],
        "slug": org["slug"],
        "user_role": org.get("user_role"),
        "is_active": org["is_active"],
    }


@router.post("/{org_id}/members", status_code=status.HTTP_201_CREATED, summary="Add organization member")
async def add_member(
    org_id: uuid.UUID,
    payload: AddOrgMemberRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(require_role(["ORGANIZATION_ADMIN"])),
) -> Dict[str, Any]:
    """Add or update member in organization (requires ORGANIZATION_ADMIN)."""
    membership = await organization_service.add_organization_member(
        org_id=org_id,
        user_id=payload.user_id,
        role=payload.role,
        actor_id=current_user["id"],
    )
    return {
        "status": "success",
        "membership": {
            "id": str(membership["id"]),
            "organization_id": str(membership["organization_id"]),
            "user_id": str(membership["user_id"]),
            "role": membership["role"],
        },
    }


@router.get("/{org_id}/members", summary="List organization members")
async def list_members(
    org_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(require_role(["ORGANIZATION_ADMIN", "MEMBER"])),
) -> List[Dict[str, Any]]:
    """List all active members of the organization."""
    members = await organization_service.list_organization_members(
        org_id=org_id,
        actor_id=current_user["id"],
    )
    return [
        {
            "id": str(m["id"]),
            "email": m["email"],
            "full_name": m["full_name"],
            "role": m["role"],
            "created_at": m["created_at"].isoformat() if m.get("created_at") else None,
        }
        for m in members
    ]
