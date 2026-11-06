"""
End-to-End Integration Tests for DocumentPipelineOrchestrator and WorkerDaemon (Phase 4 Step 5).
Validates end-to-end PDF/CSV ingestion, hybrid extraction, pure Decimal accounting invariants,
table persistence, worker queue execution, and audit log verification.
"""
from __future__ import annotations

import asyncio
import ctypes
import io
import uuid
from typing import AsyncGenerator, List, Tuple
import pytest
import pytest_asyncio
import asyncpg
import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c

from src.config import get_settings
from src.db.pool import db_manager
from src.dns import init_dns_resolver
from src.storage.s3 import storage_manager
from src.services.job_queue import TransactionalJobQueue
from src.intelligence.pipeline_orchestrator import DocumentPipelineOrchestrator
from src.intelligence.worker_daemon import WorkerDaemon
from src.exceptions import ProcessingError

init_dns_resolver()


def _create_synthetic_invoice_pdf(
    invoice_number: str = "INV-2026-8801",
    subtotal: str = "250.00",
    tax: str = "25.00",
    total: str = "275.00",
) -> bytes:
    """Generate in-memory PDF with text objects simulating a structured invoice."""
    doc = pdfium.PdfDocument.new()
    page = doc.new_page(612.0, 792.0)
    font = pdfium.PdfFont.load_standard(doc, "Helvetica")

    text_items = [
        ("INVOICE", 50.0, 720.0, 18.0),
        (f"Invoice Number: {invoice_number}", 50.0, 690.0, 11.0),
        ("Invoice Date: 2026-11-05", 50.0, 675.0, 11.0),
        ("Vendor: Global Logistics Corp", 50.0, 660.0, 11.0),
        ("Customer: Acme Industries Inc", 50.0, 645.0, 11.0),
        ("Description  Quantity  Unit Price  Total", 50.0, 600.0, 11.0),
        ("Cloud Compute Node  2  50.00  100.00", 50.0, 575.0, 10.0),
        ("Database Hosting Cluster  1  150.00  150.00", 50.0, 550.0, 10.0),
        (f"Subtotal: {subtotal}", 350.0, 510.0, 11.0),
        (f"Tax Amount: {tax}", 350.0, 490.0, 11.0),
        (f"Total Amount: {total}", 350.0, 470.0, 12.0),
    ]

    for text, x, y, size in text_items:
        raw_obj = pdfium_c.FPDFPageObj_CreateTextObj(doc.raw, font.raw, float(size))
        tb = pdfium.PdfTextObj(raw_obj, None, doc)
        u16 = (ctypes.c_ushort * (len(text) + 1))(*[ord(c) for c in text], 0)
        pdfium_c.FPDFText_SetText(raw_obj, u16)
        tb.transform(pdfium.PdfMatrix(1, 0, 0, 1, x, y))
        page.insert_obj(tb)

    page.gen_content()
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()



@pytest_asyncio.fixture
async def test_env(db_pool: asyncpg.Pool) -> AsyncGenerator[dict, None]:
    """Create tenant and workspace context for pipeline tests."""
    org_id = uuid.uuid4()
    ws_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    slug = f"orch-org-{org_id.hex[:8]}"

    async with db_pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)",
                org_id,
                "Orchestrator Test Org",
                slug,
            )
            await conn.execute(
                "INSERT INTO workspaces (id, organization_id, name, slug) VALUES ($1, $2, $3, $4)",
                ws_id,
                org_id,
                "Orchestrator Test Workspace",
                f"orch-ws-{ws_id.hex[:8]}",
            )

    yield {
        "org_id": org_id,
        "ws_id": ws_id,
        "doc_id": doc_id,
        "slug": slug,
    }

    # Teardown
    async with db_pool.acquire() as conn:
        await conn.execute("DELETE FROM audit_logs WHERE organization_id = $1", org_id)
        await conn.execute("DELETE FROM extracted_fields WHERE organization_id = $1", org_id)
        await conn.execute("DELETE FROM document_jobs WHERE organization_id = $1", org_id)
        await conn.execute("DELETE FROM documents WHERE organization_id = $1", org_id)
        await conn.execute("DELETE FROM workspaces WHERE organization_id = $1", org_id)
        await conn.execute("DELETE FROM organizations WHERE id = $1", org_id)


