"""
Verification and Reviewer Workflow Service Engine (Phase 5).
Implements Review Queue querying, field & line-item corrections, real-time invariant re-evaluation,
INV-010 auditor overrides, segregation of duties (SoD) dual-custody enforcement,
and trusted document lifecycle state transitions with immutable audit logging.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
import json
from typing import Any, Dict, List, Optional
import uuid
import asyncpg
import structlog

from src.db.pool import db_manager
from src.db.rls import TenantContext, apply_tenant_rls_context
from src.exceptions import AuthorizationError, NotFoundError, ValidationError
from src.storage.s3 import storage_manager
from src.intelligence.verification_schemas import (
    FieldCorrectionRequest,
    LineItemCorrectionRequest,
    InvariantOverrideRequest,
    DocumentRejectRequest,
    DocumentReopenRequest,
    ReviewQueueItemResponse,
    DocumentReviewDetailResponse,
    ExtractedFieldReviewItem,
    InvariantReviewItem,
)
from src.intelligence.table_contracts import LineItemField
from src.intelligence.rounding_policy import (
    RoundingPolicy,
    create_default_rounding_policy,
)
from src.intelligence.accounting_invariants import (
    evaluate_all_accounting_invariants,
    evaluate_inv_010_auditor_override,
)

logger = structlog.get_logger(__name__)

# Canonical roles permitted to conduct review and correction
REVIEW_ROLES = {"ORGANIZATION_ADMIN", "WORKSPACE_ADMIN", "REVIEWER"}
# Roles permitted to issue final document approval
APPROVAL_ROLES = {"ORGANIZATION_ADMIN", "WORKSPACE_ADMIN"}


class VerificationService:
    """Service managing human review, field correction, overrides, and state transitions."""

    def __init__(self, pool: Optional[asyncpg.Pool] = None) -> None:
        self._pool = pool

    @property
    def pool(self) -> asyncpg.Pool:
        return self._pool or db_manager.pool

    async def get_review_queue(
        self,
        org_id: uuid.UUID,
        ws_id: uuid.UUID,
        actor_id: uuid.UUID,
        actor_role: str,
        status: Optional[str] = None,
        category: Optional[str] = None,
        min_confidence: Optional[float] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[ReviewQueueItemResponse]:
        """Query documents requiring human verification in workspace."""
        tenant_context = TenantContext(
            org_id=org_id,
            user_id=actor_id,
            user_role=actor_role,
        )

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await apply_tenant_rls_context(conn, context=tenant_context, enforce_app_role=True)

                query = """
                    SELECT 
                        d.id, d.organization_id, d.workspace_id, d.filename,
                        d.status, d.category, d.metadata, d.created_at,
                        COALESCE(AVG(ef.confidence), 1.0) as mean_confidence
                    FROM documents d
                    LEFT JOIN extracted_fields ef 
                        ON d.organization_id = ef.organization_id 
                        AND d.workspace_id = ef.workspace_id 
                        AND d.id = ef.document_id
                    WHERE d.organization_id = $1 
                      AND d.workspace_id = $2 
                      AND d.is_deleted = FALSE
                      AND ($3::varchar IS NULL OR d.status = $3)
                      AND ($4::varchar IS NULL OR d.category = $4)
                    GROUP BY d.organization_id, d.workspace_id, d.id, d.filename, d.status, d.category, d.metadata, d.created_at
                    ORDER BY d.created_at DESC
                    LIMIT $5 OFFSET $6
                """
                rows = await conn.fetch(query, org_id, ws_id, status, category, limit, offset)

        items: List[ReviewQueueItemResponse] = []
        for r in rows:
            meta = r["metadata"] or {}
            if isinstance(meta, str):
                meta = json.loads(meta)

            inv_evals = meta.get("invariants") or meta.get("invariant_evaluations") or []
            failed_count = sum(1 for inv in inv_evals if inv.get("outcome") == "FAILED")
            mean_conf = float(r["mean_confidence"]) if r["mean_confidence"] is not None else 1.0

            if min_confidence is not None and mean_conf < min_confidence:
                continue

            reviewer_id_str = meta.get("assigned_reviewer_id")
            assigned_reviewer_id = uuid.UUID(reviewer_id_str) if reviewer_id_str else None

            items.append(
                ReviewQueueItemResponse(
                    id=r["id"],
                    organization_id=r["organization_id"],
                    workspace_id=r["workspace_id"],
                    filename=r["filename"],
                    status=r["status"],
                    category=r["category"],
                    created_at=r["created_at"],
                    mean_confidence=round(mean_conf, 4),
                    has_failed_invariants=failed_count > 0,
                    failed_invariants_count=failed_count,
                    assigned_reviewer_id=assigned_reviewer_id,
                )
            )

        return items

    async def get_document_review_detail(
        self,
        org_id: uuid.UUID,
        ws_id: uuid.UUID,
        doc_id: uuid.UUID,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> DocumentReviewDetailResponse:
        """Fetch comprehensive verification package for reviewer workspace."""
        tenant_context = TenantContext(
            org_id=org_id,
            user_id=actor_id,
            user_role=actor_role,
        )

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await apply_tenant_rls_context(conn, context=tenant_context, enforce_app_role=True)

                doc_row = await conn.fetchrow(
                    """
                    SELECT id, organization_id, workspace_id, uploaded_by_user_id,
                           filename, file_size_bytes, mime_type, sha256_hash,
                           s3_key, status, category, metadata, created_at, updated_at
                    FROM documents
                    WHERE organization_id = $1 AND workspace_id = $2 AND id = $3 AND is_deleted = FALSE
                    """,
                    org_id,
                    ws_id,
                    doc_id,
                )
                if not doc_row:
                    raise NotFoundError("Document not found in workspace")

                field_rows = await conn.fetch(
                    """
                    SELECT id, field_name, field_value_raw, field_value_normalized,
                           confidence, page_number, bounding_box, is_verified,
                           verified_value, verified_by_user_id, verified_at
                    FROM extracted_fields
                    WHERE organization_id = $1 AND workspace_id = $2 AND document_id = $3
                    ORDER BY field_name ASC
                    """,
                    org_id,
                    ws_id,
                    doc_id,
                )

                audit_rows = await conn.fetch(
                    """
                    SELECT id, action, user_id, user_role_snapshot, previous_state, new_state, created_at
                    FROM audit_logs
                    WHERE organization_id = $1 AND entity_id = $2
                    ORDER BY created_at DESC
                    LIMIT 20
                    """,
                    org_id,
                    doc_id,
                )

        doc = dict(doc_row)
        meta = doc.get("metadata") or {}
        if isinstance(meta, str):
            meta = json.loads(meta)

        # Generate presigned download URL
        preview_url = storage_manager.generate_presigned_download_url(
            key=doc["s3_key"],
            expires_in=3600,
        )

        # Partition scalar fields and tabular bundle
        scalar_fields: List[ExtractedFieldReviewItem] = []
        line_items_bundle: Optional[Dict[str, Any]] = None
        corrector_user_ids = set()

        for f in field_rows:
            if f["field_name"] in ("line_items", "table_line_items"):
                norm_val = f["verified_value"] if f["is_verified"] and f["verified_value"] else f["field_value_normalized"]
                if isinstance(norm_val, str):
                    norm_val = json.loads(norm_val)
                line_items_bundle = norm_val
            else:
                norm_val = f["field_value_normalized"]
                if isinstance(norm_val, str):
                    try:
                        norm_val = json.loads(norm_val)
                    except Exception:
                        pass

                ver_val = f["verified_value"]
                if isinstance(ver_val, str):
                    try:
                        ver_val = json.loads(ver_val)
                    except Exception:
                        pass

                scalar_fields.append(
                    ExtractedFieldReviewItem(
                        id=f["id"],
                        field_name=f["field_name"],
                        field_value_raw=f["field_value_raw"],
                        field_value_normalized=norm_val,
                        confidence=float(f["confidence"]),
                        page_number=f["page_number"],
                        bounding_box=json.loads(f["bounding_box"]) if isinstance(f["bounding_box"], str) else f["bounding_box"],
                        is_verified=f["is_verified"],
                        verified_value=ver_val,
                        verified_by_user_id=f["verified_by_user_id"],
                        verified_at=f["verified_at"],
                    )
                )

            if f["verified_by_user_id"]:
                corrector_user_ids.add(str(f["verified_by_user_id"]))

        # Invariant evaluations & active overrides
        invariants_list: List[InvariantReviewItem] = []
        raw_invs = meta.get("invariants") or meta.get("invariant_evaluations") or []
        overrides = meta.get("overrides") or {}

        for inv in raw_invs:
            inv_id = inv.get("invariant_id") or inv.get("rule_id", "UNKNOWN")
            ovr = overrides.get(inv_id)
            is_overridden = ovr is not None
            is_hard_stop = inv_id in ("INV-002", "INV-008", "INV-010")

            invariants_list.append(
                InvariantReviewItem(
                    invariant_id=inv_id,
                    name=inv.get("name", inv_id),
                    outcome=inv.get("outcome", "UNKNOWN"),
                    message=inv.get("message"),
                    discrepancy=str(inv.get("delta") or inv.get("discrepancy") or ""),
                    is_overridable=not is_hard_stop,
                    is_overridden=is_overridden,
                    override_rationale=ovr.get("rationale") if ovr else None,
                    overridden_by=ovr.get("overridden_by") if ovr else None,
                    overridden_at=ovr.get("overridden_at") if ovr else None,
                )
            )

        # Segregation of Duties (SoD) Flags
        is_uploader = doc["uploaded_by_user_id"] == actor_id
        is_corrector = str(actor_id) in corrector_user_ids
        is_admin = actor_role in APPROVAL_ROLES

        sod_metadata = {
            "uploaded_by_user_id": str(doc["uploaded_by_user_id"]) if doc["uploaded_by_user_id"] else None,
            "corrector_user_ids": list(corrector_user_ids),
            "is_uploader": is_uploader,
            "is_corrector": is_corrector,
            "can_verify": actor_role in REVIEW_ROLES,
            "can_approve": is_admin and not is_uploader and not is_corrector,
            "can_override": actor_role in REVIEW_ROLES,
            "sod_violations": [],
        }

        if is_admin and (is_uploader or is_corrector):
            sod_metadata["sod_violations"].append("AUTH_SOD_001_DUAL_CUSTODY: Approver cannot be uploader or corrector")

        recent_audits = []
        for a in audit_rows:
            recent_audits.append({
                "id": str(a["id"]),
                "action": a["action"],
                "user_id": str(a["user_id"]) if a["user_id"] else None,
                "role": a["user_role_snapshot"],
                "created_at": a["created_at"].isoformat() if a["created_at"] else None,
            })

        return DocumentReviewDetailResponse(
            document={
                "id": doc["id"],
                "filename": doc["filename"],
                "status": doc["status"],
                "category": doc["category"],
                "file_size_bytes": doc["file_size_bytes"],
                "created_at": doc["created_at"].isoformat() if doc["created_at"] else None,
                "updated_at": doc["updated_at"].isoformat() if doc["updated_at"] else None,
            },
            preview_url=preview_url,
            scalar_fields=scalar_fields,
            line_items_bundle=line_items_bundle,
            invariants=invariants_list,
            sod_metadata=sod_metadata,
            recent_audit_events=recent_audits,
        )

    async def claim_document_for_review(
        self,
        org_id: uuid.UUID,
        ws_id: uuid.UUID,
        doc_id: uuid.UUID,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> Dict[str, Any]:
        """Claim document for review, locking row and transitioning state to IN_REVIEW."""
        if actor_role not in REVIEW_ROLES:
            raise AuthorizationError(f"Role '{actor_role}' does not have review permissions")

        tenant_context = TenantContext(
            org_id=org_id,
            user_id=actor_id,
            user_role=actor_role,
        )

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await apply_tenant_rls_context(conn, context=tenant_context, enforce_app_role=True)

                doc = await conn.fetchrow(
                    """
                    SELECT id, status, metadata FROM documents
                    WHERE organization_id = $1 AND workspace_id = $2 AND id = $3 AND is_deleted = FALSE
                    FOR UPDATE
                    """,
                    org_id,
                    ws_id,
                    doc_id,
                )
                if not doc:
                    raise NotFoundError("Document not found in workspace")

                if doc["status"] not in ("NEEDS_REVIEW", "COMPLETED", "PROCESSING"):
                    raise ValidationError(
                        f"Document with status '{doc['status']}' cannot be claimed for review"
                    )

                meta = doc["metadata"] or {}
                if isinstance(meta, str):
                    meta = json.loads(meta)

                meta["assigned_reviewer_id"] = str(actor_id)
                meta["review_started_at"] = datetime.now(timezone.utc).isoformat()

                await conn.execute(
                    """
                    UPDATE documents
                    SET status = 'IN_REVIEW', metadata = $4::jsonb, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1 AND organization_id = $2 AND workspace_id = $3
                    """,
                    doc_id,
                    org_id,
                    ws_id,
                    json.dumps(meta),
                )

                # Fetch tenant slug
                org_row = await conn.fetchrow("SELECT slug FROM organizations WHERE id = $1", org_id)
                tenant_slug = org_row["slug"] if org_row else "unknown"

                await conn.execute(
                    """
                    INSERT INTO audit_logs (
                        organization_id, tenant_slug_snapshot, workspace_id,
                        user_id, user_role_snapshot, action, entity_type, entity_id,
                        previous_state, new_state
                    ) VALUES ($1, $2, $3, $4, $5, 'DOCUMENT_REVIEW_CLAIMED', 'document', $6, $7::jsonb, $8::jsonb)
                    """,
                    org_id,
                    tenant_slug,
                    ws_id,
                    actor_id,
                    actor_role,
                    doc_id,
                    json.dumps({"status": doc["status"]}),
                    json.dumps({"status": "IN_REVIEW", "assigned_reviewer_id": str(actor_id)}),
                )

        return {"message": "Document claimed for review", "status": "IN_REVIEW", "assigned_reviewer_id": str(actor_id)}

    async def correct_field(
        self,
        org_id: uuid.UUID,
        ws_id: uuid.UUID,
        doc_id: uuid.UUID,
        payload: FieldCorrectionRequest,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> Dict[str, Any]:
        """Apply human reviewer correction to an extracted field and re-evaluate invariants."""
        if actor_role not in REVIEW_ROLES:
            raise AuthorizationError(f"Role '{actor_role}' does not have review/correction permissions")

        tenant_context = TenantContext(
            org_id=org_id,
            user_id=actor_id,
            user_role=actor_role,
        )

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await apply_tenant_rls_context(conn, context=tenant_context, enforce_app_role=True)

                doc = await conn.fetchrow(
                    """
                    SELECT id, status, metadata FROM documents
                    WHERE organization_id = $1 AND workspace_id = $2 AND id = $3 AND is_deleted = FALSE
                    FOR UPDATE
                    """,
                    org_id,
                    ws_id,
                    doc_id,
                )
                if not doc:
                    raise NotFoundError("Document not found in workspace")

                if doc["status"] not in ("IN_REVIEW", "NEEDS_REVIEW", "COMPLETED"):
                    raise ValidationError(f"Cannot correct fields on document with status '{doc['status']}'")

                # Fetch target extracted field
                field_row = await conn.fetchrow(
                    """
                    SELECT id, field_name, field_value_raw, field_value_normalized,
                           confidence, bounding_box, is_verified, verified_value
                    FROM extracted_fields
                    WHERE organization_id = $1 AND workspace_id = $2 AND document_id = $3 AND field_name = $4
                    FOR UPDATE
                    """,
                    org_id,
                    ws_id,
                    doc_id,
                    payload.field_name,
                )

                ver_val = payload.corrected_value_normalized
                raw_val = payload.corrected_value_raw or (field_row["field_value_raw"] if field_row else "")
                bbox_json = json.dumps(payload.bounding_box) if payload.bounding_box else (field_row["bounding_box"] if field_row else None)

                if field_row:
                    prev_state = {
                        "field_value_raw": field_row["field_value_raw"],
                        "field_value_normalized": field_row["field_value_normalized"],
                        "is_verified": field_row["is_verified"],
                        "verified_value": field_row["verified_value"],
                    }
                    await conn.execute(
                        """
                        UPDATE extracted_fields
                        SET field_value_raw = $5,
                            verified_value = $6::jsonb,
                            bounding_box = $7::jsonb,
                            is_verified = TRUE,
                            verified_by_user_id = $8,
                            verified_at = CURRENT_TIMESTAMP
                        WHERE organization_id = $1 AND workspace_id = $2 AND document_id = $3 AND field_name = $4
                        """,
                        org_id,
                        ws_id,
                        doc_id,
                        payload.field_name,
                        raw_val,
                        json.dumps(ver_val),
                        bbox_json,
                        actor_id,
                    )
                else:
                    prev_state = None
                    await conn.execute(
                        """
                        INSERT INTO extracted_fields (
                            organization_id, workspace_id, document_id, field_name,
                            field_value_raw, field_value_normalized, confidence,
                            bounding_box, is_verified, verified_value, verified_by_user_id, verified_at
                        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, 1.0, $7::jsonb, TRUE, $6::jsonb, $8, CURRENT_TIMESTAMP)
                        """,
                        org_id,
                        ws_id,
                        doc_id,
                        payload.field_name,
                        raw_val,
                        json.dumps(ver_val),
                        bbox_json,
                        actor_id,
                    )

                # Re-evaluate accounting invariants with updated values
                refreshed_invariants = await self._reevaluate_invariants(conn, org_id, ws_id, doc_id)

                meta = doc["metadata"] or {}
                if isinstance(meta, str):
                    meta = json.loads(meta)
                meta["invariants"] = refreshed_invariants

                await conn.execute(
                    """
                    UPDATE documents
                    SET metadata = $4::jsonb, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1 AND organization_id = $2 AND workspace_id = $3
                    """,
                    doc_id,
                    org_id,
                    ws_id,
                    json.dumps(meta),
                )

                # Record audit log
                org_row = await conn.fetchrow("SELECT slug FROM organizations WHERE id = $1", org_id)
                tenant_slug = org_row["slug"] if org_row else "unknown"

                await conn.execute(
                    """
                    INSERT INTO audit_logs (
                        organization_id, tenant_slug_snapshot, workspace_id,
                        user_id, user_role_snapshot, action, entity_type, entity_id,
                        previous_state, new_state
                    ) VALUES ($1, $2, $3, $4, $5, 'DOCUMENT_FIELD_CORRECTED', 'extracted_fields', $6, $7::jsonb, $8::jsonb)
                    """,
                    org_id,
                    tenant_slug,
                    ws_id,
                    actor_id,
                    actor_role,
                    doc_id,
                    json.dumps(prev_state) if prev_state else None,
                    json.dumps({
                        "field_name": payload.field_name,
                        "corrected_value": ver_val,
                        "comment": payload.comment,
                    }),
                )

        return {
            "message": f"Field '{payload.field_name}' successfully corrected",
            "field_name": payload.field_name,
            "corrected_value": ver_val,
            "refreshed_invariants": refreshed_invariants,
        }

    async def correct_line_item(
        self,
        org_id: uuid.UUID,
        ws_id: uuid.UUID,
        doc_id: uuid.UUID,
        payload: LineItemCorrectionRequest,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> Dict[str, Any]:
        """Apply human reviewer correction to a specific cell in the extracted line items table."""
        if actor_role not in REVIEW_ROLES:
            raise AuthorizationError(f"Role '{actor_role}' does not have review/correction permissions")

        tenant_context = TenantContext(
            org_id=org_id,
            user_id=actor_id,
            user_role=actor_role,
        )

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await apply_tenant_rls_context(conn, context=tenant_context, enforce_app_role=True)

                doc = await conn.fetchrow(
                    """
                    SELECT id, status, metadata FROM documents
                    WHERE organization_id = $1 AND workspace_id = $2 AND id = $3 AND is_deleted = FALSE
                    FOR UPDATE
                    """,
                    org_id,
                    ws_id,
                    doc_id,
                )
                if not doc:
                    raise NotFoundError("Document not found in workspace")

                if doc["status"] not in ("IN_REVIEW", "NEEDS_REVIEW", "COMPLETED"):
                    raise ValidationError(f"Cannot correct line items on document with status '{doc['status']}'")

                field_row = await conn.fetchrow(
                    """
                    SELECT id, field_name, field_value_normalized, verified_value
                    FROM extracted_fields
                    WHERE organization_id = $1 AND workspace_id = $2 AND document_id = $3 AND field_name IN ('line_items', 'table_line_items')
                    FOR UPDATE
                    """,
                    org_id,
                    ws_id,
                    doc_id,
                )
                if not field_row:
                    raise NotFoundError("No line items table bundle found on this document")

                items_val = field_row["verified_value"] if field_row["verified_value"] else field_row["field_value_normalized"]
                if isinstance(items_val, str):
                    items_val = json.loads(items_val)

                table_data = items_val.get("table", items_val) if isinstance(items_val, dict) else items_val
                rows = table_data.get("rows", []) if isinstance(table_data, dict) else (table_data if isinstance(table_data, list) else [])

                if payload.line_item_index >= len(rows):
                    raise ValidationError(f"Line item index {payload.line_item_index} exceeds total rows ({len(rows)})")

                target_row = rows[payload.line_item_index]
                prev_val = target_row.get(payload.field_name)
                target_row[payload.field_name] = payload.corrected_value

                # If quantity or unit_price was modified, auto-recalculate subtotal and line_net
                if payload.field_name in ("unit_price", "quantity"):
                    try:
                        u_price = Decimal(str(target_row.get("unit_price", 0)))
                        qty = Decimal(str(target_row.get("quantity", 1)))
                        sub_val = str(round(u_price * qty, 2))
                        target_row["subtotal"] = sub_val
                        target_row["line_net"] = sub_val
                    except Exception:
                        pass
                elif payload.field_name in ("subtotal", "line_net"):
                    target_row["subtotal"] = str(payload.corrected_value)
                    target_row["line_net"] = str(payload.corrected_value)

                updated_bundle = {"table": {"rows": rows}} if isinstance(items_val, dict) and "table" in items_val else rows

                await conn.execute(
                    """
                    UPDATE extracted_fields
                    SET verified_value = $4::jsonb,
                        is_verified = TRUE,
                        verified_by_user_id = $5,
                        verified_at = CURRENT_TIMESTAMP
                    WHERE organization_id = $1 AND workspace_id = $2 AND document_id = $3 AND id = $6
                    """,
                    org_id,
                    ws_id,
                    doc_id,
                    json.dumps(updated_bundle),
                    actor_id,
                    field_row["id"],
                )

                # Re-evaluate invariants
                refreshed_invariants = await self._reevaluate_invariants(conn, org_id, ws_id, doc_id)

                meta = doc["metadata"] or {}
                if isinstance(meta, str):
                    meta = json.loads(meta)
                meta["invariants"] = refreshed_invariants

                await conn.execute(
                    """
                    UPDATE documents
                    SET metadata = $4::jsonb, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1 AND organization_id = $2 AND workspace_id = $3
                    """,
                    doc_id,
                    org_id,
                    ws_id,
                    json.dumps(meta),
                )

                org_row = await conn.fetchrow("SELECT slug FROM organizations WHERE id = $1", org_id)
                tenant_slug = org_row["slug"] if org_row else "unknown"

                await conn.execute(
                    """
                    INSERT INTO audit_logs (
                        organization_id, tenant_slug_snapshot, workspace_id,
                        user_id, user_role_snapshot, action, entity_type, entity_id,
                        previous_state, new_state
                    ) VALUES ($1, $2, $3, $4, $5, 'DOCUMENT_LINE_ITEM_CORRECTED', 'extracted_fields', $6, $7::jsonb, $8::jsonb)
                    """,
                    org_id,
                    tenant_slug,
                    ws_id,
                    actor_id,
                    actor_role,
                    doc_id,
                    json.dumps({"row_index": payload.line_item_index, "field": payload.field_name, "prev_val": prev_val}),
                    json.dumps({
                        "row_index": payload.line_item_index,
                        "field": payload.field_name,
                        "new_val": payload.corrected_value,
                        "comment": payload.comment,
                    }),
                )

        return {
            "message": f"Line item {payload.line_item_index} field '{payload.field_name}' corrected",
            "updated_row": target_row,
            "refreshed_invariants": refreshed_invariants,
        }

    async def apply_auditor_override(
        self,
        org_id: uuid.UUID,
        ws_id: uuid.UUID,
        doc_id: uuid.UUID,
        payload: InvariantOverrideRequest,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> Dict[str, Any]:
        """Apply an auditor override to an allowable failing invariant under INV-010 policy."""
        if actor_role not in REVIEW_ROLES:
            raise AuthorizationError(f"Role '{actor_role}' does not have auditor override permissions")

        # Hard stop invariants cannot be overridden under INV-010
        if payload.invariant_id in ("INV-008", "INV-002", "INV-010"):
            raise ValidationError(
                f"Invariant '{payload.invariant_id}' is a mandatory hard stop and cannot be overridden by policy (INV-010)."
            )

        tenant_context = TenantContext(
            org_id=org_id,
            user_id=actor_id,
            user_role=actor_role,
        )

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await apply_tenant_rls_context(conn, context=tenant_context, enforce_app_role=True)

                doc = await conn.fetchrow(
                    """
                    SELECT id, status, metadata FROM documents
                    WHERE organization_id = $1 AND workspace_id = $2 AND id = $3 AND is_deleted = FALSE
                    FOR UPDATE
                    """,
                    org_id,
                    ws_id,
                    doc_id,
                )
                if not doc:
                    raise NotFoundError("Document not found in workspace")

                meta = doc["metadata"] or {}
                if isinstance(meta, str):
                    meta = json.loads(meta)

                inv_evals = meta.get("invariants") or meta.get("invariant_evaluations") or []
                target_inv = next((inv for inv in inv_evals if (inv.get("invariant_id") == payload.invariant_id or inv.get("rule_id") == payload.invariant_id)), None)

                if not target_inv:
                    raise ValidationError(f"Target invariant '{payload.invariant_id}' not found on this document")

                overrides = meta.setdefault("overrides", {})
                overrides[payload.invariant_id] = {
                    "rationale": payload.override_rationale,
                    "overridden_by": str(actor_id),
                    "overridden_at": datetime.now(timezone.utc).isoformat(),
                    "role": actor_role,
                }

                await conn.execute(
                    """
                    UPDATE documents
                    SET metadata = $4::jsonb, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1 AND organization_id = $2 AND workspace_id = $3
                    """,
                    doc_id,
                    org_id,
                    ws_id,
                    json.dumps(meta),
                )

                org_row = await conn.fetchrow("SELECT slug FROM organizations WHERE id = $1", org_id)
                tenant_slug = org_row["slug"] if org_row else "unknown"

                await conn.execute(
                    """
                    INSERT INTO audit_logs (
                        organization_id, tenant_slug_snapshot, workspace_id,
                        user_id, user_role_snapshot, action, entity_type, entity_id,
                        previous_state, new_state
                    ) VALUES ($1, $2, $3, $4, $5, 'DOCUMENT_INVARIANT_OVERRIDDEN', 'document', $6, $7::jsonb, $8::jsonb)
                    """,
                    org_id,
                    tenant_slug,
                    ws_id,
                    actor_id,
                    actor_role,
                    doc_id,
                    json.dumps({"invariant_id": payload.invariant_id, "status": "FAILED"}),
                    json.dumps({
                        "invariant_id": payload.invariant_id,
                        "status": "OVERRIDDEN",
                        "rationale": payload.override_rationale,
                    }),
                )

        return {
            "message": f"Auditor override applied to invariant '{payload.invariant_id}'",
            "invariant_id": payload.invariant_id,
            "rationale": payload.override_rationale,
            "overridden_by": str(actor_id),
        }

    async def verify_document(
        self,
        org_id: uuid.UUID,
        ws_id: uuid.UUID,
        doc_id: uuid.UUID,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> Dict[str, Any]:
        """Verify document completeness, validating that all invariants pass or possess active overrides."""
        if actor_role not in REVIEW_ROLES:
            raise AuthorizationError(f"Role '{actor_role}' does not have verification permissions")

        tenant_context = TenantContext(
            org_id=org_id,
            user_id=actor_id,
            user_role=actor_role,
        )

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await apply_tenant_rls_context(conn, context=tenant_context, enforce_app_role=True)

                doc = await conn.fetchrow(
                    """
                    SELECT id, status, metadata FROM documents
                    WHERE organization_id = $1 AND workspace_id = $2 AND id = $3 AND is_deleted = FALSE
                    FOR UPDATE
                    """,
                    org_id,
                    ws_id,
                    doc_id,
                )
                if not doc:
                    raise NotFoundError("Document not found in workspace")

                if doc["status"] not in ("IN_REVIEW", "NEEDS_REVIEW"):
                    raise ValidationError(f"Document must be in 'IN_REVIEW' or 'NEEDS_REVIEW' state to verify (current: '{doc['status']}')")

                meta = doc["metadata"] or {}
                if isinstance(meta, str):
                    meta = json.loads(meta)

                inv_evals = meta.get("invariants") or meta.get("invariant_evaluations") or []
                overrides = meta.get("overrides") or {}

                # Check for unoverridden failures
                unoverridden = []
                for inv in inv_evals:
                    if inv.get("outcome") == "FAILED":
                        inv_id = inv.get("invariant_id") or inv.get("rule_id")
                        if inv_id not in overrides:
                            unoverridden.append(inv_id)

                if unoverridden:
                    raise ValidationError(
                        f"Cannot verify document: Failing invariants {unoverridden} require correction or formal auditor override."
                    )

                meta["verified_by_user_id"] = str(actor_id)
                meta["verified_at"] = datetime.now(timezone.utc).isoformat()

                await conn.execute(
                    """
                    UPDATE documents
                    SET status = 'VERIFIED', metadata = $4::jsonb, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1 AND organization_id = $2 AND workspace_id = $3
                    """,
                    doc_id,
                    org_id,
                    ws_id,
                    json.dumps(meta),
                )

                org_row = await conn.fetchrow("SELECT slug FROM organizations WHERE id = $1", org_id)
                tenant_slug = org_row["slug"] if org_row else "unknown"

                await conn.execute(
                    """
                    INSERT INTO audit_logs (
                        organization_id, tenant_slug_snapshot, workspace_id,
                        user_id, user_role_snapshot, action, entity_type, entity_id,
                        previous_state, new_state
                    ) VALUES ($1, $2, $3, $4, $5, 'DOCUMENT_VERIFIED', 'document', $6, $7::jsonb, $8::jsonb)
                    """,
                    org_id,
                    tenant_slug,
                    ws_id,
                    actor_id,
                    actor_role,
                    doc_id,
                    json.dumps({"status": doc["status"]}),
                    json.dumps({"status": "VERIFIED", "verified_by": str(actor_id)}),
                )

        return {"message": "Document successfully verified", "status": "VERIFIED", "verified_by": str(actor_id)}

    async def approve_document(
        self,
        org_id: uuid.UUID,
        ws_id: uuid.UUID,
        doc_id: uuid.UUID,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> Dict[str, Any]:
        """
        Approve document into terminal verified accounting status.
        Enforces canonical RBAC (only WORKSPACE_ADMIN / ORGANIZATION_ADMIN) and
        Segregation of Duties dual-custody barriers (AUTH_SOD_001, AUTH_SOD_002).
        """
        if actor_role == "DOCUMENT_MANAGER":
            raise AuthorizationError("Role 'DOCUMENT_MANAGER' is barred from approving documents under canonical RBAC")

        if actor_role not in APPROVAL_ROLES:
            raise AuthorizationError(f"Role '{actor_role}' does not possess administrative approval authority")

        tenant_context = TenantContext(
            org_id=org_id,
            user_id=actor_id,
            user_role=actor_role,
        )

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await apply_tenant_rls_context(conn, context=tenant_context, enforce_app_role=True)

                doc = await conn.fetchrow(
                    """
                    SELECT id, status, uploaded_by_user_id, metadata FROM documents
                    WHERE organization_id = $1 AND workspace_id = $2 AND id = $3 AND is_deleted = FALSE
                    FOR UPDATE
                    """,
                    org_id,
                    ws_id,
                    doc_id,
                )
                if not doc:
                    raise NotFoundError("Document not found in workspace")

                # Segregation of Duties Rule 1 (AUTH_SOD_001): Uploader cannot approve
                if doc["uploaded_by_user_id"] == actor_id:
                    raise AuthorizationError(
                        "Segregation of Duties violation: The user who uploaded this document cannot approve it (AUTH_SOD_001)"
                    )

                # Segregation of Duties Rule 2 (AUTH_SOD_002): Corrector cannot approve
                corrector_row = await conn.fetchrow(
                    """
                    SELECT 1 FROM extracted_fields
                    WHERE organization_id = $1 AND workspace_id = $2 AND document_id = $3
                      AND verified_by_user_id = $4
                    LIMIT 1
                    """,
                    org_id,
                    ws_id,
                    doc_id,
                    actor_id,
                )
                if corrector_row:
                    raise AuthorizationError(
                        "Segregation of Duties violation: The reviewer who performed field corrections cannot approve it (AUTH_SOD_002)"
                    )

                if doc["status"] != "VERIFIED":
                    raise ValidationError(
                        f"Document must be in 'VERIFIED' status before approval (current: '{doc['status']}')."
                    )

                meta = doc["metadata"] or {}
                if isinstance(meta, str):
                    meta = json.loads(meta)

                meta["approved_by_user_id"] = str(actor_id)
                meta["approved_at"] = datetime.now(timezone.utc).isoformat()

                await conn.execute(
                    """
                    UPDATE documents
                    SET status = 'APPROVED', metadata = $4::jsonb, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1 AND organization_id = $2 AND workspace_id = $3
                    """,
                    doc_id,
                    org_id,
                    ws_id,
                    json.dumps(meta),
                )

                org_row = await conn.fetchrow("SELECT slug FROM organizations WHERE id = $1", org_id)
                tenant_slug = org_row["slug"] if org_row else "unknown"

                await conn.execute(
                    """
                    INSERT INTO audit_logs (
                        organization_id, tenant_slug_snapshot, workspace_id,
                        user_id, user_role_snapshot, action, entity_type, entity_id,
                        previous_state, new_state
                    ) VALUES ($1, $2, $3, $4, $5, 'DOCUMENT_APPROVED', 'document', $6, $7::jsonb, $8::jsonb)
                    """,
                    org_id,
                    tenant_slug,
                    ws_id,
                    actor_id,
                    actor_role,
                    doc_id,
                    json.dumps({"status": "VERIFIED"}),
                    json.dumps({"status": "APPROVED", "approved_by": str(actor_id)}),
                )

        return {"message": "Document successfully approved", "status": "APPROVED", "approved_by": str(actor_id)}

    async def reject_document(
        self,
        org_id: uuid.UUID,
        ws_id: uuid.UUID,
        doc_id: uuid.UUID,
        payload: DocumentRejectRequest,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> Dict[str, Any]:
        """Formally reject a document with mandatory justification."""
        if actor_role not in REVIEW_ROLES:
            raise AuthorizationError(f"Role '{actor_role}' does not have review permissions")

        tenant_context = TenantContext(
            org_id=org_id,
            user_id=actor_id,
            user_role=actor_role,
        )

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await apply_tenant_rls_context(conn, context=tenant_context, enforce_app_role=True)

                doc = await conn.fetchrow(
                    """
                    SELECT id, status, metadata FROM documents
                    WHERE organization_id = $1 AND workspace_id = $2 AND id = $3 AND is_deleted = FALSE
                    FOR UPDATE
                    """,
                    org_id,
                    ws_id,
                    doc_id,
                )
                if not doc:
                    raise NotFoundError("Document not found in workspace")

                if doc["status"] == "APPROVED" and actor_role not in APPROVAL_ROLES:
                    raise AuthorizationError("Only workspace or organization admins can reject an already approved document")

                meta = doc["metadata"] or {}
                if isinstance(meta, str):
                    meta = json.loads(meta)

                meta["rejection_reason"] = payload.rejection_reason
                meta["rejected_by_user_id"] = str(actor_id)
                meta["rejected_at"] = datetime.now(timezone.utc).isoformat()

                await conn.execute(
                    """
                    UPDATE documents
                    SET status = 'REJECTED', metadata = $4::jsonb, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1 AND organization_id = $2 AND workspace_id = $3
                    """,
                    doc_id,
                    org_id,
                    ws_id,
                    json.dumps(meta),
                )

                org_row = await conn.fetchrow("SELECT slug FROM organizations WHERE id = $1", org_id)
                tenant_slug = org_row["slug"] if org_row else "unknown"

                await conn.execute(
                    """
                    INSERT INTO audit_logs (
                        organization_id, tenant_slug_snapshot, workspace_id,
                        user_id, user_role_snapshot, action, entity_type, entity_id,
                        previous_state, new_state
                    ) VALUES ($1, $2, $3, $4, $5, 'DOCUMENT_REJECTED', 'document', $6, $7::jsonb, $8::jsonb)
                    """,
                    org_id,
                    tenant_slug,
                    ws_id,
                    actor_id,
                    actor_role,
                    doc_id,
                    json.dumps({"status": doc["status"]}),
                    json.dumps({"status": "REJECTED", "reason": payload.rejection_reason, "rejected_by": str(actor_id)}),
                )

        return {"message": "Document formally rejected", "status": "REJECTED", "rejection_reason": payload.rejection_reason}

    async def reopen_document(
        self,
        org_id: uuid.UUID,
        ws_id: uuid.UUID,
        doc_id: uuid.UUID,
        payload: DocumentReopenRequest,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> Dict[str, Any]:
        """Reopen a rejected or previously approved document back into review."""
        if actor_role not in REVIEW_ROLES:
            raise AuthorizationError(f"Role '{actor_role}' does not have review permissions")

        tenant_context = TenantContext(
            org_id=org_id,
            user_id=actor_id,
            user_role=actor_role,
        )

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await apply_tenant_rls_context(conn, context=tenant_context, enforce_app_role=True)

                doc = await conn.fetchrow(
                    """
                    SELECT id, status, metadata FROM documents
                    WHERE organization_id = $1 AND workspace_id = $2 AND id = $3 AND is_deleted = FALSE
                    FOR UPDATE
                    """,
                    org_id,
                    ws_id,
                    doc_id,
                )
                if not doc:
                    raise NotFoundError("Document not found in workspace")

                if doc["status"] == "APPROVED" and actor_role not in APPROVAL_ROLES:
                    raise AuthorizationError("Only workspace or organization admins can reopen an approved document")

                meta = doc["metadata"] or {}
                if isinstance(meta, str):
                    meta = json.loads(meta)

                meta["reopened_by_user_id"] = str(actor_id)
                meta["reopen_reason"] = payload.reason
                meta["reopened_at"] = datetime.now(timezone.utc).isoformat()

                await conn.execute(
                    """
                    UPDATE documents
                    SET status = 'NEEDS_REVIEW', metadata = $4::jsonb, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1 AND organization_id = $2 AND workspace_id = $3
                    """,
                    doc_id,
                    org_id,
                    ws_id,
                    json.dumps(meta),
                )

                org_row = await conn.fetchrow("SELECT slug FROM organizations WHERE id = $1", org_id)
                tenant_slug = org_row["slug"] if org_row else "unknown"

                await conn.execute(
                    """
                    INSERT INTO audit_logs (
                        organization_id, tenant_slug_snapshot, workspace_id,
                        user_id, user_role_snapshot, action, entity_type, entity_id,
                        previous_state, new_state
                    ) VALUES ($1, $2, $3, $4, $5, 'DOCUMENT_REOPENED', 'document', $6, $7::jsonb, $8::jsonb)
                    """,
                    org_id,
                    tenant_slug,
                    ws_id,
                    actor_id,
                    actor_role,
                    doc_id,
                    json.dumps({"status": doc["status"]}),
                    json.dumps({"status": "NEEDS_REVIEW", "reason": payload.reason}),
                )

        return {"message": "Document successfully reopened", "status": "NEEDS_REVIEW"}

    async def _reevaluate_invariants(
        self,
        conn: asyncpg.Connection,
        org_id: uuid.UUID,
        ws_id: uuid.UUID,
        doc_id: uuid.UUID,
    ) -> List[Dict[str, Any]]:
        """Re-evaluate all canonical accounting invariants across active verified/normalized values."""
        field_rows = await conn.fetch(
            """
            SELECT field_name, field_value_normalized, is_verified, verified_value
            FROM extracted_fields
            WHERE organization_id = $1 AND workspace_id = $2 AND document_id = $3
            """,
            org_id,
            ws_id,
            doc_id,
        )

        field_map = {}
        for r in field_rows:
            val = r["verified_value"] if r["is_verified"] and r["verified_value"] is not None else r["field_value_normalized"]
            if isinstance(val, str):
                try:
                    val = json.loads(val)
                except Exception:
                    pass
            field_map[r["field_name"]] = val

        def _to_dec(k: str) -> Optional[Decimal]:
            v = field_map.get(k)
            if v is None:
                return None
            try:
                return Decimal(str(v).replace("$", "").replace(",", "").strip())
            except Exception:
                return None

        # Build LineItemField sequence from table bundle
        line_items_data = field_map.get("line_items") or field_map.get("table_line_items") or []
        if isinstance(line_items_data, dict):
            line_items_data = line_items_data.get("table", {}).get("rows", [])
        if not isinstance(line_items_data, list):
            line_items_data = []

        line_items: List[LineItemField] = []
        for i, item in enumerate(line_items_data):
            if not isinstance(item, dict):
                continue
            
            ln = item.get("line_number") or item.get("line_index")
            if ln is None or not isinstance(ln, int) or ln < 1:
                ln = i + 1
            
            desc = str(item.get("description") or f"Line Item {ln}").strip()
            if not desc:
                desc = f"Line Item {ln}"
            
            qty_val = item.get("quantity")
            qty_dec = None
            if qty_val is not None:
                try:
                    qty_dec = Decimal(str(qty_val).replace(",", "").strip())
                except Exception:
                    qty_dec = None

            up_val = item.get("unit_price")
            up_dec = None
            if up_val is not None:
                try:
                    up_dec = Decimal(str(up_val).replace("$", "").replace(",", "").strip())
                except Exception:
                    up_dec = None

            raw_net = item.get("line_net")
            if raw_net is None:
                raw_net = item.get("subtotal", item.get("total"))
            if raw_net is not None:
                try:
                    line_net_dec = Decimal(str(raw_net).replace("$", "").replace(",", "").strip())
                except Exception:
                    line_net_dec = (qty_dec * up_dec) if (qty_dec is not None and up_dec is not None) else Decimal("0.00")
            elif qty_dec is not None and up_dec is not None:
                line_net_dec = qty_dec * up_dec
            else:
                line_net_dec = Decimal("0.00")

            tx_val = item.get("tax_amount")
            tx_dec = None
            if tx_val is not None:
                try:
                    tx_dec = Decimal(str(tx_val).replace("$", "").replace(",", "").strip())
                except Exception:
                    tx_dec = None

            lt_val = item.get("line_total") or item.get("gross_total")
            lt_dec = None
            if lt_val is not None:
                try:
                    lt_dec = Decimal(str(lt_val).replace("$", "").replace(",", "").strip())
                except Exception:
                    lt_dec = None
            elif tx_dec is not None:
                lt_dec = line_net_dec + tx_dec

            line_items.append(
                LineItemField(
                    line_number=ln,
                    description=desc,
                    line_net=line_net_dec,
                    quantity=qty_dec,
                    unit_price=up_dec,
                    tax_amount=tx_dec,
                    line_total=lt_dec,
                )
            )

        currency_str = str(field_map.get("currency") or "USD").upper()
        if len(currency_str) > 3:
            currency_str = "USD"

        eval_results = evaluate_all_accounting_invariants(
            line_items=line_items,
            subtotal=_to_dec("subtotal"),
            tax_amount=_to_dec("tax_amount"),
            discount_amount=_to_dec("discount_amount"),
            total_amount=_to_dec("total_amount"),
            currency_code=currency_str,
            supplier_tax_id=str(field_map.get("supplier_tax_id")) if field_map.get("supplier_tax_id") else None,
            customer_tax_id=str(field_map.get("customer_tax_id")) if field_map.get("customer_tax_id") else None,
        )

        return [
            {
                "invariant_id": str(res.invariant_id.value if hasattr(res.invariant_id, "value") else res.invariant_id),
                "name": str(res.invariant_id.value if hasattr(res.invariant_id, "value") else res.invariant_id),
                "outcome": res.outcome.value if hasattr(res.outcome, "value") else str(res.outcome),
                "message": res.diagnostic_message,
                "delta": str(res.delta) if res.delta is not None else None,
                "expected": str(res.expected_value) if res.expected_value is not None else None,
                "observed": str(res.observed_value) if res.observed_value is not None else None,
            }
            for res in eval_results
        ]


verification_service = VerificationService()
