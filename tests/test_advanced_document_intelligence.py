"""
Comprehensive Adversarial Verification Test Suite for Advanced Document Intelligence (Phase 7).
Validates:
1. Document relationship linking and lifecycle under workspace RLS.
2. Autonomous 3-way matching: Perfect match scenario across PO, GRN, and Invoice.
3. Unit price inflation detection: Exact delta calculation and Master Spec non-assumption rule.
4. Quantity over-billing / short shipment detection: Excess quantity exposure calculation.
5. Cross-invoice duplicate billing detection: Cumulative billing exceeding PO authorization.
6. Document version comparison: Granular scalar field and tabular line item diffing.
7. Workspace financial spend and discrepancy exposure analytics aggregation.
8. Multi-tenant Row-Level Security isolation across workspaces.
9. RBAC permission barrier enforcement (VIEWER barred from linking or matching).
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


async def _setup_p7_workspace(client: AsyncClient, suffix: str = "p7"):
    """Helper to bootstrap an isolated organization, workspace, admin, and viewer."""
    admin_email = f"p7_admin_{suffix}_{uuid.uuid4().hex[:6]}@example.com"
    a_reg = await client.post(
        "/api/v1/auth/register",
        json={"email": admin_email, "password": "Password123!", "full_name": "P7 Admin"},
    )
    admin_id = uuid.UUID(a_reg.json()["user"]["id"])
    a_log = await client.post("/api/v1/auth/login", json={"email": admin_email, "password": "Password123!"})
    admin_headers = {"Authorization": f"Bearer {a_log.json()['access_token']}"}

    viewer_email = f"p7_viewer_{suffix}_{uuid.uuid4().hex[:6]}@example.com"
    v_reg = await client.post(
        "/api/v1/auth/register",
        json={"email": viewer_email, "password": "Password123!", "full_name": "P7 Viewer"},
    )
    viewer_id = uuid.UUID(v_reg.json()["user"]["id"])
    v_log = await client.post("/api/v1/auth/login", json={"email": viewer_email, "password": "Password123!"})
    viewer_headers = {"Authorization": f"Bearer {v_log.json()['access_token']}"}

    org_res = await client.post(
        "/api/v1/organizations",
        headers=admin_headers,
        json={"name": f"P7 Org {suffix}", "slug": f"p7-org-{suffix}-{uuid.uuid4().hex[:6]}"},
    )
    org_id = uuid.UUID(org_res.json()["organization"]["id"])

    ws_res = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces",
        headers={**admin_headers, "X-Organization-ID": str(org_id)},
        json={"name": "P7 Workspace", "slug": f"p7-ws-{suffix}-{uuid.uuid4().hex[:6]}"},
    )
    ws_id = uuid.UUID(ws_res.json()["workspace"]["id"])

    # Add viewer to org and workspace
    await client.post(
        f"/api/v1/organizations/{org_id}/members",
        headers={**admin_headers, "X-Organization-ID": str(org_id)},
        json={"user_id": str(viewer_id), "role": "MEMBER"},
    )
    await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/members",
        headers={**admin_headers, "X-Organization-ID": str(org_id)},
        json={"user_id": str(viewer_id), "role": "VIEWER"},
    )

    return {
        "org_id": org_id,
        "ws_id": ws_id,
        "admin": {"id": admin_id, "headers": {**admin_headers, "X-Organization-ID": str(org_id)}},
        "viewer": {"id": viewer_id, "headers": {**viewer_headers, "X-Organization-ID": str(org_id)}},
    }


async def _seed_document(
    db_pool: asyncpg.Pool,
    org_id: uuid.UUID,
    ws_id: uuid.UUID,
    user_id: uuid.UUID,
    category: str,
    filename: str,
    vendor: str,
    number: str,
    total_amount: str,
    subtotal: str,
    line_items: list,
) -> uuid.UUID:
    """Helper to insert a typed document with extracted fields and line items table bundle."""
    doc_id = uuid.uuid4()
    s3_key = f"documents/{org_id}/{ws_id}/{doc_id}/doc.pdf"
    storage_manager.upload_bytes(key=s3_key, data=b"%PDF-1.4 P7 synthetic", content_type="application/pdf")

    meta = {"category": category, "vendor": vendor}

    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO documents (
                id, organization_id, workspace_id, uploaded_by_user_id,
                filename, file_size_bytes, mime_type, sha256_hash, s3_key, status, category, metadata
            ) VALUES ($1, $2, $3, $4, $5, 1024, 'application/pdf', $6, $7, 'VERIFIED', $8, $9::jsonb)
            """,
            doc_id,
            org_id,
            ws_id,
            user_id,
            filename,
            uuid.uuid4().hex * 2,
            s3_key,
            category,
            json.dumps(meta),
        )

        num_field = "po_number" if category == "PURCHASE_ORDER" else ("receipt_number" if category == "RECEIPT" else "invoice_number")
        fields = [
            (num_field, number, number),
            ("supplier_name", vendor, vendor),
            ("total_amount", total_amount, total_amount),
            ("subtotal", subtotal, subtotal),
        ]
        for fname, rval, nval in fields:
            await conn.execute(
                """
                INSERT INTO extracted_fields (
                    organization_id, workspace_id, document_id, field_name,
                    field_value_raw, field_value_normalized, confidence, is_verified, verified_value
                ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, 0.99, TRUE, $6::jsonb)
                """,
                org_id,
                ws_id,
                doc_id,
                fname,
                rval,
                json.dumps(nval),
            )

        table_bundle = {"table": {"rows": line_items}}
        await conn.execute(
            """
            INSERT INTO extracted_fields (
                organization_id, workspace_id, document_id, field_name,
                field_value_raw, field_value_normalized, confidence, is_verified, verified_value
            ) VALUES ($1, $2, $3, 'line_items', 'TABLE', $4::jsonb, 0.98, TRUE, $4::jsonb)
            """,
            org_id,
            ws_id,
            doc_id,
            json.dumps(table_bundle),
        )

    return doc_id


