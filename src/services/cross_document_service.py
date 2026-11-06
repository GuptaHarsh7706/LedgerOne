"""
Cross-Document Intelligence & Financial Analytics Service (Phase 7).
Coordinates document relationships, 3-way matching execution, discrepancy logging,
document version diffing, and workspace spend analytics under strict RLS boundaries.
"""
from __future__ import annotations

from decimal import Decimal
import json
import logging
from typing import Any, Dict, List, Optional
import uuid
import asyncpg
from pydantic import BaseModel, Field

from src.db.pool import db_manager
from src.db.rls import TenantContext, apply_tenant_rls_context
from src.exceptions import AuthorizationError, NotFoundError, ProcessingError
from src.intelligence.document_diff import compare_documents, DocumentComparisonResult
from src.intelligence.matching_engine import match_three_way, ThreeWayMatchSummary

logger = logging.getLogger(__name__)


class LinkDocumentsRequest(BaseModel):
    """Payload to establish a relationship between two documents."""

    target_document_id: uuid.UUID
    relationship_type: str = Field(..., description="e.g. PURCHASE_ORDER_TO_INVOICE, INVOICE_TO_RECEIPT, VERSION_REVISION")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ThreeWayMatchRequest(BaseModel):
    """Payload to trigger 3-way matching for an invoice."""

    po_document_id: Optional[uuid.UUID] = None
    grn_document_id: Optional[uuid.UUID] = None
    price_tolerance: float = 0.0
    quantity_tolerance: float = 0.0


class CompareDocumentsRequest(BaseModel):
    """Payload to compare two documents or versions."""

    document_b_id: uuid.UUID


