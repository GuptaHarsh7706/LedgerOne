"""
AI Assistant & Multi-Turn Conversation REST API Endpoints (Phase 6).
Provides session creation, history retrieval, and evidence-grounded Q&A
under strict workspace-level RBAC and tenant RLS isolation.
"""
from __future__ import annotations

from typing import Any, Dict, List
import uuid
from fastapi import APIRouter, Depends, Path, status

from src.auth.dependencies import get_current_user, get_tenant_context, get_workspace_role
from src.auth.permissions import Permission, assert_permission
from src.db.rls import TenantContext
from src.exceptions import AuthorizationError
from src.services.assistant_service import (
    AskQuestionRequest,
    AssistantResponse,
    ConversationSessionDetailResponse,
    CreateSessionRequest,
    assistant_service,
)

router = APIRouter(
    prefix="/organizations/{org_id}/workspaces/{ws_id}/assistant",
    tags=["AI Assistant"],
)

MEMBER_ROLES = {"ORGANIZATION_ADMIN", "WORKSPACE_ADMIN", "DOCUMENT_MANAGER", "REVIEWER", "ANALYST", "VIEWER"}


@router.post(
    "/sessions",
    status_code=status.HTTP_201_CREATED,
    summary="Create New Conversation Session",
)
async def create_session_endpoint(
    payload: CreateSessionRequest,
    org_id: uuid.UUID = Path(...),
    ws_id: uuid.UUID = Path(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> Dict[str, Any]:
    """Initialize a new conversation session for document intelligence inquiry."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.ASSISTANT_USE.value, is_platform_admin=current_user.get("is_platform_admin", False))

    return await assistant_service.create_session(
        org_id=org_id,
        ws_id=ws_id,
        payload=payload,
        actor_id=uuid.UUID(str(current_user["id"])),
        actor_role=ws_role,
    )


@router.get(
    "/sessions",
    status_code=status.HTTP_200_OK,
    summary="List Workspace Conversation Sessions",
)
async def list_sessions_endpoint(
    org_id: uuid.UUID = Path(...),
    ws_id: uuid.UUID = Path(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> List[Dict[str, Any]]:
    """List conversation sessions in this workspace visible to the caller."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.ASSISTANT_READ_HISTORY.value, is_platform_admin=current_user.get("is_platform_admin", False))

    return await assistant_service.list_sessions(
        org_id=org_id,
        ws_id=ws_id,
        actor_id=uuid.UUID(str(current_user["id"])),
        actor_role=ws_role,
    )


@router.get(
    "/sessions/{session_id}",
    response_model=ConversationSessionDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Conversation Session Details & Message History",
)
async def get_session_detail_endpoint(
    org_id: uuid.UUID = Path(...),
    ws_id: uuid.UUID = Path(...),
    session_id: uuid.UUID = Path(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> ConversationSessionDetailResponse:
    """Retrieve full message history for a conversation session."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.ASSISTANT_READ_HISTORY.value, is_platform_admin=current_user.get("is_platform_admin", False))

    return await assistant_service.get_session_detail(
        org_id=org_id,
        ws_id=ws_id,
        session_id=session_id,
        actor_id=uuid.UUID(str(current_user["id"])),
        actor_role=ws_role,
    )


@router.post(
    "/sessions/{session_id}/ask",
    response_model=AssistantResponse,
    status_code=status.HTTP_200_OK,
    summary="Ask Document Intelligence Assistant",
)
async def ask_question_endpoint(
    payload: AskQuestionRequest,
    org_id: uuid.UUID = Path(...),
    ws_id: uuid.UUID = Path(...),
    session_id: uuid.UUID = Path(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> AssistantResponse:
    """Ask a question; executes hybrid RRF retrieval, grounded synthesis, and citation verification."""
    ws_role = await get_workspace_role(
        org_id=org_id,
        workspace_id=ws_id,
        user_id=current_user["id"],
        is_platform_admin=current_user.get("is_platform_admin", False),
        org_role=tenant.user_role,
    )
    assert_permission(ws_role, Permission.ASSISTANT_USE.value, is_platform_admin=current_user.get("is_platform_admin", False))

    return await assistant_service.ask_question_in_session(
        org_id=org_id,
        ws_id=ws_id,
        session_id=session_id,
        payload=payload,
        actor_id=uuid.UUID(str(current_user["id"])),
        actor_role=ws_role,
    )