@pytest_asyncio.fixture(scope="module")
async def env(client: AsyncClient):
    """Module-scoped shared environment for Phase 7 testing."""
    return await _setup_p7_workspace(client, suffix="main")


# ============================================================================
# Phase 7 Test Cases
# ============================================================================

@pytest.mark.asyncio
async def test_document_relationship_lifecycle(client: AsyncClient, db_pool: asyncpg.Pool, env: dict):
    """Test creating and querying typed relationship edges between documents."""
    org_id = env["org_id"]
    ws_id = env["ws_id"]
    admin = env["admin"]

    doc_a = await _seed_document(
        db_pool, org_id, ws_id, admin["id"], "PURCHASE_ORDER", "po_101.pdf",
        "Global Hardware Corp", "PO-101", "1000.00", "1000.00", []
    )
    doc_b = await _seed_document(
        db_pool, org_id, ws_id, admin["id"], "INVOICE", "inv_101.pdf",
        "Global Hardware Corp", "INV-101", "1000.00", "1000.00", []
    )

    # 1. Link PO to Invoice
    res_link = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/cross-document/link/{doc_a}",
        headers=admin["headers"],
        json={"target_document_id": str(doc_b), "relationship_type": "PURCHASE_ORDER_TO_INVOICE"},
    )
    assert res_link.status_code == 200
    assert res_link.json()["relationship_type"] == "PURCHASE_ORDER_TO_INVOICE"

    # 2. List relationships for PO
    res_list = await client.get(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/cross-document/relationships/{doc_a}",
        headers=admin["headers"],
    )
    assert res_list.status_code == 200
    rels = res_list.json()
    assert len(rels) >= 1
    assert rels[0]["target_document_id"] == str(doc_b)


@pytest.mark.asyncio
async def test_three_way_matching_perfect_match(client: AsyncClient, db_pool: asyncpg.Pool, env: dict):
    """Test 3-way matching where PO, GRN, and Invoice agree perfectly on price, quantity, and total."""
    org_id = env["org_id"]
    ws_id = env["ws_id"]
    admin = env["admin"]

    lines = [
        {"line_number": 1, "description": "Dell PowerEdge Server", "quantity": 2, "unit_price": 500.00, "subtotal": 1000.00},
        {"line_number": 2, "description": "Cat6 Network Cables 100m", "quantity": 4, "unit_price": 25.00, "subtotal": 100.00},
    ]

    po_id = await _seed_document(
        db_pool, org_id, ws_id, admin["id"], "PURCHASE_ORDER", "po_perf.pdf",
        "Apex Compute LLC", "PO-PERF", "1100.00", "1100.00", lines
    )
    grn_id = await _seed_document(
        db_pool, org_id, ws_id, admin["id"], "RECEIPT", "grn_perf.pdf",
        "Apex Compute LLC", "GRN-PERF", "1100.00", "1100.00", lines
    )
    inv_id = await _seed_document(
        db_pool, org_id, ws_id, admin["id"], "INVOICE", "inv_perf.pdf",
        "Apex Compute LLC", "INV-PERF", "1100.00", "1100.00", lines
    )

    res_match = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/cross-document/match-3way/{inv_id}",
        headers=admin["headers"],
        json={"po_document_id": str(po_id), "grn_document_id": str(grn_id)},
    )
    assert res_match.status_code == 200
    summary = res_match.json()
    assert summary["match_status"] == "PERFECT_MATCH"
    assert summary["vendor_matched"] is True
    assert Decimal(str(summary["total_discrepancy_amount"])) == Decimal("0.00")
    assert len(summary["discrepancies"]) == 0
    assert len(summary["line_item_matches"]) == 2