class CrossDocumentService:
    """Service layer managing cross-document operations and analytics."""

    def __init__(self, pool: Optional[asyncpg.Pool] = None) -> None:
        self._pool = pool

    @property
    def pool(self) -> asyncpg.Pool:
        return self._pool or db_manager.pool

    async def _fetch_doc_extraction(
        self,
        conn: asyncpg.Connection,
        org_id: uuid.UUID,
        ws_id: uuid.UUID,
        doc_id: uuid.UUID,
    ) -> Dict[str, Any]:
        """Helper to fetch document header and extracted fields bundle."""
        doc = await conn.fetchrow(
            """
            SELECT id, filename, category, status, metadata FROM documents
            WHERE organization_id = $1 AND workspace_id = $2 AND id = $3 AND is_deleted = FALSE
            """,
            org_id,
            ws_id,
            doc_id,
        )
        if not doc:
            raise NotFoundError(f"Document {doc_id} not found in workspace")

        fields = await conn.fetch(
            """
            SELECT field_name, field_value_normalized, is_verified, verified_value
            FROM extracted_fields
            WHERE organization_id = $1 AND workspace_id = $2 AND document_id = $3
            """,
            org_id,
            ws_id,
            doc_id,
        )

        scalars: Dict[str, Any] = {}
        lines: List[Dict[str, Any]] = []

        for f in fields:
            val = f["verified_value"] if f["is_verified"] and f["verified_value"] is not None else f["field_value_normalized"]
            if isinstance(val, str):
                try:
                    val = json.loads(val)
                except Exception:
                    pass

            fname = f["field_name"]
            if fname == "line_items":
                if isinstance(val, dict):
                    lines = val.get("table", {}).get("rows", [])
                elif isinstance(val, list):
                    lines = val
            else:
                scalars[fname] = val

        meta = doc["metadata"] or {}
        if isinstance(meta, str):
            meta = json.loads(meta)

        return {
            "document_id": str(doc["id"]),
            "filename": doc["filename"],
            "category": doc["category"],
            "vendor_name": scalars.get("supplier_name") or scalars.get("vendor_name") or meta.get("vendor"),
            "invoice_number": scalars.get("invoice_number"),
            "po_number": scalars.get("po_number") or scalars.get("purchase_order_number"),
            "total_amount": scalars.get("total_amount") or scalars.get("gross_total"),
            "subtotal": scalars.get("subtotal"),
            "scalars": scalars,
            "line_items": lines,
        }

    async def link_documents(
        self,
        org_id: uuid.UUID,
        ws_id: uuid.UUID,
        source_doc_id: uuid.UUID,
        payload: LinkDocumentsRequest,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> Dict[str, Any]:
        """Establish a typed relationship edge between two documents."""
        tenant_context = TenantContext(org_id=org_id, user_id=actor_id, user_role=actor_role)

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await apply_tenant_rls_context(conn, context=tenant_context, enforce_app_role=True)

                # Validate both documents exist in workspace
                for did in (source_doc_id, payload.target_document_id):
                    row = await conn.fetchrow(
                        "SELECT id FROM documents WHERE organization_id = $1 AND workspace_id = $2 AND id = $3",
                        org_id,
                        ws_id,
                        did,
                    )
                    if not row:
                        raise NotFoundError(f"Document {did} not found in workspace")

                rel_id = uuid.uuid4()
                await conn.execute(
                    """
                    INSERT INTO document_relationships (
                        id, organization_id, workspace_id, source_document_id, target_document_id,
                        relationship_type, confidence, detected_by, metadata
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'USER', $8::jsonb)
                    ON CONFLICT (organization_id, workspace_id, source_document_id, target_document_id, relationship_type)
                    DO UPDATE SET confidence = EXCLUDED.confidence, metadata = EXCLUDED.metadata
                    """,
                    rel_id,
                    org_id,
                    ws_id,
                    source_doc_id,
                    payload.target_document_id,
                    payload.relationship_type,
                    payload.confidence,
                    json.dumps(payload.metadata),
                )

                # Record audit log
                await conn.execute(
                    """
                    INSERT INTO audit_logs (
                        organization_id, tenant_slug_snapshot, workspace_id,
                        user_id, user_role_snapshot, action, entity_type, entity_id,
                        new_state
                    ) VALUES ($1, 'system', $2, $3, $4, 'DOCUMENT_RELATIONSHIP_CREATED', 'document_relationships', $5, $6::jsonb)
                    """,
                    org_id,
                    ws_id,
                    actor_id,
                    actor_role,
                    source_doc_id,
                    json.dumps({
                        "target_doc_id": str(payload.target_document_id),
                        "relationship_type": payload.relationship_type,
                    }),
                )

                return {
                    "message": "Document relationship established",
                    "source_document_id": str(source_doc_id),
                    "target_document_id": str(payload.target_document_id),
                    "relationship_type": payload.relationship_type,
                }

    async def list_relationships(
        self,
        org_id: uuid.UUID,
        ws_id: uuid.UUID,
        doc_id: uuid.UUID,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> List[Dict[str, Any]]:
        """List incoming and outgoing relationships for a document."""
        tenant_context = TenantContext(org_id=org_id, user_id=actor_id, user_role=actor_role)

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await apply_tenant_rls_context(conn, context=tenant_context, enforce_app_role=True)

                rows = await conn.fetch(
                    """
                    SELECT id, source_document_id, target_document_id, relationship_type, confidence, detected_by, created_at
                    FROM document_relationships
                    WHERE organization_id = $1 AND workspace_id = $2
                      AND (source_document_id = $3 OR target_document_id = $3)
                    ORDER BY created_at DESC
                    """,
                    org_id,
                    ws_id,
                    doc_id,
                )

                return [
                    {
                        "id": str(r["id"]),
                        "source_document_id": str(r["source_document_id"]),
                        "target_document_id": str(r["target_document_id"]),
                        "relationship_type": r["relationship_type"],
                        "confidence": float(r["confidence"]),
                        "detected_by": r["detected_by"],
                        "created_at": r["created_at"].isoformat(),
                    }
                    for r in rows
                ]

    async def execute_three_way_match(
        self,
        org_id: uuid.UUID,
        ws_id: uuid.UUID,
        invoice_doc_id: uuid.UUID,
        payload: ThreeWayMatchRequest,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> ThreeWayMatchSummary:
        """
        Execute full 3-way matching between Invoice, PO, and GRN.
        Persists detected discrepancies to PostgreSQL document_discrepancies table.
        """
        tenant_context = TenantContext(org_id=org_id, user_id=actor_id, user_role=actor_role)

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await apply_tenant_rls_context(conn, context=tenant_context, enforce_app_role=True)

                inv_data = await self._fetch_doc_extraction(conn, org_id, ws_id, invoice_doc_id)
                po_data = await self._fetch_doc_extraction(conn, org_id, ws_id, payload.po_document_id) if payload.po_document_id else None
                grn_data = await self._fetch_doc_extraction(conn, org_id, ws_id, payload.grn_document_id) if payload.grn_document_id else None

                # Query prior invoices linked to this PO to detect duplicate billing
                prior_invoices: List[Dict[str, Any]] = []
                if payload.po_document_id:
                    linked_inv_rows = await conn.fetch(
                        """
                        SELECT source_document_id FROM document_relationships
                        WHERE organization_id = $1 AND workspace_id = $2
                          AND target_document_id = $3 AND relationship_type = 'PURCHASE_ORDER_TO_INVOICE'
                          AND source_document_id != $4
                        """,
                        org_id,
                        ws_id,
                        payload.po_document_id,
                        invoice_doc_id,
                    )
                    for r in linked_inv_rows:
                        try:
                            prior_data = await self._fetch_doc_extraction(conn, org_id, ws_id, r["source_document_id"])
                            prior_invoices.append(prior_data)
                        except Exception:
                            pass

                # Execute matching algorithm
                summary = match_three_way(
                    invoice_data=inv_data,
                    po_data=po_data,
                    grn_data=grn_data,
                    prior_invoices=prior_invoices,
                    price_tolerance=Decimal(str(payload.price_tolerance)),
                    quantity_tolerance=Decimal(str(payload.quantity_tolerance)),
                )

                # Persist discrepancies
                for disc in summary.discrepancies:
                    await conn.execute(
                        """
                        INSERT INTO document_discrepancies (
                            organization_id, workspace_id, document_id, related_document_id,
                            discrepancy_type, severity, field_name, expected_value, observed_value,
                            delta, rationale, metadata
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
                        """,
                        org_id,
                        ws_id,
                        invoice_doc_id,
                        payload.po_document_id or payload.grn_document_id,
                        disc.discrepancy_type,
                        disc.severity,
                        disc.field_name,
                        disc.expected_value,
                        disc.observed_value,
                        disc.delta,
                        disc.message,
                        json.dumps({
                            "evidence_a": disc.evidence_source_a,
                            "evidence_b": disc.evidence_source_b,
                        }),
                    )

                # Automatically link PO and GRN relationships if provided
                if payload.po_document_id:
                    await conn.execute(
                        """
                        INSERT INTO document_relationships (
                            organization_id, workspace_id, source_document_id, target_document_id,
                            relationship_type, confidence, detected_by
                        ) VALUES ($1, $2, $3, $4, 'PURCHASE_ORDER_TO_INVOICE', 1.0, 'THREE_WAY_MATCH')
                        ON CONFLICT DO NOTHING
                        """,
                        org_id,
                        ws_id,
                        invoice_doc_id,
                        payload.po_document_id,
                    )

                if payload.grn_document_id:
                    await conn.execute(
                        """
                        INSERT INTO document_relationships (
                            organization_id, workspace_id, source_document_id, target_document_id,
                            relationship_type, confidence, detected_by
                        ) VALUES ($1, $2, $3, $4, 'INVOICE_TO_RECEIPT', 1.0, 'THREE_WAY_MATCH')
                        ON CONFLICT DO NOTHING
                        """,
                        org_id,
                        ws_id,
                        invoice_doc_id,
                        payload.grn_document_id,
                    )

                # Record audit log
                await conn.execute(
                    """
                    INSERT INTO audit_logs (
                        organization_id, tenant_slug_snapshot, workspace_id,
                        user_id, user_role_snapshot, action, entity_type, entity_id,
                        new_state
                    ) VALUES ($1, 'system', $2, $3, $4, 'THREE_WAY_MATCH_EXECUTED', 'documents', $5, $6::jsonb)
                    """,
                    org_id,
                    ws_id,
                    actor_id,
                    actor_role,
                    invoice_doc_id,
                    json.dumps({
                        "match_status": summary.match_status,
                        "discrepancies_count": len(summary.discrepancies),
                        "total_discrepancy_amount": str(summary.total_discrepancy_amount),
                    }),
                )

                return summary

    async def execute_document_comparison(
        self,
        org_id: uuid.UUID,
        ws_id: uuid.UUID,
        doc_a_id: uuid.UUID,
        doc_b_id: uuid.UUID,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> DocumentComparisonResult:
        """Compare two documents or versions and produce diff analysis."""
        tenant_context = TenantContext(org_id=org_id, user_id=actor_id, user_role=actor_role)

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await apply_tenant_rls_context(conn, context=tenant_context, enforce_app_role=True)

                data_a = await self._fetch_doc_extraction(conn, org_id, ws_id, doc_a_id)
                data_b = await self._fetch_doc_extraction(conn, org_id, ws_id, doc_b_id)

                return compare_documents(
                    doc_a_id=str(doc_a_id),
                    doc_a_fields=data_a["scalars"],
                    doc_a_lines=data_a["line_items"],
                    doc_b_id=str(doc_b_id),
                    doc_b_fields=data_b["scalars"],
                    doc_b_lines=data_b["line_items"],
                )

    async def get_workspace_spend_analytics(
        self,
        org_id: uuid.UUID,
        ws_id: uuid.UUID,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> Dict[str, Any]:
        """Aggregate workspace financial spend, vendor distribution, and discrepancy stats."""
        tenant_context = TenantContext(org_id=org_id, user_id=actor_id, user_role=actor_role)

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await apply_tenant_rls_context(conn, context=tenant_context, enforce_app_role=True)

                # Total documents and category breakdown
                doc_stats = await conn.fetch(
                    """
                    SELECT category, count(*) as count
                    FROM documents
                    WHERE organization_id = $1 AND workspace_id = $2 AND is_deleted = FALSE
                    GROUP BY category
                    """,
                    org_id,
                    ws_id,
                )

                # Total discrepancy metrics
                disc_stats = await conn.fetchrow(
                    """
                    SELECT count(*) as total_discrepancies,
                           COALESCE(sum(abs(delta)), 0.0) as total_exposure
                    FROM document_discrepancies
                    WHERE organization_id = $1 AND workspace_id = $2 AND status = 'OPEN'
                    """,
                    org_id,
                    ws_id,
                )

                # Vendor spend aggregation from extracted fields
                vendor_spend_rows = await conn.fetch(
                    """
                    SELECT f.field_value_raw as vendor, count(DISTINCT d.id) as doc_count
                    FROM documents d
                    JOIN extracted_fields f ON f.document_id = d.id AND f.field_name IN ('supplier_name', 'vendor_name')
                    WHERE d.organization_id = $1 AND d.workspace_id = $2 AND d.is_deleted = FALSE
                    GROUP BY f.field_value_raw
                    LIMIT 20
                    """,
                    org_id,
                    ws_id,
                )

                return {
                    "document_count_by_category": {r["category"]: r["count"] for r in doc_stats},
                    "open_discrepancies_count": disc_stats["total_discrepancies"] if disc_stats else 0,
                    "total_discrepancy_exposure": float(disc_stats["total_exposure"]) if disc_stats else 0.0,
                    "top_vendors": [{"vendor": r["vendor"], "invoice_count": r["doc_count"]} for r in vendor_spend_rows],
                }


# Singleton instance
cross_document_service = CrossDocumentService()
