"""
Multi-Turn AI Assistant & Session Service (Phase 6).
Manages conversational sessions, user/assistant message history,
evidence-grounded query execution, and tenant-scoped RLS policies.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional
import uuid
import asyncpg
from pydantic import BaseModel, Field

from src.db.pool import db_manager
from src.db.rls import TenantContext, apply_tenant_rls_context
from src.exceptions import AuthorizationError, NotFoundError, ProcessingError
from src.intelligence.assistant import CitationItem, synthesize_grounded_response
from src.intelligence.llm_provider import get_llm_provider
from src.services.retrieval_service import RetrievalQueryRequest, retrieval_service

logger = logging.getLogger(__name__)


class CreateSessionRequest(BaseModel):
    """Payload to create a new conversational assistant session."""

    title: str = Field(default="New Conversation", max_length=255)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ConversationMessageItem(BaseModel):
    """Pydantic representation of a single message in a conversation session."""

    id: str
    session_id: str
    sender_role: str
    content: str
    citations: List[CitationItem] = Field(default_factory=list)
    created_at: str


class ConversationSessionDetailResponse(BaseModel):
    """Complete conversation session bundle with chronological message history."""

    id: str
    organization_id: str
    workspace_id: str
    title: str
    created_at: str
    updated_at: str
    messages: List[ConversationMessageItem] = Field(default_factory=list)


class AskQuestionRequest(BaseModel):
    """Query payload dispatched to the conversational assistant."""

    query: str = Field(..., min_length=1, max_length=2000, description="Natural language question")
    top_k: int = Field(default=5, ge=1, le=20, description="Number of evidence chunks to retrieve")
    document_ids: Optional[List[uuid.UUID]] = Field(default=None, description="Optional document filter scope")


class AssistantResponse(BaseModel):
    """Grounded assistant response with verifiable citations and session tracking."""

    session_id: str
    message_id: str
    answer: str
    is_grounded: bool
    citations: List[CitationItem] = Field(default_factory=list)
    confidence: float = 1.0


class AssistantService:
    """Service layer managing conversational assistant workflows."""

    def __init__(self, pool: Optional[asyncpg.Pool] = None) -> None:
        self._pool = pool

    @property
    def pool(self) -> asyncpg.Pool:
        return self._pool or db_manager.pool

    async def create_session(
        self,
        org_id: uuid.UUID,
        ws_id: uuid.UUID,
        payload: CreateSessionRequest,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> Dict[str, Any]:
        """Create a new conversational session under workspace RLS."""
        tenant_context = TenantContext(org_id=org_id, user_id=actor_id, user_role=actor_role)

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await apply_tenant_rls_context(conn, context=tenant_context, enforce_app_role=True)

                session_id = uuid.uuid4()
                await conn.execute(
                    """
                    INSERT INTO conversation_sessions (
                        id, organization_id, workspace_id, created_by_user_id, title, metadata
                    ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                    """,
                    session_id,
                    org_id,
                    ws_id,
                    actor_id,
                    payload.title,
                    json.dumps(payload.metadata),
                )

                row = await conn.fetchrow(
                    "SELECT id, title, created_at, updated_at FROM conversation_sessions WHERE id = $1",
                    session_id,
                )

                return {
                    "id": str(row["id"]),
                    "organization_id": str(org_id),
                    "workspace_id": str(ws_id),
                    "title": row["title"],
                    "created_at": row["created_at"].isoformat(),
                    "updated_at": row["updated_at"].isoformat(),
                }

    async def list_sessions(
        self,
        org_id: uuid.UUID,
        ws_id: uuid.UUID,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> List[Dict[str, Any]]:
        """List all conversation sessions within a workspace visible to the user."""
        tenant_context = TenantContext(org_id=org_id, user_id=actor_id, user_role=actor_role)

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await apply_tenant_rls_context(conn, context=tenant_context, enforce_app_role=True)

                rows = await conn.fetch(
                    """
                    SELECT id, title, created_by_user_id, created_at, updated_at
                    FROM conversation_sessions
                    WHERE organization_id = $1 AND workspace_id = $2
                    ORDER BY updated_at DESC
                    """,
                    org_id,
                    ws_id,
                )

                return [
                    {
                        "id": str(r["id"]),
                        "organization_id": str(org_id),
                        "workspace_id": str(ws_id),
                        "title": r["title"],
                        "created_by_user_id": str(r["created_by_user_id"]),
                        "created_at": r["created_at"].isoformat(),
                        "updated_at": r["updated_at"].isoformat(),
                    }
                    for r in rows
                ]

    async def get_session_detail(
        self,
        org_id: uuid.UUID,
        ws_id: uuid.UUID,
        session_id: uuid.UUID,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> ConversationSessionDetailResponse:
        """Fetch a specific conversation session and all its messages."""
        tenant_context = TenantContext(org_id=org_id, user_id=actor_id, user_role=actor_role)

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await apply_tenant_rls_context(conn, context=tenant_context, enforce_app_role=True)

                session_row = await conn.fetchrow(
                    """
                    SELECT id, title, created_at, updated_at
                    FROM conversation_sessions
                    WHERE organization_id = $1 AND workspace_id = $2 AND id = $3
                    """,
                    org_id,
                    ws_id,
                    session_id,
                )
                if not session_row:
                    raise NotFoundError("Conversation session not found in workspace")

                messages_rows = await conn.fetch(
                    """
                    SELECT id, session_id, sender_role, content, citations, created_at
                    FROM conversation_messages
                    WHERE organization_id = $1 AND workspace_id = $2 AND session_id = $3
                    ORDER BY created_at ASC
                    """,
                    org_id,
                    ws_id,
                    session_id,
                )

                messages = []
                for m in messages_rows:
                    cits_data = m["citations"]
                    if isinstance(cits_data, str):
                        try:
                            cits_data = json.loads(cits_data)
                        except Exception:
                            cits_data = []

                    citations = [CitationItem(**c) for c in cits_data if isinstance(c, dict)]

                    messages.append(
                        ConversationMessageItem(
                            id=str(m["id"]),
                            session_id=str(m["session_id"]),
                            sender_role=m["sender_role"],
                            content=m["content"],
                            citations=citations,
                            created_at=m["created_at"].isoformat(),
                        )
                    )

                return ConversationSessionDetailResponse(
                    id=str(session_row["id"]),
                    organization_id=str(org_id),
                    workspace_id=str(ws_id),
                    title=session_row["title"],
                    created_at=session_row["created_at"].isoformat(),
                    updated_at=session_row["updated_at"].isoformat(),
                    messages=messages,
                )

    async def ask_question_in_session(
        self,
        org_id: uuid.UUID,
        ws_id: uuid.UUID,
        session_id: uuid.UUID,
        payload: AskQuestionRequest,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> AssistantResponse:
        """
        Execute multi-turn query:
        1. Appends USER message to session.
        2. Executes hybrid retrieval (dense pgvector + lexical tsvector).
        3. Synthesizes grounded answer with citations.
        4. Appends ASSISTANT message to session.
        """
        tenant_context = TenantContext(org_id=org_id, user_id=actor_id, user_role=actor_role)

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await apply_tenant_rls_context(conn, context=tenant_context, enforce_app_role=True)

                session_row = await conn.fetchrow(
                    """
                    SELECT id, title FROM conversation_sessions
                    WHERE organization_id = $1 AND workspace_id = $2 AND id = $3
                    FOR UPDATE
                    """,
                    org_id,
                    ws_id,
                    session_id,
                )
                if not session_row:
                    raise NotFoundError("Conversation session not found in workspace")

                # Insert USER message
                user_msg_id = uuid.uuid4()
                await conn.execute(
                    """
                    INSERT INTO conversation_messages (
                        id, organization_id, workspace_id, session_id, sender_role, content
                    ) VALUES ($1, $2, $3, $4, 'USER', $5)
                    """,
                    user_msg_id,
                    org_id,
                    ws_id,
                    session_id,
                    payload.query,
                )

        # Execute hybrid retrieval across workspace documents
        retrieval_req = RetrievalQueryRequest(
            query=payload.query,
            top_k=payload.top_k,
            alpha=0.5,
            document_ids=payload.document_ids,
        )
        retrieved_chunks = await retrieval_service.search_hybrid(
            org_id=org_id,
            ws_id=ws_id,
            payload=retrieval_req,
            actor_id=actor_id,
            actor_role=actor_role,
        )

        # Synthesize grounded answer with verified citations via configured LLM provider
        llm_provider = get_llm_provider()
        synthesis = await llm_provider.generate_grounded_answer(payload.query, retrieved_chunks)

        # Insert ASSISTANT message in new tenant transaction
        assistant_msg_id = uuid.uuid4()
        citations_json = json.dumps([c.model_dump() for c in synthesis.citations])

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await apply_tenant_rls_context(conn, context=tenant_context, enforce_app_role=True)

                await conn.execute(
                    """
                    INSERT INTO conversation_messages (
                        id, organization_id, workspace_id, session_id, sender_role, content, citations
                    ) VALUES ($1, $2, $3, $4, 'ASSISTANT', $5, $6::jsonb)
                    """,
                    assistant_msg_id,
                    org_id,
                    ws_id,
                    session_id,
                    synthesis.answer,
                    citations_json,
                )

                # Update session updated_at timestamp
                await conn.execute(
                    """
                    UPDATE conversation_sessions
                    SET updated_at = CURRENT_TIMESTAMP
                    WHERE organization_id = $1 AND workspace_id = $2 AND id = $3
                    """,
                    org_id,
                    ws_id,
                    session_id,
                )

        return AssistantResponse(
            session_id=str(session_id),
            message_id=str(assistant_msg_id),
            answer=synthesis.answer,
            is_grounded=synthesis.is_grounded,
            citations=synthesis.citations,
            confidence=synthesis.confidence,
        )


# Singleton instance
assistant_service = AssistantService()
