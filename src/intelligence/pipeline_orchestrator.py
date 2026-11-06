"""
Document Processing Pipeline End-to-End Orchestrator (Phase 4 Step 5).
Coordinates storage download, document parsing (PDF, spreadsheet, OCR),
document classification, structured extraction, table/line-item parsing,
accounting invariants evaluation, and persistence to PostgreSQL under tenant RLS.
"""
from __future__ import annotations

import io
import json
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Union
import uuid

import asyncpg
import structlog

from src.db.rls import apply_tenant_rls_context, TenantContext
from src.exceptions import NotFoundError, ProcessingError
from src.storage.s3 import storage_manager
from src.services.job_queue import JobRecord
from src.intelligence.classifier import DocumentClassifier
from src.intelligence.extraction_schemas import (
    DocumentType,
    InvoiceExtractionSchema,
    ContractExtractionSchema,
)
from src.intelligence.models import (
    BoundingBox,
    ExtractedPage,
    PageClassification,
    TextBlock,
    WordElement,
    TableRegion,
)
from src.intelligence.pdf_extractor import extract_pdf_document
from src.intelligence.spreadsheet_extractor import SpreadsheetExtractor
from src.intelligence.hybrid_structured_extractor import (
    HybridStructuredExtractor,
    TablePersistenceService,
)

logger = structlog.get_logger(__name__)