@pytest.mark.asyncio
async def test_end_to_end_pdf_invoice_pipeline(db_pool: asyncpg.Pool, test_env: dict) -> None:
    """Validate end-to-end processing of a PDF invoice through the orchestrator."""
    org_id = test_env["org_id"]
    ws_id = test_env["ws_id"]
    doc_id = test_env["doc_id"]

    # 1. Generate synthetic PDF and upload to storage
    pdf_bytes = _create_synthetic_invoice_pdf(
        invoice_number="INV-2026-8801",
        subtotal="250.00",
        tax="25.00",
        total="275.00",
    )
    s3_key = f"documents/{org_id}/{ws_id}/{doc_id}/invoice.pdf"
    storage_manager.upload_bytes(key=s3_key, data=pdf_bytes, content_type="application/pdf")

    # 2. Insert document in database with QUEUED status
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO documents (
                id, organization_id, workspace_id, filename,
                file_size_bytes, mime_type, sha256_hash, s3_key, status, category
            ) VALUES ($1, $2, $3, $4, $5, 'application/pdf', $6, $7, 'QUEUED', 'INVOICE')
            """,
            doc_id,
            org_id,
            ws_id,
            "invoice.pdf",
            len(pdf_bytes),
            uuid.uuid4().hex * 2,
            s3_key,
        )

    # 3. Execute orchestrator
    orchestrator = DocumentPipelineOrchestrator(pool=db_pool)
    result = await orchestrator.process_document(
        org_id=org_id,
        ws_id=ws_id,
        doc_id=doc_id,
    )

    assert result["status"] == "COMPLETED"
    assert result["document_id"] == str(doc_id)
    assert result["metadata"]["pipeline_version"] == "4.5.0"
    assert result["metadata"]["page_count"] >= 1

    # 4. Verify database state
    async with db_pool.acquire() as conn:
        # Check document record
        doc_row = await conn.fetchrow(
            "SELECT status, category, metadata FROM documents WHERE id = $1",
            doc_id,
        )
        assert doc_row["status"] == "COMPLETED"
        assert doc_row["category"] in ("INVOICE", "COMMERCIAL_INVOICE", "FINANCIAL_REPORT", "OTHER")
        meta = doc_row["metadata"]
        if isinstance(meta, str):
            import json
            meta = json.loads(meta)
        assert meta["pipeline_version"] == "4.5.0"
        assert "invariants_summary" in meta

        # Check extracted_fields
        fields = await conn.fetch(
            "SELECT field_name, confidence FROM extracted_fields WHERE document_id = $1",
            doc_id,
        )
        assert len(fields) > 0
        field_names = [f["field_name"] for f in fields]
        assert "line_items" in field_names

        # Check audit_logs
        audit_rows = await conn.fetch(
            "SELECT action, entity_type FROM audit_logs WHERE organization_id = $1 AND entity_id = $2",
            org_id,
            doc_id,
        )
        assert len(audit_rows) >= 1
        assert any(r["action"] == "DOCUMENT_EXTRACTION_COMPLETED" for r in audit_rows)


@pytest.mark.asyncio
async def test_end_to_end_csv_invoice_pipeline(db_pool: asyncpg.Pool, test_env: dict) -> None:
    """Validate end-to-end processing of a CSV spreadsheet invoice through the orchestrator."""
    org_id = test_env["org_id"]
    ws_id = test_env["ws_id"]
    doc_id = uuid.uuid4()

    csv_content = (
        "Description,Quantity,Unit Price,Total\n"
        "Widget Alpha,5,10.00,50.00\n"
        "Widget Beta,2,25.00,50.00\n"
        "Subtotal,,,100.00\n"
        "Tax Amount,,,10.00\n"
        "Total Amount,,,110.00\n"
    ).encode("utf-8")

    s3_key = f"documents/{org_id}/{ws_id}/{doc_id}/invoice.csv"
    storage_manager.upload_bytes(key=s3_key, data=csv_content, content_type="text/csv")

    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO documents (
                id, organization_id, workspace_id, filename,
                file_size_bytes, mime_type, sha256_hash, s3_key, status, category
            ) VALUES ($1, $2, $3, $4, $5, 'text/csv', $6, $7, 'QUEUED', 'INVOICE')
            """,
            doc_id,
            org_id,
            ws_id,
            "invoice.csv",
            len(csv_content),
            uuid.uuid4().hex * 2,
            s3_key,
        )

    orchestrator = DocumentPipelineOrchestrator(pool=db_pool)
    result = await orchestrator.process_document(
        org_id=org_id,
        ws_id=ws_id,
        doc_id=doc_id,
    )

    assert result["status"] == "COMPLETED"

    async with db_pool.acquire() as conn:
        doc_row = await conn.fetchrow("SELECT status FROM documents WHERE id = $1", doc_id)
        assert doc_row["status"] == "COMPLETED"


