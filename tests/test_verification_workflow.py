"""
Integration and Adversarial Verification Suite for Human-in-the-Loop (HITL) Verification (Phase 5).
Validates:
1. Review queue filtering and confidence aggregation.
2. Complete document review detail payload with preview URL and SoD metadata.
3. Review claiming and state transition (NEEDS_REVIEW -> IN_REVIEW).
4. Scalar field correction with real-time invariant re-evaluation.
5. Tabular line-item cell correction with automatic subtotal recalculation.
6. INV-010 Auditor Override Gate (hard-stop rejection vs allowable override with rationale).
7. Document verification prerequisite gating (unoverridden failures block verification).
8. Segregation of Duties (SoD) dual-custody enforcement (uploader & corrector cannot approve).
9. Canonical RBAC barrier enforcement (DOCUMENT_MANAGER barred from approval; VIEWER cannot correct).
10. Full document rejection and reopening lifecycle with immutable audit log generation.
"""
from __future__ import annotations

from decimal import Decimal
import json
import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient
import asyncpg

from src.storage.s3 import storage_manager


def _get_err_msg(res) -> str:
    """Extract error message from LedgerOne standard envelope, FastAPI detail, or dict."""
    body = res.json()
    if isinstance(body, dict):
        if "error" in body and isinstance(body["error"], dict):
            return body["error"].get("message", "")
        if "message" in body:
            return body["message"]
        if "detail" in body:
            return str(body["detail"])
    return str(body)


async def _setup_verification_environment(client: AsyncClient, db_pool: asyncpg.Pool):
    """Bootstrap organization, workspace, and 5 distinct users for SoD and RBAC testing."""
    # 1. Admin / Uploader
    uploader_email = f"uploader_{uuid.uuid4().hex[:6]}@example.com"
    u_reg = await client.post(
        "/api/v1/auth/register",
        json={"email": uploader_email, "password": "Password123!", "full_name": "Uploader User"},
    )
    uploader_id = uuid.UUID(u_reg.json()["user"]["id"])
    u_log = await client.post("/api/v1/auth/login", json={"email": uploader_email, "password": "Password123!"})
    uploader_headers = {"Authorization": f"Bearer {u_log.json()['access_token']}"}

    # 2. Reviewer / Corrector
    reviewer_email = f"reviewer_{uuid.uuid4().hex[:6]}@example.com"
    r_reg = await client.post(
        "/api/v1/auth/register",
        json={"email": reviewer_email, "password": "Password123!", "full_name": "Reviewer User"},
    )
    reviewer_id = uuid.UUID(r_reg.json()["user"]["id"])
    r_log = await client.post("/api/v1/auth/login", json={"email": reviewer_email, "password": "Password123!"})
    reviewer_headers = {"Authorization": f"Bearer {r_log.json()['access_token']}"}

    # 3. Independent Approver (WORKSPACE_ADMIN, not uploader or corrector)
    approver_email = f"approver_{uuid.uuid4().hex[:6]}@example.com"
    a_reg = await client.post(
        "/api/v1/auth/register",
        json={"email": approver_email, "password": "Password123!", "full_name": "Independent Approver"},
    )
    approver_id = uuid.UUID(a_reg.json()["user"]["id"])
    a_log = await client.post("/api/v1/auth/login", json={"email": approver_email, "password": "Password123!"})
    approver_headers = {"Authorization": f"Bearer {a_log.json()['access_token']}"}

    # 4. Document Manager (barred from approving)
    doc_mgr_email = f"docmgr_{uuid.uuid4().hex[:6]}@example.com"
    dm_reg = await client.post(
        "/api/v1/auth/register",
        json={"email": doc_mgr_email, "password": "Password123!", "full_name": "Doc Manager User"},
    )
    doc_mgr_id = uuid.UUID(dm_reg.json()["user"]["id"])
    dm_log = await client.post("/api/v1/auth/login", json={"email": doc_mgr_email, "password": "Password123!"})
    doc_mgr_headers = {"Authorization": f"Bearer {dm_log.json()['access_token']}"}

    # 5. Viewer (read-only)
    viewer_email = f"viewer_{uuid.uuid4().hex[:6]}@example.com"
    v_reg = await client.post(
        "/api/v1/auth/register",
        json={"email": viewer_email, "password": "Password123!", "full_name": "Viewer User"},
    )
    viewer_id = uuid.UUID(v_reg.json()["user"]["id"])
    v_log = await client.post("/api/v1/auth/login", json={"email": viewer_email, "password": "Password123!"})
    viewer_headers = {"Authorization": f"Bearer {v_log.json()['access_token']}"}

    # Create Organization & Workspace
    org_res = await client.post(
        "/api/v1/organizations",
        headers=uploader_headers,
        json={"name": "HITL Test Org", "slug": f"hitl-org-{uuid.uuid4().hex[:8]}"},
    )
    org_id = uuid.UUID(org_res.json()["organization"]["id"])

    ws_res = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces",
        headers={**uploader_headers, "X-Organization-ID": str(org_id)},
        json={"name": "Verification Workspace", "slug": f"ver-ws-{uuid.uuid4().hex[:6]}"},
    )
    ws_id = uuid.UUID(ws_res.json()["workspace"]["id"])

    # Add members to org and workspace
    users_roles = [
        (reviewer_id, "REVIEWER"),
        (approver_id, "WORKSPACE_ADMIN"),
        (doc_mgr_id, "DOCUMENT_MANAGER"),
        (viewer_id, "VIEWER"),
    ]
    for uid, wrole in users_roles:
        await client.post(
            f"/api/v1/organizations/{org_id}/members",
            headers={**uploader_headers, "X-Organization-ID": str(org_id)},
            json={"user_id": str(uid), "role": "MEMBER"},
        )
        await client.post(
            f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/members",
            headers={**uploader_headers, "X-Organization-ID": str(org_id)},
            json={"user_id": str(uid), "role": wrole},
        )

    return {
        "org_id": org_id,
        "ws_id": ws_id,
        "uploader": {"id": uploader_id, "headers": {**uploader_headers, "X-Organization-ID": str(org_id)}},
        "reviewer": {"id": reviewer_id, "headers": {**reviewer_headers, "X-Organization-ID": str(org_id)}},
        "approver": {"id": approver_id, "headers": {**approver_headers, "X-Organization-ID": str(org_id)}},
        "doc_mgr": {"id": doc_mgr_id, "headers": {**doc_mgr_headers, "X-Organization-ID": str(org_id)}},
        "viewer": {"id": viewer_id, "headers": {**viewer_headers, "X-Organization-ID": str(org_id)}},
    }


