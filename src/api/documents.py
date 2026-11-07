"""
Document Management REST API Endpoints.
Supports direct uploads, presigned upload intents, completion, library listing,
document retrieval with preview URLs, soft deletion, and recovery.
"""
from typing import Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from pydantic import BaseModel, Field

from src.auth.dependencies import get_current_user, get_tenant_context, get_workspace_role
from src.auth.permissions import Permission, assert_permission
from src.db.rls import TenantContext
from src.exceptions import AuthorizationError, ValidationError
from src.services.document_service import document_service

router = APIRouter(
    prefix="/organizations/{org_id}/workspaces/{ws_id}/documents",
    tags=["Document Management"],
)


class UploadIntentRequest(BaseModel):
    filename: str = Field(..., min_length=1, max_length=500, description="Original filename with extension")
    file_size_bytes: int = Field(..., gt=0, le=50 * 1024 * 1024, description="File size in bytes (max 50MB)")
    sha256_hash: str = Field(..., min_length=64, max_length=64, description="Hex SHA-256 hash of file content")
    mime_type: str = Field(..., description="Declared MIME type")
    category: Optional[str] = Field(None, max_length=50, description="Optional document category: INVOICE, CONTRACT, etc.")


class DocumentResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    workspace_id: uuid.UUID
    filename: str
    file_size_bytes: int
    mime_type: str
    sha256_hash: str
    status: str
    category: Optional[str] = None
    metadata: Optional[Any] = None
    created_at: Any
    updated_at: Optional[Any] = None
    preview_url: Optional[str] = None


@router.post("/upload-intent", status_code=status.HTTP_201_CREATED)
async def create_upload_intent(
    org_id: uuid.UUID,
    ws_id: uuid.UUID,
    payload: UploadIntentRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> Dict[str, Any]:
    """Initiate a two-stage presigned direct S3 upload."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.DOC_UPLOAD.value, is_platform_admin=current_user.get("is_platform_admin", False))

    result = await document_service.create_upload_intent(
        org_id=org_id,
        workspace_id=ws_id,
        filename=payload.filename,
        file_size_bytes=payload.file_size_bytes,
        sha256_hash=payload.sha256_hash,
        mime_type=payload.mime_type,
        actor_id=current_user["id"],
        actor_role=ws_role,
        category=payload.category,
    )
    return result


@router.post("/{document_id}/complete-upload", status_code=status.HTTP_200_OK)
async def complete_upload(
    org_id: uuid.UUID,
    ws_id: uuid.UUID,
    document_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> Dict[str, Any]:
    """Finalize a two-stage upload and enqueue document for extraction."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.DOC_UPLOAD.value, is_platform_admin=current_user.get("is_platform_admin", False))

    doc = await document_service.complete_upload(
        org_id=org_id,
        workspace_id=ws_id,
        document_id=document_id,
        actor_id=current_user["id"],
        actor_role=ws_role,
    )
    return {"message": "Document upload confirmed and queued for processing", "document": doc}


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_document_direct(
    org_id: uuid.UUID,
    ws_id: uuid.UUID,
    file: UploadFile = File(...),
    category: Optional[str] = Form(None),
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> Dict[str, Any]:
    """Single-request direct multipart file upload flow."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.DOC_UPLOAD.value, is_platform_admin=current_user.get("is_platform_admin", False))

    file_bytes = await file.read()
    if not file_bytes:
        raise ValidationError("Uploaded file is empty")

    doc = await document_service.upload_document_direct(
        org_id=org_id,
        workspace_id=ws_id,
        filename=file.filename or "unnamed_document",
        file_bytes=file_bytes,
        actor_id=current_user["id"],
        actor_role=ws_role,
        category=category,
    )
    return {"message": "Document uploaded successfully", "document": doc}


@router.get("", response_model=List[DocumentResponse])
async def list_documents(
    org_id: uuid.UUID,
    ws_id: uuid.UUID,
    status: Optional[str] = Query(None, description="Filter by status: QUEUED, COMPLETED, etc."),
    category: Optional[str] = Query(None, description="Filter by category: INVOICE, CONTRACT, etc."),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> List[Dict[str, Any]]:
    """List documents in workspace with status/category filters and pagination."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.DOC_READ.value, is_platform_admin=current_user.get("is_platform_admin", False))

    docs = await document_service.list_documents(
        org_id=org_id,
        workspace_id=ws_id,
        actor_id=current_user["id"],
        actor_role=ws_role,
        status=status,
        category=category,
        limit=limit,
        offset=offset,
    )
    return docs


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    org_id: uuid.UUID,
    ws_id: uuid.UUID,
    document_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> Dict[str, Any]:
    """Retrieve document metadata and presigned preview download URL."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.DOC_READ.value, is_platform_admin=current_user.get("is_platform_admin", False))

    doc = await document_service.get_document(
        org_id=org_id,
        workspace_id=ws_id,
        document_id=document_id,
        actor_id=current_user["id"],
        actor_role=ws_role,
    )
    return doc


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    org_id: uuid.UUID,
    ws_id: uuid.UUID,
    document_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> None:
    """Soft-delete a document (requires WORKSPACE_ADMIN or ORGANIZATION_ADMIN)."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.DOC_DELETE.value, is_platform_admin=current_user.get("is_platform_admin", False))

    await document_service.delete_document(
        org_id=org_id,
        workspace_id=ws_id,
        document_id=document_id,
        actor_id=current_user["id"],
        actor_role=ws_role,
    )


@router.post("/{document_id}/restore", status_code=status.HTTP_200_OK)
async def restore_document(
    org_id: uuid.UUID,
    ws_id: uuid.UUID,
    document_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> Dict[str, Any]:
    """Restore a soft-deleted document."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.DOC_DELETE.value, is_platform_admin=current_user.get("is_platform_admin", False))

    doc = await document_service.restore_document(
        org_id=org_id,
        workspace_id=ws_id,
        document_id=document_id,
        actor_id=current_user["id"],
        actor_role=ws_role,
    )
    return {"message": "Document restored successfully", "document": doc}


@router.post("/{document_id}/reprocess", status_code=status.HTTP_200_OK)
@router.post("/{document_id}/retry", status_code=status.HTTP_200_OK)
async def reprocess_document(
    org_id: uuid.UUID,
    ws_id: uuid.UUID,
    document_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> Dict[str, Any]:
    """Re-enqueue a document for OCR and extraction processing."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.DOC_UPLOAD.value, is_platform_admin=current_user.get("is_platform_admin", False))

    doc = await document_service.reprocess_document(
        org_id=org_id,
        workspace_id=ws_id,
        document_id=document_id,
        actor_id=current_user["id"],
        actor_role=ws_role,
    )
    return {"message": "Document re-enqueued for extraction", "document": doc}