class DocumentPipelineOrchestrator:
    """
    Orchestrates the entire document intelligence lifecycle:
    Fetch -> Parse/Render -> Classify -> Extract -> Validate Invariants -> Persist -> Audit.
    """

    def __init__(
        self,
        pool: asyncpg.Pool,
        extractor: Optional[HybridStructuredExtractor] = None,
        use_gpu: bool = False,
    ) -> None:
        self.pool = pool
        self.extractor = extractor or HybridStructuredExtractor(use_gpu=use_gpu)
        self.spreadsheet_extractor = SpreadsheetExtractor()

    async def process_document_job(self, job: JobRecord) -> Dict[str, Any]:
        """
        Execute document processing for a claimed queue job.
        Runs within the tenant's transaction boundary.
        """
        return await self.process_document(
            org_id=job.organization_id,
            ws_id=job.workspace_id,
            doc_id=job.document_id,
            job_id=job.id,
        )

    async def process_document(
        self,
        org_id: uuid.UUID,
        ws_id: uuid.UUID,
        doc_id: uuid.UUID,
        job_id: Optional[uuid.UUID] = None,
        actor_id: Optional[uuid.UUID] = None,
    ) -> Dict[str, Any]:
        """
        Execute the full document intelligence pipeline on a target document.
        Strictly applies tenant RLS context to guarantee isolation.
        """
        logger.info(
            "Starting document intelligence pipeline",
            org_id=str(org_id),
            ws_id=str(ws_id),
            doc_id=str(doc_id),
            job_id=str(job_id) if job_id else None,
        )

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                # 1. Establish tenant transaction context
                tenant_ctx = TenantContext(
                    org_id=org_id,
                    workspace_id=ws_id,
                    user_id=actor_id,
                    user_role="ORGANIZATION_ADMIN",
                    is_platform_admin=False,
                )
                await apply_tenant_rls_context(conn, tenant_ctx, enforce_app_role=True)

                # 2. Retrieve document metadata
                doc = await conn.fetchrow(
                    """
                    SELECT id, organization_id, workspace_id, filename, s3_key,
                           mime_type, file_size_bytes, category, metadata, status
                    FROM documents
                    WHERE organization_id = $1 AND workspace_id = $2 AND id = $3 AND is_deleted = FALSE
                    FOR UPDATE
                    """,
                    org_id,
                    ws_id,
                    doc_id,
                )

                if doc is None:
                    raise NotFoundError(f"Document {doc_id} not found in workspace {ws_id}")

                # 3. Transition document status to PROCESSING
                await conn.execute(
                    """
                    UPDATE documents
                    SET status = 'PROCESSING',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE organization_id = $1 AND workspace_id = $2 AND id = $3
                    """,
                    org_id,
                    ws_id,
                    doc_id,
                )

                # 4. Download document content from object storage
                s3_key = doc["s3_key"]
                filename = doc["filename"]
                mime_type = doc["mime_type"] or "application/octet-stream"

                try:
                    file_bytes = storage_manager.download_bytes(s3_key)
                except Exception as exc:
                    logger.error("Failed to download document from storage", key=s3_key, error=str(exc))
                    raise ProcessingError(f"Storage download failed: {exc}")

                # 5. Extract pages & text blocks based on mime type
                pages = self._extract_pages_from_bytes(file_bytes, filename, mime_type)
                if not pages:
                    logger.warning("No pages could be extracted from document", doc_id=str(doc_id))

                # 6. Execute Hybrid Structured Extraction (Classification, Headers, Tables, Invariants)
                schema = self.extractor.extract_document(pages)

                # 7. Persist extracted fields and line items to PostgreSQL
                persisted_bundle: Dict[str, Any] = {}
                if isinstance(schema, InvoiceExtractionSchema):
                    persisted_bundle = await TablePersistenceService.persist_table_extraction_bundle(
                        conn=conn,
                        org_id=org_id,
                        workspace_id=ws_id,
                        document_id=doc_id,
                        schema=schema,
                        actor_id=actor_id,
                    )

                # 8. Compile invariants and metrics summary
                invariants_summary = {"passed": 0, "failed": 0, "not_evaluable": 0, "total": 0}
                if isinstance(schema, InvoiceExtractionSchema):
                    for inv in schema.invariant_evaluations:
                        st = inv.outcome.value if hasattr(inv.outcome, "value") else str(inv.outcome)
                        if st == "PASSED":
                            invariants_summary["passed"] += 1
                        elif st == "FAILED":
                            invariants_summary["failed"] += 1
                        else:
                            invariants_summary["not_evaluable"] += 1
                        invariants_summary["total"] += 1

                extracted_fields_count = len(persisted_bundle.get("persisted_fields", []))
                line_items_count = len(schema.line_items) if isinstance(schema, InvoiceExtractionSchema) else 0

                pipeline_metadata = {
                    "pipeline_version": "4.5.0",
                    "processed_at": datetime.now(timezone.utc).isoformat(),
                    "document_type": schema.document_type.value if hasattr(schema.document_type, "value") else str(schema.document_type),
                    "classification_confidence": float(schema.classification_confidence),
                    "page_count": len(pages),
                    "extracted_fields_count": extracted_fields_count,
                    "line_items_count": line_items_count,
                    "invariants_summary": invariants_summary,
                }

                # 9. Update document record to COMPLETED with pipeline metadata
                existing_meta = doc["metadata"]
                if isinstance(existing_meta, str):
                    try:
                        existing_meta = json.loads(existing_meta)
                    except Exception:
                        existing_meta = {}
                elif not isinstance(existing_meta, dict):
                    existing_meta = {}

                merged_meta = {**existing_meta, **pipeline_metadata}

                await conn.execute(
                    """
                    UPDATE documents
                    SET status = 'COMPLETED',
                        category = $1,
                        metadata = $2::jsonb,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE organization_id = $3 AND workspace_id = $4 AND id = $5
                    """,
                    schema.document_type.value if hasattr(schema.document_type, "value") else str(schema.document_type),
                    json.dumps(merged_meta),
                    org_id,
                    ws_id,
                    doc_id,
                )

                # 10. Record immutable audit log
                org_row = await conn.fetchrow(
                    "SELECT slug FROM organizations WHERE id = $1",
                    org_id,
                )
                tenant_slug = org_row["slug"] if org_row else "unknown"

                await conn.execute(
                    """
                    INSERT INTO audit_logs (
                        organization_id, tenant_slug_snapshot, workspace_id,
                        user_id, action, entity_type, entity_id,
                        previous_state, new_state
                    )
                    VALUES ($1, $2, $3, $4, 'DOCUMENT_EXTRACTION_COMPLETED', 'document', $5, $6::jsonb, $7::jsonb)
                    """,
                    org_id,
                    tenant_slug,
                    ws_id,
                    actor_id,
                    doc_id,
                    json.dumps({"status": doc["status"]}),
                    json.dumps({"status": "COMPLETED", "summary": pipeline_metadata}),
                )

                logger.info(
                    "Document intelligence pipeline completed successfully",
                    doc_id=str(doc_id),
                    fields_extracted=extracted_fields_count,
                    line_items=line_items_count,
                    invariants_passed=invariants_summary["passed"],
                )

                return {
                    "document_id": str(doc_id),
                    "status": "COMPLETED",
                    "schema": schema,
                    "persisted_bundle": persisted_bundle,
                    "metadata": pipeline_metadata,
                }

    def _extract_pages_from_bytes(
        self,
        file_bytes: bytes,
        filename: str,
        mime_type: str,
    ) -> List[ExtractedPage]:
        """
        Dispatch format-appropriate page extraction.
        """
        lower_name = filename.lower()
        if mime_type == "application/pdf" or lower_name.endswith(".pdf"):
            doc_result = extract_pdf_document(file_bytes)
            return doc_result.pages

        if lower_name.endswith(".xlsx"):
            return self._extract_spreadsheet_pages(file_bytes, is_csv=False)

        if lower_name.endswith(".csv") or mime_type == "text/csv":
            return self._extract_spreadsheet_pages(file_bytes, is_csv=True)

        if lower_name.endswith((".txt", ".text")) or mime_type.startswith("text/"):
            return self._extract_text_pages(file_bytes)

        # Fallback: treat as PDF or single-page dummy
        try:
            doc_result = extract_pdf_document(file_bytes)
            return doc_result.pages
        except Exception:
            logger.warning("Unrecognized format, returning fallback empty page", filename=filename)
            return [
                ExtractedPage(
                    page_index=0,
                    width_pt=612.0,
                    height_pt=792.0,
                    classification=PageClassification.DIGITAL_TEXT,
                    classification_confidence=1.0,
                    digital_text="",
                    digital_blocks=[],
                )
            ]

    def _extract_spreadsheet_pages(self, file_bytes: bytes, is_csv: bool) -> List[ExtractedPage]:
        """
        Convert spreadsheet rows to an ExtractedPage representation for downstream extraction.
        """
        if is_csv:
            csv_res = self.spreadsheet_extractor.extract_csv(file_bytes)
            blocks: List[TextBlock] = []
            y_curr = 50.0

            header_line = "  ".join(str(h) for h in csv_res.headers)
            blocks.append(
                TextBlock(
                    block_index=0,
                    reading_order_index=0,
                    text=header_line,
                    bbox=BoundingBox(
                        x0=0.05, y0=y_curr / 1000.0, x1=0.95, y1=(y_curr + 20.0) / 1000.0,
                        x0_pt=30.0, y0_pt=y_curr, x1_pt=582.0, y1_pt=y_curr + 20.0,
                    ),
                )
            )
            y_curr += 25.0

            for r_idx, rec in enumerate(csv_res.records):
                row_text = "  ".join(str(v or "") for v in rec.values()).strip()
                if not row_text:
                    continue

                bbox = BoundingBox(
                    x0=0.05,
                    y0=min(1.0, y_curr / 1000.0),
                    x1=0.95,
                    y1=min(1.0, (y_curr + 20.0) / 1000.0),
                    x0_pt=30.0,
                    y0_pt=y_curr,
                    x1_pt=582.0,
                    y1_pt=y_curr + 20.0,
                )
                blocks.append(
                    TextBlock(
                        block_index=len(blocks),
                        reading_order_index=len(blocks),
                        text=row_text,
                        bbox=bbox,
                    )
                )
                y_curr += 22.0

            full_text = "\n".join(b.text for b in blocks)
            return [
                ExtractedPage(
                    page_index=0,
                    width_pt=612.0,
                    height_pt=max(800.0, y_curr + 50.0),
                    classification=PageClassification.DIGITAL_TEXT,
                    classification_confidence=1.0,
                    digital_text=full_text,
                    digital_blocks=blocks,
                )
            ]

        # XLSX processing
        xlsx_res = self.spreadsheet_extractor.extract_xlsx(file_bytes)
        pages: List[ExtractedPage] = []
        for p_idx, sheet in enumerate(xlsx_res.sheets):
            blocks = []
            y_curr = 50.0

            for r_idx, row in enumerate(sheet.rows):
                row_text = "  ".join(str(cell.raw_value or "") for cell in row.cells if cell.raw_value is not None).strip()
                if not row_text:
                    continue

                bbox = BoundingBox(
                    x0=0.05,
                    y0=min(1.0, y_curr / 1000.0),
                    x1=0.95,
                    y1=min(1.0, (y_curr + 20.0) / 1000.0),
                    x0_pt=30.0,
                    y0_pt=y_curr,
                    x1_pt=582.0,
                    y1_pt=y_curr + 20.0,
                )

                words: List[WordElement] = []
                x_word = 30.0
                for w_str in row_text.split():
                    w_box = BoundingBox(
                        x0=x_word / 612.0,
                        y0=y_curr / 1000.0,
                        x1=(x_word + len(w_str) * 8.0) / 612.0,
                        y1=(y_curr + 15.0) / 1000.0,
                        x0_pt=x_word,
                        y0_pt=y_curr,
                        x1_pt=x_word + len(w_str) * 8.0,
                        y1_pt=y_curr + 15.0,
                    )
                    words.append(WordElement(text=w_str, bbox=w_box))
                    x_word += len(w_str) * 8.0 + 8.0

                blocks.append(
                    TextBlock(
                        block_index=len(blocks),
                        text=row_text,
                        bbox=bbox,
                        words=words,
                        reading_order_index=len(blocks),
                    )
                )
                y_curr += 25.0

            full_text = "\n".join(b.text for b in blocks)
            pages.append(
                ExtractedPage(
                    page_index=p_idx,
                    width_pt=612.0,
                    height_pt=max(800.0, y_curr + 50.0),
                    classification=PageClassification.DIGITAL_TEXT,
                    classification_confidence=1.0,
                    digital_text=full_text,
                    digital_blocks=blocks,
                )
            )

        return pages

    def _extract_text_pages(self, file_bytes: bytes) -> List[ExtractedPage]:
        """Convert plain text to an ExtractedPage."""
        text = file_bytes.decode("utf-8", errors="replace")
        lines = [line.strip() for line in text.splitlines() if line.strip()]

        blocks: List[TextBlock] = []
        y_curr = 50.0

        for idx, line in enumerate(lines):
            bbox = BoundingBox(
                x0=0.05,
                y0=min(1.0, y_curr / 1000.0),
                x1=0.95,
                y1=min(1.0, (y_curr + 18.0) / 1000.0),
                x0_pt=30.0,
                y0_pt=y_curr,
                x1_pt=582.0,
                y1_pt=y_curr + 18.0,
            )
            words = [
                WordElement(
                    text=w,
                    bbox=BoundingBox(
                        x0=0.05, y0=y_curr / 1000.0, x1=0.2, y1=(y_curr + 18.0) / 1000.0,
                        x0_pt=30.0, y0_pt=y_curr, x1_pt=100.0, y1_pt=y_curr + 18.0,
                    ),
                )
                for w in line.split()
            ]
            blocks.append(
                TextBlock(
                    block_index=idx,
                    text=line,
                    bbox=bbox,
                    words=words,
                    reading_order_index=idx,
                )
            )
            y_curr += 22.0

        full_text = "\n".join(b.text for b in blocks)
        return [
            ExtractedPage(
                page_index=0,
                width_pt=612.0,
                height_pt=max(800.0, y_curr + 50.0),
                classification=PageClassification.DIGITAL_TEXT,
                classification_confidence=1.0,
                digital_text=full_text,
                digital_blocks=blocks,
            )
        ]