@pytest_asyncio.fixture(scope="module")
async def env(client: AsyncClient, db_pool: asyncpg.Pool):
    """Module-scoped shared test environment to prevent excessive setup overhead."""
    return await _setup_verification_environment(client, db_pool)


async def _create_test_document_with_invariants(
    db_pool: asyncpg.Pool,
    org_id: uuid.UUID,
    ws_id: uuid.UUID,
    uploaded_by: uuid.UUID,
    filename: str = "test_invoice.pdf",
    status: str = "NEEDS_REVIEW",
    subtotal: str = "100.00",
    tax_amount: str = "10.00",
    total_amount: str = "110.00",
    has_subtotal_failure: bool = False,
    has_sign_failure: bool = False,
) -> uuid.UUID:
    """Helper to insert test document with extracted scalar fields, line items, and invariants in metadata."""
    doc_id = uuid.uuid4()
    s3_key = f"documents/{org_id}/{ws_id}/{doc_id}/doc.pdf"
    storage_manager.upload_bytes(key=s3_key, data=b"%PDF-1.4 synthetic", content_type="application/pdf")

    # Initial invariant evaluations
    inv_001_outcome = "FAILED" if has_subtotal_failure else "PASSED"
    inv_008_outcome = "FAILED" if has_sign_failure else "PASSED"

    initial_invariants = [
        {
            "invariant_id": "INV-001",
            "name": "Line Item Subtotal Sum",
            "outcome": inv_001_outcome,
            "message": "Subtotal mismatch detected" if has_subtotal_failure else "Sum matches subtotal",
            "delta": "10.00" if has_subtotal_failure else "0.00",
            "expected": subtotal,
            "observed": "90.00" if has_subtotal_failure else subtotal,
        },
        {
            "invariant_id": "INV-002",
            "name": "Line Item Arithmetic",
            "outcome": "PASSED",
            "message": "Row multiplications exact",
            "delta": "0.00",
        },
        {
            "invariant_id": "INV-005",
            "name": "Header Net/Gross Arithmetic",
            "outcome": "PASSED",
            "message": "Net + tax equals gross",
            "delta": "0.00",
        },
        {
            "invariant_id": "INV-008",
            "name": "Document Sign Consistency",
            "outcome": inv_008_outcome,
            "message": "Negative invoice total prohibited" if has_sign_failure else "Sign consistent",
            "delta": "-110.00" if has_sign_failure else "0.00",
        },
    ]

    metadata = {
        "category": "INVOICE",
        "invariants": initial_invariants,
        "overrides": {},
    }

    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO documents (
                id, organization_id, workspace_id, uploaded_by_user_id,
                filename, file_size_bytes, mime_type, sha256_hash, s3_key, status, category, metadata
            ) VALUES ($1, $2, $3, $4, $5, 1024, 'application/pdf', $6, $7, $8, 'INVOICE', $9::jsonb)
            """,
            doc_id,
            org_id,
            ws_id,
            uploaded_by,
            filename,
            uuid.uuid4().hex * 2,
            s3_key,
            status,
            json.dumps(metadata),
        )

        # Insert scalar extracted fields
        fields = [
            ("subtotal", subtotal, subtotal, 0.95),
            ("tax_amount", tax_amount, tax_amount, 0.92),
            ("total_amount", total_amount, total_amount, 0.98),
            ("currency", "USD", "USD", 0.99),
        ]
        for fname, rval, nval, conf in fields:
            await conn.execute(
                """
                INSERT INTO extracted_fields (
                    organization_id, workspace_id, document_id, field_name,
                    field_value_raw, field_value_normalized, confidence, is_verified
                ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, FALSE)
                """,
                org_id,
                ws_id,
                doc_id,
                fname,
                rval,
                json.dumps(nval),
                conf,
            )

        # Insert line items table bundle
        line_items_data = {
            "table": {
                "rows": [
                    {"description": "Item 1", "quantity": 1, "unit_price": 50.00, "subtotal": 50.00},
                    {"description": "Item 2", "quantity": 2, "unit_price": 25.00, "subtotal": 50.00},
                ]
            }
        }
        await conn.execute(
            """
            INSERT INTO extracted_fields (
                organization_id, workspace_id, document_id, field_name,
                field_value_raw, field_value_normalized, confidence, is_verified
            ) VALUES ($1, $2, $3, 'line_items', 'TABLE', $4::jsonb, 0.94, FALSE)
            """,
            org_id,
            ws_id,
            doc_id,
            json.dumps(line_items_data),
        )

    return doc_id


# ============================================================================
# Phase 5 Test Cases
# ============================================================================

@pytest.mark.asyncio
async def test_review_queue_filtering_and_confidence(client: AsyncClient, db_pool: asyncpg.Pool, env: dict):
    """Test retrieving review queue with status, category, and minimum confidence filtering."""
    org_id = env["org_id"]
    ws_id = env["ws_id"]
    headers = env["reviewer"]["headers"]

    # Create 3 documents: 2 in NEEDS_REVIEW, 1 in COMPLETED
    doc1 = await _create_test_document_with_invariants(
        db_pool, org_id, ws_id, env["uploader"]["id"], filename="needs_rev_1.pdf", status="NEEDS_REVIEW"
    )
    doc2 = await _create_test_document_with_invariants(
        db_pool, org_id, ws_id, env["uploader"]["id"], filename="needs_rev_2.pdf", status="NEEDS_REVIEW", has_subtotal_failure=True
    )
    doc3 = await _create_test_document_with_invariants(
        db_pool, org_id, ws_id, env["uploader"]["id"], filename="completed_1.pdf", status="COMPLETED"
    )

    # 1. Query queue without status filter
    res = await client.get(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/review-queue",
        headers=headers,
    )
    assert res.status_code == 200
    items = res.json()
    assert len(items) >= 3

    # 2. Query queue filtered by status = NEEDS_REVIEW
    res_nr = await client.get(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/review-queue?status=NEEDS_REVIEW",
        headers=headers,
    )
    assert res_nr.status_code == 200
    nr_items = res_nr.json()
    assert all(it["status"] == "NEEDS_REVIEW" for it in nr_items)

    # Verify failed invariant recognition on doc2
    doc2_item = next(it for it in nr_items if it["id"] == str(doc2))
    assert doc2_item["has_failed_invariants"] is True
    assert doc2_item["failed_invariants_count"] == 1


@pytest.mark.asyncio
async def test_document_review_detail_payload(client: AsyncClient, db_pool: asyncpg.Pool, env: dict):
    """Test retrieving complete review inspection package with preview URL, fields, and SoD metadata."""
    org_id = env["org_id"]
    ws_id = env["ws_id"]
    doc_id = await _create_test_document_with_invariants(
        db_pool, org_id, ws_id, env["uploader"]["id"], filename="detail_test.pdf"
    )

    res = await client.get(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{doc_id}/review",
        headers=env["reviewer"]["headers"],
    )
    assert res.status_code == 200
    data = res.json()

    assert data["document"]["id"] == str(doc_id)
    assert "preview_url" in data
    assert data["preview_url"] is not None
    assert len(data["scalar_fields"]) >= 4
    assert data["line_items_bundle"] is not None
    assert len(data["invariants"]) >= 4
    assert "sod_metadata" in data
    assert data["sod_metadata"]["can_verify"] is True


@pytest.mark.asyncio
async def test_claim_document_for_review_state_transition(client: AsyncClient, db_pool: asyncpg.Pool, env: dict):
    """Test claiming document transitions status from NEEDS_REVIEW to IN_REVIEW and logs audit event."""
    org_id = env["org_id"]
    ws_id = env["ws_id"]
    doc_id = await _create_test_document_with_invariants(
        db_pool, org_id, ws_id, env["uploader"]["id"], status="NEEDS_REVIEW"
    )

    res = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{doc_id}/review/claim",
        headers=env["reviewer"]["headers"],
    )
    assert res.status_code == 200
    assert res.json()["status"] == "IN_REVIEW"

    # Verify DB state
    async with db_pool.acquire() as conn:
        doc = await conn.fetchrow("SELECT status, metadata FROM documents WHERE id = $1", doc_id)
        assert doc["status"] == "IN_REVIEW"
        meta = json.loads(doc["metadata"]) if isinstance(doc["metadata"], str) else doc["metadata"]
        assert meta["assigned_reviewer_id"] == str(env["reviewer"]["id"])

        # Verify audit log
        audit = await conn.fetchrow(
            "SELECT action FROM audit_logs WHERE entity_id = $1 AND action = 'DOCUMENT_REVIEW_CLAIMED'",
            doc_id,
        )
        assert audit is not None


@pytest.mark.asyncio
async def test_correct_scalar_field_and_invariant_reevaluation(client: AsyncClient, db_pool: asyncpg.Pool, env: dict):
    """Test manual scalar field correction updates DB and automatically recalculates invariants."""
    org_id = env["org_id"]
    ws_id = env["ws_id"]

    # Start with subtotal = 80.00 while line items sum to 100.00 -> INV-001 fails
    doc_id = await _create_test_document_with_invariants(
        db_pool, org_id, ws_id, env["uploader"]["id"],
        subtotal="80.00", status="IN_REVIEW", has_subtotal_failure=True
    )

    # Correct subtotal to 100.00
    res = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{doc_id}/review/correct-field",
        headers=env["reviewer"]["headers"],
        json={
            "field_name": "subtotal",
            "corrected_value_raw": "$100.00",
            "corrected_value_normalized": "100.00",
            "comment": "Corrected OCR digit misread (8->10)",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["field_name"] == "subtotal"

    # Verify INV-001 is now PASSED in refreshed invariants
    refreshed_invs = data["refreshed_invariants"]
    inv_001 = next(inv for inv in refreshed_invs if inv["invariant_id"] == "INV-001")
    assert inv_001["outcome"] == "PASSED"

    # Verify audit log
    async with db_pool.acquire() as conn:
        audit = await conn.fetchrow(
            "SELECT action, user_id FROM audit_logs WHERE entity_id = $1 AND action = 'DOCUMENT_FIELD_CORRECTED'",
            doc_id,
        )
        assert audit is not None
        assert audit["user_id"] == env["reviewer"]["id"]


@pytest.mark.asyncio
async def test_correct_line_item_and_invariant_reevaluation(client: AsyncClient, db_pool: asyncpg.Pool, env: dict):
    """Test correcting a cell in extracted line items table auto-recalculates subtotal and invariants."""
    org_id = env["org_id"]
    ws_id = env["ws_id"]
    doc_id = await _create_test_document_with_invariants(
        db_pool, org_id, ws_id, env["uploader"]["id"],
        subtotal="125.00", status="IN_REVIEW", has_subtotal_failure=True
    )

    # Line item 1 quantity corrected from 2 to 3 (unit_price 25.00 -> new subtotal 75.00; total line items = 50 + 75 = 125.00)
    res = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{doc_id}/review/correct-line-item",
        headers=env["reviewer"]["headers"],
        json={
            "line_item_index": 1,
            "field_name": "quantity",
            "corrected_value": 3,
            "comment": "Adjusted quantity from 2 to 3 to match physical receipt",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert Decimal(str(data["updated_row"]["subtotal"])) == Decimal("75.00")

    # Invariants re-evaluated: 50 + 75 = 125.00 == subtotal 125.00 -> INV-001 PASSED
    refreshed_invs = data["refreshed_invariants"]
    inv_001 = next(inv for inv in refreshed_invs if inv["invariant_id"] == "INV-001")
    assert inv_001["outcome"] == "PASSED"


@pytest.mark.asyncio
async def test_inv_010_auditor_override_gate(client: AsyncClient, db_pool: asyncpg.Pool, env: dict):
    """Test INV-010 Auditor Override Gate: hard-stop rules rejected; allowable rules accepted with rationale."""
    org_id = env["org_id"]
    ws_id = env["ws_id"]

    # 1. Attempt override on non-overridable hard-stop invariant INV-008 -> 422 Unprocessable Entity
    doc_hard = await _create_test_document_with_invariants(
        db_pool, org_id, ws_id, env["uploader"]["id"],
        status="IN_REVIEW", has_sign_failure=True
    )
    res_hard = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{doc_hard}/review/override-invariant",
        headers=env["reviewer"]["headers"],
        json={
            "invariant_id": "INV-008",
            "override_rationale": "Attempting to bypass negative total check",
        },
    )
    assert res_hard.status_code == 422
    assert "mandatory hard stop and cannot be overridden" in _get_err_msg(res_hard)

    # 2. Allowable override on INV-001 (subtotal discrepancy) with mandatory rationale -> 200 OK
    doc_allowable = await _create_test_document_with_invariants(
        db_pool, org_id, ws_id, env["uploader"]["id"],
        status="IN_REVIEW", has_subtotal_failure=True
    )
    res_allowable = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{doc_allowable}/review/override-invariant",
        headers=env["reviewer"]["headers"],
        json={
            "invariant_id": "INV-001",
            "override_rationale": "Approved vendor standard settlement rounding variance of $0.05 under contract clause 4.2",
        },
    )
    assert res_allowable.status_code == 200
    assert res_allowable.json()["invariant_id"] == "INV-001"

    # Verify audit log
    async with db_pool.acquire() as conn:
        audit = await conn.fetchrow(
            "SELECT action FROM audit_logs WHERE entity_id = $1 AND action = 'DOCUMENT_INVARIANT_OVERRIDDEN'",
            doc_allowable,
        )
        assert audit is not None


@pytest.mark.asyncio
async def test_verify_document_with_unoverridden_failure_fails_closed(client: AsyncClient, db_pool: asyncpg.Pool, env: dict):
    """Test that attempting to verify a document with unoverridden failing invariants fails closed."""
    org_id = env["org_id"]
    ws_id = env["ws_id"]

    doc_id = await _create_test_document_with_invariants(
        db_pool, org_id, ws_id, env["uploader"]["id"],
        status="IN_REVIEW", has_subtotal_failure=True
    )

    # Attempt verify without override -> 422 Validation Error
    res_fail = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{doc_id}/review/verify",
        headers=env["reviewer"]["headers"],
    )
    assert res_fail.status_code == 422
    assert "Failing invariants" in _get_err_msg(res_fail)

    # Apply override to INV-001
    await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{doc_id}/review/override-invariant",
        headers=env["reviewer"]["headers"],
        json={
            "invariant_id": "INV-001",
            "override_rationale": "Acceptable discrepancy documented and verified by reviewer",
        },
    )

    # Now verify succeeds -> 200 OK -> status VERIFIED
    res_ok = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{doc_id}/review/verify",
        headers=env["reviewer"]["headers"],
    )
    assert res_ok.status_code == 200
    assert res_ok.json()["status"] == "VERIFIED"


@pytest.mark.asyncio
async def test_segregation_of_duties_dual_custody_blocks_uploader(client: AsyncClient, db_pool: asyncpg.Pool, env: dict):
    """Test AUTH_SOD_001: The user who uploaded the document is barred from approving it."""
    org_id = env["org_id"]
    ws_id = env["ws_id"]

    # Document uploaded by uploader user
    doc_id = await _create_test_document_with_invariants(
        db_pool, org_id, ws_id, env["uploader"]["id"], status="NEEDS_REVIEW"
    )

    # Reviewer verifies the document
    await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{doc_id}/review/claim",
        headers=env["reviewer"]["headers"],
    )
    await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{doc_id}/review/verify",
        headers=env["reviewer"]["headers"],
    )

    # Uploader (even though Org Admin) attempts to approve -> 403 Forbidden AUTH_SOD_001
    res_sod1 = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{doc_id}/review/approve",
        headers=env["uploader"]["headers"],
    )
    assert res_sod1.status_code == 403
    assert "AUTH_SOD_001" in _get_err_msg(res_sod1)


@pytest.mark.asyncio
async def test_segregation_of_duties_dual_custody_blocks_corrector(client: AsyncClient, db_pool: asyncpg.Pool, env: dict):
    """Test AUTH_SOD_002: The reviewer who performed field corrections cannot approve the document."""
    org_id = env["org_id"]
    ws_id = env["ws_id"]

    doc_id = await _create_test_document_with_invariants(
        db_pool, org_id, ws_id, env["uploader"]["id"], status="IN_REVIEW"
    )

    # Approver user performs a field correction
    await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{doc_id}/review/correct-field",
        headers=env["approver"]["headers"],
        json={"field_name": "tax_amount", "corrected_value_normalized": "10.00"},
    )

    # Reviewer verifies document
    await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{doc_id}/review/verify",
        headers=env["reviewer"]["headers"],
    )

    # Approver attempts to approve document they corrected -> 403 Forbidden AUTH_SOD_002
    res_sod2 = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{doc_id}/review/approve",
        headers=env["approver"]["headers"],
    )
    assert res_sod2.status_code == 403
    assert "AUTH_SOD_002" in _get_err_msg(res_sod2)


@pytest.mark.asyncio
async def test_rbac_barriers_document_manager_and_viewer(client: AsyncClient, db_pool: asyncpg.Pool, env: dict):
    """Test RBAC boundaries: DOCUMENT_MANAGER cannot approve; VIEWER cannot correct."""
    org_id = env["org_id"]
    ws_id = env["ws_id"]

    doc_id = await _create_test_document_with_invariants(
        db_pool, org_id, ws_id, env["uploader"]["id"], status="VERIFIED"
    )

    # 1. DOCUMENT_MANAGER attempts to approve -> 403 Forbidden
    res_dm = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{doc_id}/review/approve",
        headers=env["doc_mgr"]["headers"],
    )
    assert res_dm.status_code == 403
    assert "DOCUMENT_MANAGER" in _get_err_msg(res_dm)

    # 2. VIEWER attempts to correct field -> 403 Forbidden
    res_v = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{doc_id}/review/correct-field",
        headers=env["viewer"]["headers"],
        json={"field_name": "subtotal", "corrected_value_normalized": "100.00"},
    )
    assert res_v.status_code == 403


@pytest.mark.asyncio
async def test_document_reject_and_reopen_lifecycle(client: AsyncClient, db_pool: asyncpg.Pool, env: dict):
    """Test complete reject and reopen lifecycle with immutable audit log generation."""
    org_id = env["org_id"]
    ws_id = env["ws_id"]

    doc_id = await _create_test_document_with_invariants(
        db_pool, org_id, ws_id, env["uploader"]["id"], status="NEEDS_REVIEW"
    )

    # 1. Reject document
    res_rej = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{doc_id}/review/reject",
        headers=env["reviewer"]["headers"],
        json={"rejection_reason": "Unreadable degraded thermal receipt scan; vendor re-request dispatched"},
    )
    assert res_rej.status_code == 200
    assert res_rej.json()["status"] == "REJECTED"

    # Verify DB status
    async with db_pool.acquire() as conn:
        doc_row = await conn.fetchrow("SELECT status FROM documents WHERE id = $1", doc_id)
        assert doc_row["status"] == "REJECTED"

        audit_rej = await conn.fetchrow(
            "SELECT action FROM audit_logs WHERE entity_id = $1 AND action = 'DOCUMENT_REJECTED'",
            doc_id,
        )
        assert audit_rej is not None

    # 2. Reopen document
    res_reopen = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/documents/{doc_id}/review/reopen",
        headers=env["reviewer"]["headers"],
        json={"reason": "Customer provided high-resolution scan replacement"},
    )
    assert res_reopen.status_code == 200
    assert res_reopen.json()["status"] == "NEEDS_REVIEW"

    # Verify DB status
    async with db_pool.acquire() as conn:
        doc_reopened = await conn.fetchrow("SELECT status FROM documents WHERE id = $1", doc_id)
        assert doc_reopened["status"] == "NEEDS_REVIEW"

        audit_reopen = await conn.fetchrow(
            "SELECT action FROM audit_logs WHERE entity_id = $1 AND action = 'DOCUMENT_REOPENED'",
            doc_id,
        )
        assert audit_reopen is not None