@pytest.mark.asyncio
async def test_three_way_matching_unit_price_inflation(client: AsyncClient, db_pool: asyncpg.Pool, env: dict):
    """Test 3-way matching detects unauthorized unit price increase on invoice vs PO."""
    org_id = env["org_id"]
    ws_id = env["ws_id"]
    admin = env["admin"]

    po_lines = [{"line_number": 1, "description": "High-Cap SAN Storage", "quantity": 2, "unit_price": 500.00, "subtotal": 1000.00}]
    grn_lines = [{"line_number": 1, "description": "High-Cap SAN Storage", "quantity": 2, "unit_price": 500.00, "subtotal": 1000.00}]
    # Invoice charges $600.00 instead of agreed PO $500.00 (+$100.00 variance/unit -> $200.00 total exposure)
    inv_lines = [{"line_number": 1, "description": "High-Cap SAN Storage", "quantity": 2, "unit_price": 600.00, "subtotal": 1200.00}]

    po_id = await _seed_document(db_pool, org_id, ws_id, admin["id"], "PURCHASE_ORDER", "po_price.pdf", "DataCore Inc", "PO-PRC", "1000.00", "1000.00", po_lines)
    grn_id = await _seed_document(db_pool, org_id, ws_id, admin["id"], "RECEIPT", "grn_price.pdf", "DataCore Inc", "GRN-PRC", "1000.00", "1000.00", grn_lines)
    inv_id = await _seed_document(db_pool, org_id, ws_id, admin["id"], "INVOICE", "inv_price.pdf", "DataCore Inc", "INV-PRC", "1200.00", "1200.00", inv_lines)

    res_match = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/cross-document/match-3way/{inv_id}",
        headers=admin["headers"],
        json={"po_document_id": str(po_id), "grn_document_id": str(grn_id)},
    )
    assert res_match.status_code == 200
    summary = res_match.json()
    assert summary["match_status"] == "DISCREPANCY_DETECTED"
    assert Decimal(str(summary["total_discrepancy_amount"])) == Decimal("200.00")

    disc = summary["discrepancies"][0]
    assert disc["discrepancy_type"] == "PRICE_VARIANCE"
    assert Decimal(str(disc["delta"])) == Decimal("100.00")
    assert Decimal(str(disc["expected_value"])) == Decimal("500.00")
    assert Decimal(str(disc["observed_value"])) == Decimal("600.00")

    # Verify discrepancy persisted in PostgreSQL document_discrepancies table
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT discrepancy_type, delta, status FROM document_discrepancies WHERE document_id = $1", inv_id)
        assert row is not None
        assert row["discrepancy_type"] == "PRICE_VARIANCE"
        assert row["delta"] == Decimal("100.00")
        assert row["status"] == "OPEN"


@pytest.mark.asyncio
async def test_three_way_matching_quantity_overbilling_short_shipment(client: AsyncClient, db_pool: asyncpg.Pool, env: dict):
    """Test 3-way matching detects when billed quantity exceeds physically received units."""
    org_id = env["org_id"]
    ws_id = env["ws_id"]
    admin = env["admin"]

    po_lines = [{"line_number": 1, "description": "Industrial Router", "quantity": 10, "unit_price": 200.00, "subtotal": 2000.00}]
    # Physical delivery was only 7 units (short shipment of 3 units)
    grn_lines = [{"line_number": 1, "description": "Industrial Router", "quantity": 7, "unit_price": 200.00, "subtotal": 1400.00}]
    # Supplier billed full 10 units ($600.00 excess billing exposure)
    inv_lines = [{"line_number": 1, "description": "Industrial Router", "quantity": 10, "unit_price": 200.00, "subtotal": 2000.00}]

    po_id = await _seed_document(db_pool, org_id, ws_id, admin["id"], "PURCHASE_ORDER", "po_qty.pdf", "NetLink Corp", "PO-QTY", "2000.00", "2000.00", po_lines)
    grn_id = await _seed_document(db_pool, org_id, ws_id, admin["id"], "RECEIPT", "grn_qty.pdf", "NetLink Corp", "GRN-QTY", "1400.00", "1400.00", grn_lines)
    inv_id = await _seed_document(db_pool, org_id, ws_id, admin["id"], "INVOICE", "inv_qty.pdf", "NetLink Corp", "INV-QTY", "2000.00", "2000.00", inv_lines)

    res_match = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/cross-document/match-3way/{inv_id}",
        headers=admin["headers"],
        json={"po_document_id": str(po_id), "grn_document_id": str(grn_id)},
    )
    assert res_match.status_code == 200
    summary = res_match.json()
    assert summary["match_status"] == "DISCREPANCY_DETECTED"
    assert Decimal(str(summary["total_discrepancy_amount"])) == Decimal("600.00")

    disc = summary["discrepancies"][0]
    assert disc["discrepancy_type"] == "QUANTITY_MISMATCH"
    assert Decimal(str(disc["delta"])) == Decimal("3.00")
    assert Decimal(str(disc["expected_value"])) == Decimal("7.00")
    assert Decimal(str(disc["observed_value"])) == Decimal("10.00")


