"""
Document Retrieval REST API Endpoints (Phase 6).
Provides hybrid dense/lexical search and document indexing triggers
under strict workspace-level RBAC and tenant RLS isolation.
"""
from __future__ import annotations

from typing import Any, Dict, List
import uuid
from fastapi import APIRouter, Depends, Path, status

from src.auth.dependencies import get_current_user, get_tenant_context, get_workspace_role
from src.db.rls import TenantContext
from src.exceptions import AuthorizationError
from src.services.retrieval_service import (
    RetrievalQueryRequest,
    RetrievedChunkResponse,
    retrieval_service,
)

router = APIRouter(
    prefix="/organizations/{org_id}/workspaces/{ws_id}/retrieval",
    tags=["Retrieval & Search"],
)

INDEX_ROLES = {"ORGANIZATION_ADMIN", "WORKSPACE_ADMIN", "DOCUMENT_MANAGER", "REVIEWER"}
READ_ROLES = {"ORGANIZATION_ADMIN", "WORKSPACE_ADMIN", "DOCUMENT_MANAGER", "REVIEWER", "ANALYST", "VIEWER"}


@router.post(
    "/index-document/{doc_id}",
    status_code=status.HTTP_200_OK,
    summary="Index Document Chunks into pgvector",
)
async def index_document_endpoint(
    org_id: uuid.UUID = Path(...),
    ws_id: uuid.UUID = Path(...),
    doc_id: uuid.UUID = Path(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> Dict[str, Any]:
    """Chunk, embed, and store document content in pgvector and tsvector."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    if ws_role not in INDEX_ROLES:
        raise AuthorizationError(f"Role '{ws_role}' does not have indexing permissions")

    return await retrieval_service.index_document(
        org_id=org_id,
        ws_id=ws_id,
        doc_id=doc_id,
        actor_id=uuid.UUID(str(current_user["id"])),
        actor_role=ws_role,
    )


@router.post(
    "/search",
    response_model=List[RetrievedChunkResponse],
    status_code=status.HTTP_200_OK,
    summary="Hybrid Semantic & Lexical Document Search",
)
async def search_endpoint(
    payload: RetrievalQueryRequest,
    org_id: uuid.UUID = Path(...),
    ws_id: uuid.UUID = Path(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> List[RetrievedChunkResponse]:
    """Execute Reciprocal Rank Fusion search combining dense vectors and full-text keyword matching."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    if ws_role not in READ_ROLES:
        raise AuthorizationError(f"Role '{ws_role}' does not have search permissions")

    return await retrieval_service.search_hybrid(
        org_id=org_id,
        ws_id=ws_id,
        payload=payload,
        actor_id=uuid.UUID(str(current_user["id"])),
        actor_role=ws_role,
    )
