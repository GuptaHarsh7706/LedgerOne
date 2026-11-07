"""
Cross-Document Intelligence REST API Endpoints (Phase 7).
Provides document linking, 3-way matching execution, version diff comparison,
and workspace financial spend analytics under strict RBAC and tenant RLS.
"""
from __future__ import annotations

from typing import Any, Dict, List
import uuid
from fastapi import APIRouter, Depends, Path, Query, status

from src.auth.dependencies import get_current_user, get_tenant_context, get_workspace_role
from src.auth.permissions import Permission, assert_permission
from src.db.rls import TenantContext
from src.exceptions import AuthorizationError
from src.intelligence.document_diff import DocumentComparisonResult
from src.intelligence.matching_engine import ThreeWayMatchSummary
from src.services.cross_document_service import (
    CompareDocumentsRequest,
    LinkDocumentsRequest,
    ThreeWayMatchRequest,
    cross_document_service,
)

router = APIRouter(
    prefix="/organizations/{org_id}/workspaces/{ws_id}/cross-document",
    tags=["Cross-Document Intelligence"],
)

OPERATOR_ROLES = {"ORGANIZATION_ADMIN", "WORKSPACE_ADMIN", "DOCUMENT_MANAGER", "REVIEWER"}
READ_ROLES = {"ORGANIZATION_ADMIN", "WORKSPACE_ADMIN", "DOCUMENT_MANAGER", "REVIEWER", "ANALYST", "VIEWER"}


@router.post(
    "/link/{source_doc_id}",
    status_code=status.HTTP_200_OK,
    summary="Link Two Documents with a Typed Relationship",
)
async def link_documents_endpoint(
    payload: LinkDocumentsRequest,
    org_id: uuid.UUID = Path(...),
    ws_id: uuid.UUID = Path(...),
    source_doc_id: uuid.UUID = Path(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> Dict[str, Any]:
    """Establish a relationship (e.g. PO -> Invoice, Invoice -> Receipt, Version Revision)."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.MATCHING_CREATE.value, is_platform_admin=current_user.get("is_platform_admin", False))

    return await cross_document_service.link_documents(
        org_id=org_id,
        ws_id=ws_id,
        source_doc_id=source_doc_id,
        payload=payload,
        actor_id=uuid.UUID(str(current_user["id"])),
        actor_role=ws_role,
    )


@router.get(
    "/relationships/{doc_id}",
    status_code=status.HTTP_200_OK,
    summary="List Document Relationships",
)
async def list_relationships_endpoint(
    org_id: uuid.UUID = Path(...),
    ws_id: uuid.UUID = Path(...),
    doc_id: uuid.UUID = Path(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> List[Dict[str, Any]]:
    """List incoming and outgoing relationships for a document."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.MATCHING_READ.value, is_platform_admin=current_user.get("is_platform_admin", False))

    return await cross_document_service.list_relationships(
        org_id=org_id,
        ws_id=ws_id,
        doc_id=doc_id,
        actor_id=uuid.UUID(str(current_user["id"])),
        actor_role=ws_role,
    )


@router.post(
    "/match-3way/{invoice_doc_id}",
    response_model=ThreeWayMatchSummary,
    status_code=status.HTTP_200_OK,
    summary="Execute Autonomous 3-Way Matching",
)
async def match_3way_endpoint(
    payload: ThreeWayMatchRequest,
    org_id: uuid.UUID = Path(...),
    ws_id: uuid.UUID = Path(...),
    invoice_doc_id: uuid.UUID = Path(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> ThreeWayMatchSummary:
    """Execute 3-way matching across Invoice, Purchase Order, and Goods Receipt Note."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.MATCHING_CREATE.value, is_platform_admin=current_user.get("is_platform_admin", False))

    return await cross_document_service.execute_three_way_match(
        org_id=org_id,
        ws_id=ws_id,
        invoice_doc_id=invoice_doc_id,
        payload=payload,
        actor_id=uuid.UUID(str(current_user["id"])),
        actor_role=ws_role,
    )


@router.post(
    "/match-3way/{invoice_doc_id}/settle",
    status_code=status.HTTP_200_OK,
    summary="Authorize Settlement for 3-Way Matched Transaction",
)
async def settle_3way_endpoint(
    org_id: uuid.UUID = Path(...),
    ws_id: uuid.UUID = Path(...),
    invoice_doc_id: uuid.UUID = Path(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> Dict[str, Any]:
    """Authorize settlement of 3-way matched invoice. Enforces RBAC and Dual-Custody SoD."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.MATCHING_RESOLVE.value, is_platform_admin=current_user.get("is_platform_admin", False))

    return await cross_document_service.settle_three_way_match(
        org_id=org_id,
        ws_id=ws_id,
        invoice_doc_id=invoice_doc_id,
        actor_id=uuid.UUID(str(current_user["id"])),
        actor_role=ws_role,
    )


@router.post(
    "/compare",
    response_model=DocumentComparisonResult,
    status_code=status.HTTP_200_OK,
    summary="Compare Two Documents or Versions",
)
async def compare_documents_endpoint(
    payload: CompareDocumentsRequest,
    doc_a_id: uuid.UUID = Query(..., description="First document UUID (Doc A)"),
    org_id: uuid.UUID = Path(...),
    ws_id: uuid.UUID = Path(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> DocumentComparisonResult:
    """Compare two documents or versions and produce a granular field and line-item diff."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.MATCHING_READ.value, is_platform_admin=current_user.get("is_platform_admin", False))

    return await cross_document_service.execute_document_comparison(
        org_id=org_id,
        ws_id=ws_id,
        doc_a_id=doc_a_id,
        doc_b_id=payload.document_b_id,
        actor_id=uuid.UUID(str(current_user["id"])),
        actor_role=ws_role,
    )


@router.get(
    "/analytics",
    status_code=status.HTTP_200_OK,
    summary="Get Workspace Financial Spend & Discrepancy Analytics",
)
async def get_analytics_endpoint(
    org_id: uuid.UUID = Path(...),
    ws_id: uuid.UUID = Path(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> Dict[str, Any]:
    """Retrieve aggregate workspace financial metrics, top vendors, and discrepancy exposure."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.ANALYTICS_READ.value, is_platform_admin=current_user.get("is_platform_admin", False))

    return await cross_document_service.get_workspace_spend_analytics(
        org_id=org_id,
        ws_id=ws_id,
        actor_id=uuid.UUID(str(current_user["id"])),
        actor_role=ws_role,
    )