@pytest.mark.asyncio
async def test_three_way_matching_cross_invoice_duplicate_billing(client: AsyncClient, db_pool: asyncpg.Pool, env: dict):
    """Test 3-way matching detects cumulative billing exceeding PO authorization across separate invoices."""
    org_id = env["org_id"]
    ws_id = env["ws_id"]
    admin = env["admin"]

    # Authorized PO: 5 units of Workstations
    po_lines = [{"line_number": 1, "description": "Developer Workstation Pro", "quantity": 5, "unit_price": 1000.00, "subtotal": 5000.00}]
    po_id = await _seed_document(db_pool, org_id, ws_id, admin["id"], "PURCHASE_ORDER", "po_dup.pdf", "Workstation World", "PO-DUP", "5000.00", "5000.00", po_lines)

    # Prior Invoice 1 already billed for 4 units
    inv1_lines = [{"line_number": 1, "description": "Developer Workstation Pro", "quantity": 4, "unit_price": 1000.00, "subtotal": 4000.00}]
    inv1_id = await _seed_document(db_pool, org_id, ws_id, admin["id"], "INVOICE", "inv1_dup.pdf", "Workstation World", "INV1-DUP", "4000.00", "4000.00", inv1_lines)
    # Link prior invoice to PO
    await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/cross-document/link/{inv1_id}",
        headers=admin["headers"],
        json={"target_document_id": str(po_id), "relationship_type": "PURCHASE_ORDER_TO_INVOICE"},
    )

    # Current Invoice 2 attempts to bill for 3 units (cumulative = 4 + 3 = 7 > 5 -> excess 2 units = $2000.00 duplicate charge)
    inv2_lines = [{"line_number": 1, "description": "Developer Workstation Pro", "quantity": 3, "unit_price": 1000.00, "subtotal": 3000.00}]
    inv2_id = await _seed_document(db_pool, org_id, ws_id, admin["id"], "INVOICE", "inv2_dup.pdf", "Workstation World", "INV2-DUP", "3000.00", "3000.00", inv2_lines)

    res_match = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/cross-document/match-3way/{inv2_id}",
        headers=admin["headers"],
        json={"po_document_id": str(po_id)},
    )
    assert res_match.status_code == 200
    summary = res_match.json()
    assert summary["match_status"] == "DISCREPANCY_DETECTED"
    assert Decimal(str(summary["total_discrepancy_amount"])) == Decimal("2000.00")

    disc = next(d for d in summary["discrepancies"] if d["discrepancy_type"] == "DUPLICATE_BILLING")
    assert Decimal(str(disc["delta"])) == Decimal("2.00")
    assert Decimal(str(disc["expected_value"])) == Decimal("5.00")
    assert Decimal(str(disc["observed_value"])) == Decimal("7.00")


