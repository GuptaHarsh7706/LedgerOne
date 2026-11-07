"""
REST API Endpoints for Human-in-the-Loop (HITL) Verification & Reviewer Workflows (Phase 5).
Provides review queue management, field & line-item corrections, real-time invariant re-evaluations,
INV-010 auditor overrides, dual-custody approval, rejection, and reopening.
"""
from typing import Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, Depends, Query, status

from src.auth.dependencies import get_current_user, get_tenant_context, get_workspace_role
from src.auth.permissions import Permission, assert_permission
from src.db.rls import TenantContext
from src.intelligence.verification_schemas import (
    FieldCorrectionRequest,
    LineItemCorrectionRequest,
    InvariantOverrideRequest,
    DocumentRejectRequest,
    DocumentReopenRequest,
    ReviewQueueItemResponse,
    DocumentReviewDetailResponse,
)
from src.services.verification_service import verification_service

router = APIRouter(
    prefix="/organizations/{org_id}/workspaces/{ws_id}",
    tags=["Human-in-the-Loop Verification & Review"],
)


@router.get("/review-queue", response_model=List[ReviewQueueItemResponse])
async def get_review_queue(
    org_id: uuid.UUID,
    ws_id: uuid.UUID,
    status: Optional[str] = Query(None, description="Filter by document status (e.g. NEEDS_REVIEW, IN_REVIEW)"),
    category: Optional[str] = Query(None, description="Filter by document category (e.g. INVOICE, RECEIPT)"),
    min_confidence: Optional[float] = Query(None, ge=0.0, le=1.0, description="Minimum confidence threshold"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> List[ReviewQueueItemResponse]:
    """Retrieve workspace documents awaiting reviewer attention or verification."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.REVIEW_READ.value, is_platform_admin=current_user.get("is_platform_admin", False))

    return await verification_service.get_review_queue(
        org_id=org_id,
        ws_id=ws_id,
        actor_id=current_user["id"],
        actor_role=ws_role,
        status=status,
        category=category,
        min_confidence=min_confidence,
        limit=limit,
        offset=offset,
    )


@router.get("/documents/{document_id}/review", response_model=DocumentReviewDetailResponse)
async def get_document_review_detail(
    org_id: uuid.UUID,
    ws_id: uuid.UUID,
    document_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> DocumentReviewDetailResponse:
    """Retrieve full reviewer inspection bundle including preview URL, extracted fields, table, and invariants."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.REVIEW_READ.value, is_platform_admin=current_user.get("is_platform_admin", False))

    return await verification_service.get_document_review_detail(
        org_id=org_id,
        ws_id=ws_id,
        doc_id=document_id,
        actor_id=current_user["id"],
        actor_role=ws_role,
    )


@router.post("/documents/{document_id}/review/claim", status_code=status.HTTP_200_OK)
async def claim_document_for_review(
    org_id: uuid.UUID,
    ws_id: uuid.UUID,
    document_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> Dict[str, Any]:
    """Claim a document for active review, transitioning status from NEEDS_REVIEW to IN_REVIEW."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.REVIEW_CLAIM.value, is_platform_admin=current_user.get("is_platform_admin", False))

    return await verification_service.claim_document_for_review(
        org_id=org_id,
        ws_id=ws_id,
        doc_id=document_id,
        actor_id=current_user["id"],
        actor_role=ws_role,
    )


@router.post("/documents/{document_id}/review/correct-field", status_code=status.HTTP_200_OK)
async def correct_field(
    org_id: uuid.UUID,
    ws_id: uuid.UUID,
    document_id: uuid.UUID,
    payload: FieldCorrectionRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> Dict[str, Any]:
    """Apply manual correction to an individual extracted scalar field and trigger real-time invariant evaluation."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.REVIEW_CORRECT.value, is_platform_admin=current_user.get("is_platform_admin", False))

    return await verification_service.correct_field(
        org_id=org_id,
        ws_id=ws_id,
        doc_id=document_id,
        payload=payload,
        actor_id=current_user["id"],
        actor_role=ws_role,
    )


@router.post("/documents/{document_id}/review/correct-line-item", status_code=status.HTTP_200_OK)
async def correct_line_item(
    org_id: uuid.UUID,
    ws_id: uuid.UUID,
    document_id: uuid.UUID,
    payload: LineItemCorrectionRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> Dict[str, Any]:
    """Apply manual correction to a cell in the extracted line items table and recalculate invariants."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.REVIEW_CORRECT.value, is_platform_admin=current_user.get("is_platform_admin", False))

    return await verification_service.correct_line_item(
        org_id=org_id,
        ws_id=ws_id,
        doc_id=document_id,
        payload=payload,
        actor_id=current_user["id"],
        actor_role=ws_role,
    )


@router.post("/documents/{document_id}/review/override-invariant", status_code=status.HTTP_200_OK)
async def override_invariant(
    org_id: uuid.UUID,
    ws_id: uuid.UUID,
    document_id: uuid.UUID,
    payload: InvariantOverrideRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> Dict[str, Any]:
    """Apply an auditor override to an allowable failing invariant with mandatory compliance rationale (INV-010)."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.REVIEW_OVERRIDE.value, is_platform_admin=current_user.get("is_platform_admin", False))

    return await verification_service.apply_auditor_override(
        org_id=org_id,
        ws_id=ws_id,
        doc_id=document_id,
        payload=payload,
        actor_id=current_user["id"],
        actor_role=ws_role,
    )


@router.post("/documents/{document_id}/review/verify", status_code=status.HTTP_200_OK)
async def verify_document(
    org_id: uuid.UUID,
    ws_id: uuid.UUID,
    document_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> Dict[str, Any]:
    """Mark document as VERIFIED after confirming all fields and resolving invariant failures."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.REVIEW_VERIFY.value, is_platform_admin=current_user.get("is_platform_admin", False))

    return await verification_service.verify_document(
        org_id=org_id,
        ws_id=ws_id,
        doc_id=document_id,
        actor_id=current_user["id"],
        actor_role=ws_role,
    )


@router.post("/documents/{document_id}/review/approve", status_code=status.HTTP_200_OK)
async def approve_document(
    org_id: uuid.UUID,
    ws_id: uuid.UUID,
    document_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> Dict[str, Any]:
    """
    Approve document into terminal accounting status.
    Enforces canonical RBAC (admin only) and Segregation of Duties dual-custody barriers.
    """
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.REVIEW_APPROVE.value, is_platform_admin=current_user.get("is_platform_admin", False))

    return await verification_service.approve_document(
        org_id=org_id,
        ws_id=ws_id,
        doc_id=document_id,
        actor_id=current_user["id"],
        actor_role=ws_role,
    )


@router.post("/documents/{document_id}/review/reject", status_code=status.HTTP_200_OK)
async def reject_document(
    org_id: uuid.UUID,
    ws_id: uuid.UUID,
    document_id: uuid.UUID,
    payload: DocumentRejectRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> Dict[str, Any]:
    """Formally reject document with mandatory operational justification."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.REVIEW_REJECT.value, is_platform_admin=current_user.get("is_platform_admin", False))

    return await verification_service.reject_document(
        org_id=org_id,
        ws_id=ws_id,
        doc_id=document_id,
        payload=payload,
        actor_id=current_user["id"],
        actor_role=ws_role,
    )


@router.post("/documents/{document_id}/review/reopen", status_code=status.HTTP_200_OK)
async def reopen_document(
    org_id: uuid.UUID,
    ws_id: uuid.UUID,
    document_id: uuid.UUID,
    payload: DocumentReopenRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> Dict[str, Any]:
    """Reopen a rejected or archived document for re-review."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.REVIEW_REOPEN.value, is_platform_admin=current_user.get("is_platform_admin", False))

    return await verification_service.reopen_document(
        org_id=org_id,
        ws_id=ws_id,
        doc_id=document_id,
        payload=payload,
        actor_id=current_user["id"],
        actor_role=ws_role,
    )