@pytest.mark.asyncio
async def test_worker_daemon_end_to_end_execution(db_pool: asyncpg.Pool, test_env: dict) -> None:
    """Validate that WorkerDaemon autonomously claims, processes, and completes a queued document job."""
    org_id = test_env["org_id"]
    ws_id = test_env["ws_id"]
    doc_id = uuid.uuid4()

    pdf_bytes = _create_synthetic_invoice_pdf("INV-DAEMON-101", "100.00", "10.00", "110.00")
    s3_key = f"documents/{org_id}/{ws_id}/{doc_id}/daemon_test.pdf"
    storage_manager.upload_bytes(key=s3_key, data=pdf_bytes, content_type="application/pdf")

    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO documents (
                id, organization_id, workspace_id, filename,
                file_size_bytes, mime_type, sha256_hash, s3_key, status, category
            ) VALUES ($1, $2, $3, $4, $5, 'application/pdf', $6, $7, 'QUEUED', 'INVOICE')
            """,
            doc_id,
            org_id,
            ws_id,
            "daemon_test.pdf",
            len(pdf_bytes),
            uuid.uuid4().hex * 2,
            s3_key,
        )

    queue = TransactionalJobQueue(pool=db_pool)
    job = await queue.enqueue_job(
        organization_id=org_id,
        workspace_id=ws_id,
        document_id=doc_id,
        action="DOCUMENT_EXTRACTION",
        priority=100,
        idempotency_key=f"daemon-{doc_id}",
    )
    assert job is not None

    # Start WorkerDaemon with rapid poll interval scoped to test organization
    daemon = WorkerDaemon(
        pool=db_pool,
        max_concurrent_jobs=2,
        poll_interval_seconds=0.2,
        lease_duration_seconds=60,
        organization_id=org_id,
    )
    daemon.start()
    assert daemon.is_running is True

    # Poll until job completes (timeout 25 seconds)
    completed = False
    for _ in range(50):
        await asyncio.sleep(0.5)
        async with db_pool.acquire() as conn:
            j_row = await conn.fetchrow("SELECT status FROM document_jobs WHERE id = $1", job.id)
            if j_row and j_row["status"] == "COMPLETED":
                completed = True
                break

    # Stop daemon cleanly
    await daemon.stop(timeout_seconds=5.0)
    assert daemon.is_running is False
    assert completed is True, "Worker daemon did not complete the job within timeout"

    # Verify document is also COMPLETED
    async with db_pool.acquire() as conn:
        d_row = await conn.fetchrow("SELECT status FROM documents WHERE id = $1", doc_id)
        assert d_row["status"] == "COMPLETED"


@pytest.mark.asyncio
async def test_orchestrator_missing_storage_error(db_pool: asyncpg.Pool, test_env: dict) -> None:
    """Validate that orchestrator raises ProcessingError when storage download fails."""
    org_id = test_env["org_id"]
    ws_id = test_env["ws_id"]
    doc_id = uuid.uuid4()

    # Document references non-existent key
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO documents (
                id, organization_id, workspace_id, filename,
                file_size_bytes, mime_type, sha256_hash, s3_key, status
            ) VALUES ($1, $2, $3, $4, 1024, 'application/pdf', $5, 'nonexistent/key.pdf', 'QUEUED')
            """,
            doc_id,
            org_id,
            ws_id,
            "nonexistent.pdf",
            uuid.uuid4().hex * 2,
        )

    orchestrator = DocumentPipelineOrchestrator(pool=db_pool)

    with pytest.raises(ProcessingError) as exc_info:
        await orchestrator.process_document(org_id=org_id, ws_id=ws_id, doc_id=doc_id)

    assert "Storage download failed" in str(exc_info.value)