@pytest.mark.asyncio
async def test_document_version_comparison_diffing(client: AsyncClient, db_pool: asyncpg.Pool, env: dict):
    """Test comparing two versions of a document to extract scalar and line-item diffs."""
    org_id = env["org_id"]
    ws_id = env["ws_id"]
    admin = env["admin"]

    # Version 1: $100.00 subtotal, 1 line item
    lines_v1 = [{"line_number": 1, "description": "Cloud Service Tier A", "quantity": 1, "unit_price": 100.00, "subtotal": 100.00}]
    doc_v1 = await _seed_document(db_pool, org_id, ws_id, admin["id"], "INVOICE", "inv_v1.pdf", "Cloud Provider", "INV-V1", "100.00", "100.00", lines_v1)

    # Version 2: Revised to $150.00 subtotal, unit price modified to $150.00
    lines_v2 = [{"line_number": 1, "description": "Cloud Service Tier A", "quantity": 1, "unit_price": 150.00, "subtotal": 150.00}]
    doc_v2 = await _seed_document(db_pool, org_id, ws_id, admin["id"], "INVOICE", "inv_v2.pdf", "Cloud Provider", "INV-V2", "150.00", "150.00", lines_v2)

    res_diff = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/cross-document/compare?doc_a_id={doc_v1}",
        headers=admin["headers"],
        json={"document_b_id": str(doc_v2)},
    )
    assert res_diff.status_code == 200
    diff = res_diff.json()
    assert diff["has_differences"] is True
    assert Decimal(str(diff["net_financial_variance"])) == Decimal("100.00")  # (total delta 50 + subtotal delta 50)

    # Verify scalar field diff
    sub_diff = next(s for s in diff["scalar_diffs"] if s["field_name"] == "subtotal")
    assert sub_diff["diff_type"] == "MODIFIED"
    assert sub_diff["doc_a_value"] == "100.00"
    assert sub_diff["doc_b_value"] == "150.00"

    # Verify line item diff
    line_diff = diff["line_item_diffs"][0]
    assert line_diff["diff_type"] == "MODIFIED"
    assert any("unit_price" in v for v in line_diff["variance_details"])


@pytest.mark.asyncio
async def test_workspace_financial_spend_analytics(client: AsyncClient, env: dict):
    """Test retrieving workspace financial analytics, discrepancy exposure, and vendor breakdown."""
    org_id = env["org_id"]
    ws_id = env["ws_id"]
    admin = env["admin"]

    res = await client.get(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/cross-document/analytics",
        headers=admin["headers"],
    )
    assert res.status_code == 200
    analytics = res.json()
    assert "document_count_by_category" in analytics
    assert analytics["open_discrepancies_count"] >= 3
    assert analytics["total_discrepancy_exposure"] > 0.0
    assert len(analytics["top_vendors"]) > 0


@pytest.mark.asyncio
async def test_multi_tenant_cross_document_isolation(client: AsyncClient, db_pool: asyncpg.Pool, env: dict):
    """Test that document relationships and discrepancies are isolated by workspace and tenant."""
    # Create isolated second workspace
    sec_env = await _setup_p7_workspace(client, suffix="isolated")
    sec_org_id = sec_env["org_id"]
    sec_ws_id = sec_env["ws_id"]

    # Seed document in secondary workspace
    sec_doc = await _seed_document(
        db_pool, sec_org_id, sec_ws_id, sec_env["admin"]["id"],
        "INVOICE", "sec_inv.pdf", "Sec Vendor", "SEC-01", "500.00", "500.00", []
    )

    # Secondary workspace queries analytics -> discrepancy exposure should be 0.0
    res_sec = await client.get(
        f"/api/v1/organizations/{sec_org_id}/workspaces/{sec_ws_id}/cross-document/analytics",
        headers=sec_env["admin"]["headers"],
    )
    assert res_sec.status_code == 200
    assert res_sec.json()["open_discrepancies_count"] == 0
    assert res_sec.json()["total_discrepancy_exposure"] == 0.0


@pytest.mark.asyncio
async def test_rbac_barriers_operator_vs_viewer(client: AsyncClient, db_pool: asyncpg.Pool, env: dict):
    """Test RBAC permission barriers: VIEWER can view analytics but cannot link or match."""
    org_id = env["org_id"]
    ws_id = env["ws_id"]
    viewer = env["viewer"]

    # 1. VIEWER can read analytics -> 200 OK
    res_analytics = await client.get(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/cross-document/analytics",
        headers=viewer["headers"],
    )
    assert res_analytics.status_code == 200

    # 2. VIEWER attempts to link documents -> 403 Forbidden
    fake_id = uuid.uuid4()
    res_link = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/cross-document/link/{fake_id}",
        headers=viewer["headers"],
        json={"target_document_id": str(uuid.uuid4()), "relationship_type": "PURCHASE_ORDER_TO_INVOICE"},
    )
    assert res_link.status_code == 403

    # 3. VIEWER attempts to execute 3-way match -> 403 Forbidden
    res_match = await client.post(
        f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/cross-document/match-3way/{fake_id}",
        headers=viewer["headers"],
        json={"po_document_id": str(uuid.uuid4())},
    )
    assert res_match.status_code == 403
