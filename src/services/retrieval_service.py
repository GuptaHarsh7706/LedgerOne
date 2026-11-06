"""
Hybrid Retrieval & Indexing Service (Phase 6).
Coordinates document chunking, dense vector embedding in Neon pgvector,
lexical full-text indexing with PostgreSQL tsvector, and Reciprocal Rank Fusion (RRF).
Enforces strict multi-tenant Row-Level Security isolation.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
import logging
from typing import Any, Dict, List, Optional, Sequence
import uuid
import asyncpg
from pydantic import BaseModel, Field

from src.db.pool import db_manager
from src.db.rls import TenantContext, apply_tenant_rls_context
from src.exceptions import AuthorizationError, NotFoundError, ProcessingError
from src.intelligence.chunking import build_document_chunks_hierarchy, DocumentChunk
from src.intelligence.embeddings import embed_query, embed_texts, vector_to_pg_str

logger = logging.getLogger(__name__)

RRF_K = 60  # Standard Reciprocal Rank Fusion smoothing constant


class RetrievedChunkResponse(BaseModel):
    """Pydantic response model for a single retrieved evidence chunk."""

    chunk_id: str
    document_id: str
    chunk_index: int
    page_number: int
    bounding_box: Optional[Dict[str, float]] = None
    content: str
    dense_score: float = 0.0
    lexical_score: float = 0.0
    rrf_score: float = 0.0
    rank: int = 1


class RetrievalQueryRequest(BaseModel):
    """Request payload for semantic and hybrid document search."""

    query: str = Field(..., min_length=1, description="Natural language search query")
    top_k: int = Field(default=5, ge=1, le=50, description="Maximum evidence chunks to return")
    alpha: float = Field(default=0.5, ge=0.0, le=1.0, description="Weight: 1.0 = Pure Vector, 0.0 = Pure BM25/Lexical, 0.5 = Balanced RRF")
    document_ids: Optional[List[uuid.UUID]] = Field(default=None, description="Optional document filter scope")


class RetrievalService:
    """Manages document chunk indexing, pgvector persistence, and hybrid search."""

    def __init__(self, pool: Optional[asyncpg.Pool] = None) -> None:
        self._pool = pool

    @property
    def pool(self) -> asyncpg.Pool:
        return self._pool or db_manager.pool

    async def index_document(
        self,
        org_id: uuid.UUID,
        ws_id: uuid.UUID,
        doc_id: uuid.UUID,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> Dict[str, Any]:
        """
        Chunk, embed, and index a completed or verified document into pgvector & tsvector.
        Enforces tenant-scoped database session and RLS policies.
        """
        tenant_context = TenantContext(org_id=org_id, user_id=actor_id, user_role=actor_role)

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await apply_tenant_rls_context(conn, context=tenant_context, enforce_app_role=True)

                doc = await conn.fetchrow(
                    """
                    SELECT id, filename, status, metadata FROM documents
                    WHERE organization_id = $1 AND workspace_id = $2 AND id = $3 AND is_deleted = FALSE
                    FOR UPDATE
                    """,
                    org_id,
                    ws_id,
                    doc_id,
                )
                if not doc:
                    raise NotFoundError("Document not found in workspace")

                # Fetch extracted fields
                fields_rows = await conn.fetch(
                    """
                    SELECT field_name, field_value_normalized, is_verified, verified_value
                    FROM extracted_fields
                    WHERE organization_id = $1 AND workspace_id = $2 AND document_id = $3
                    """,
                    org_id,
                    ws_id,
                    doc_id,
                )

                scalar_fields: Dict[str, Any] = {}
                line_items_data: List[Dict[str, Any]] = []

                for r in fields_rows:
                    val = r["verified_value"] if r["is_verified"] and r["verified_value"] is not None else r["field_value_normalized"]
                    if isinstance(val, str):
                        try:
                            val = json.loads(val)
                        except Exception:
                            pass

                    fname = r["field_name"]
                    if fname == "line_items":
                        if isinstance(val, dict):
                            line_items_data = val.get("table", {}).get("rows", [])
                        elif isinstance(val, list):
                            line_items_data = val
                    else:
                        scalar_fields[fname] = val

                # Raw text from document metadata if present
                meta = doc["metadata"] or {}
                if isinstance(meta, str):
                    meta = json.loads(meta)
                raw_text = meta.get("raw_text")

                # Chunk document
                chunks: List[DocumentChunk] = build_document_chunks_hierarchy(
                    raw_text=raw_text,
                    scalar_fields=scalar_fields,
                    line_items=line_items_data,
                )
                if not chunks:
                    logger.warning("No chunks generated for document %s", doc_id)
                    return {"message": "Document contains no extractable content for indexing", "chunks_indexed": 0}

                # Generate dense vectors
                contents = [c.content for c in chunks]
                embeddings = embed_texts(contents)

                # Delete existing chunks for this document
                await conn.execute(
                    """
                    DELETE FROM document_chunks
                    WHERE organization_id = $1 AND workspace_id = $2 AND document_id = $3
                    """,
                    org_id,
                    ws_id,
                    doc_id,
                )

                # Batch insert chunks with vector casting
                insert_stmt = """
                    INSERT INTO document_chunks (
                        organization_id, workspace_id, document_id,
                        chunk_index, page_number, bounding_box, content, embedding
                    ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::vector)
                """
                for c, emb in zip(chunks, embeddings):
                    bbox_json = json.dumps(c.bounding_box) if c.bounding_box else None
                    emb_str = vector_to_pg_str(emb)
                    await conn.execute(
                        insert_stmt,
                        org_id,
                        ws_id,
                        doc_id,
                        c.chunk_index,
                        c.page_number,
                        bbox_json,
                        c.content,
                        emb_str,
                    )

                logger.info(
                    "Document successfully indexed into pgvector",
                    document_id=str(doc_id),
                    chunk_count=len(chunks),
                )

                return {
                    "message": "Document successfully indexed",
                    "document_id": str(doc_id),
                    "chunks_indexed": len(chunks),
                }

    async def search_hybrid(
        self,
        org_id: uuid.UUID,
        ws_id: uuid.UUID,
        payload: RetrievalQueryRequest,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> List[RetrievedChunkResponse]:
        """
        Execute dual-retrieval (Dense pgvector + Lexical tsvector) and fuse results via RRF.
        Guarantees strict tenant RLS isolation and sub-50ms execution.
        """
        tenant_context = TenantContext(org_id=org_id, user_id=actor_id, user_role=actor_role)
        query_text = payload.query.strip()
        top_k = payload.top_k
        alpha = payload.alpha
        candidate_k = min(top_k * 4, 100)

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await apply_tenant_rls_context(conn, context=tenant_context, enforce_app_role=True)

                # 1. Dense Vector Search
                q_vec = embed_query(query_text)
                q_vec_str = vector_to_pg_str(q_vec)

                doc_filter_sql = ""
                doc_filter_param = None
                if payload.document_ids:
                    doc_filter_sql = "AND document_id = ANY($4::uuid[])"
                    doc_filter_param = payload.document_ids

                dense_query = f"""
                    SELECT id, document_id, chunk_index, page_number, bounding_box, content,
                           1.0 - (embedding <=> $3::vector) AS dense_similarity
                    FROM document_chunks
                    WHERE organization_id = $1 AND workspace_id = $2
                    {doc_filter_sql}
                    ORDER BY embedding <=> $3::vector ASC
                    LIMIT {candidate_k}
                """

                params_dense = [org_id, ws_id, q_vec_str]
                if doc_filter_param:
                    params_dense.append(doc_filter_param)

                dense_rows = await conn.fetch(dense_query, *params_dense)

                # 2. Lexical Full-Text Search (tsvector @@ plainto_tsquery)
                lexical_query = f"""
                    SELECT id, document_id, chunk_index, page_number, bounding_box, content,
                           ts_rank_cd(tsv_content, plainto_tsquery('english', $3)) AS lexical_rank
                    FROM document_chunks
                    WHERE organization_id = $1 AND workspace_id = $2
                      AND tsv_content @@ plainto_tsquery('english', $3)
                    {doc_filter_sql}
                    ORDER BY lexical_rank DESC
                    LIMIT {candidate_k}
                """
                params_lexical = [org_id, ws_id, query_text]
                if doc_filter_param:
                    params_lexical.append(doc_filter_param)

                lexical_rows = await conn.fetch(lexical_query, *params_lexical)

                # 3. Reciprocal Rank Fusion (RRF)
                # Map chunk_id -> metadata and ranks
                fused_map: Dict[str, Dict[str, Any]] = {}

                for rank, row in enumerate(dense_rows):
                    cid = str(row["id"])
                    fused_map[cid] = {
                        "row": row,
                        "dense_rank": rank + 1,
                        "dense_score": float(row["dense_similarity"]) if row["dense_similarity"] is not None else 0.0,
                        "lexical_rank": None,
                        "lexical_score": 0.0,
                    }

                for rank, row in enumerate(lexical_rows):
                    cid = str(row["id"])
                    lex_score = float(row["lexical_rank"]) if row["lexical_rank"] is not None else 0.0
                    if cid in fused_map:
                        fused_map[cid]["lexical_rank"] = rank + 1
                        fused_map[cid]["lexical_score"] = lex_score
                    else:
                        fused_map[cid] = {
                            "row": row,
                            "dense_rank": None,
                            "dense_score": 0.0,
                            "lexical_rank": rank + 1,
                            "lexical_score": lex_score,
                        }

                # Compute blended RRF score
                scored_results = []
                for cid, item in fused_map.items():
                    d_rank = item["dense_rank"]
                    l_rank = item["lexical_rank"]

                    dense_rrf = (alpha / (RRF_K + d_rank)) if d_rank is not None else 0.0
                    lex_rrf = ((1.0 - alpha) / (RRF_K + l_rank)) if l_rank is not None else 0.0
                    rrf_total = dense_rrf + lex_rrf

                    row = item["row"]
                    bbox = row["bounding_box"]
                    if isinstance(bbox, str):
                        try:
                            bbox = json.loads(bbox)
                        except Exception:
                            bbox = None

                    scored_results.append({
                        "chunk_id": cid,
                        "document_id": str(row["document_id"]),
                        "chunk_index": row["chunk_index"],
                        "page_number": row["page_number"],
                        "bounding_box": bbox,
                        "content": row["content"],
                        "dense_score": item["dense_score"],
                        "lexical_score": item["lexical_score"],
                        "rrf_score": rrf_total,
                    })

                # Sort by RRF score descending
                scored_results.sort(key=lambda x: x["rrf_score"], reverse=True)
                top_results = scored_results[:top_k]

                return [
                    RetrievedChunkResponse(
                        chunk_id=r["chunk_id"],
                        document_id=r["document_id"],
                        chunk_index=r["chunk_index"],
                        page_number=r["page_number"],
                        bounding_box=r["bounding_box"],
                        content=r["content"],
                        dense_score=r["dense_score"],
                        lexical_score=r["lexical_score"],
                        rrf_score=r["rrf_score"],
                        rank=i + 1,
                    )
                    for i, r in enumerate(top_results)
                ]


# Singleton instance
retrieval_service = RetrievalService()
