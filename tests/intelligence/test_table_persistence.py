"""
Unit & Integration Tests for TablePersistenceService (Phase 4 Step 4 Wave 4).
Tests:
1. Unit tests with Mock asyncpg Connection for SQL parameter binding and upsert execution.
2. JSON serialization of LineItemSchema and InvariantEvaluationResult metadata.
3. Fetch and reconstruction of extracted fields bundle from database rows.
4. Live Integration test against Neon PostgreSQL with transaction-scoped RLS tenant context.
"""
from decimal import Decimal
import json
import uuid
import pytest
import pytest_asyncio

from src.db.rls import TenantContext, apply_tenant_rls_context
from src.intelligence.extraction_schemas import (
    DocumentType,
    FieldDataType,
    ExtractionStatus,
    VerificationStatus,
    ExtractedField,
    InvoiceExtractionSchema,
    LineItemSchema,
)
from src.intelligence.hybrid_structured_extractor import TablePersistenceService
from src.intelligence.models import BoundingBox
from src.intelligence.table_contracts import (
    InvariantId,
    InvariantOutcomeEnum,
    InvariantSeverityEnum,
    InvariantEvaluationResult,
)


def _make_sample_schema() -> InvoiceExtractionSchema:
    """Helper to build a populated InvoiceExtractionSchema for persistence tests."""
    bbox = BoundingBox(
        x0=0.1, y0=0.2, x1=0.9, y1=0.25,
        x0_pt=61.2, y0_pt=158.4, x1_pt=550.8, y1_pt=198.0,
    )
    inv_num_f = ExtractedField(
        name="invoice_number",
        value="INV-2026-TEST-001",
        raw_value="INV-2026-TEST-001",
        data_type=FieldDataType.IDENTIFIER,
        confidence=0.99,
        source_page=0,
        bbox=bbox,
        extraction_status=ExtractionStatus.ACCEPTED,
        verification_status=VerificationStatus.UNVERIFIED,
    )
    subtot_f = ExtractedField(
        name="subtotal",
        value=Decimal("1000.00"),
        raw_value="$1,000.00",
        data_type=FieldDataType.MONETARY,
        confidence=0.98,
        source_page=0,
        bbox=bbox,
        extraction_status=ExtractionStatus.ACCEPTED,
        verification_status=VerificationStatus.UNVERIFIED,
    )
    tax_f = ExtractedField(
        name="tax_amount",
        value=Decimal("100.00"),
        raw_value="$100.00",
        data_type=FieldDataType.MONETARY,
        confidence=0.97,
        source_page=0,
        bbox=bbox,
        extraction_status=ExtractionStatus.ACCEPTED,
        verification_status=VerificationStatus.UNVERIFIED,
    )
    total_f = ExtractedField(
        name="total_amount",
        value=Decimal("1100.00"),
        raw_value="$1,100.00",
        data_type=FieldDataType.MONETARY,
        confidence=0.99,
        source_page=0,
        bbox=bbox,
        extraction_status=ExtractionStatus.ACCEPTED,
        verification_status=VerificationStatus.UNVERIFIED,
    )

    # Line item
    item_1 = LineItemSchema(
        line_number=1,
        description=ExtractedField(
            name="description",
            value="Cloud Instance Provisioning",
            raw_value="Cloud Instance Provisioning",
            confidence=0.96,
            source_page=0,
            bbox=bbox,
            extraction_status=ExtractionStatus.ACCEPTED,
        ),
        quantity=ExtractedField(
            name="quantity",
            value=Decimal("2"),
            raw_value="2",
            confidence=0.96,
            source_page=0,
            bbox=bbox,
            extraction_status=ExtractionStatus.ACCEPTED,
        ),
        unit_price=ExtractedField(
            name="unit_price",
            value=Decimal("500.00"),
            raw_value="$500.00",
            confidence=0.96,
            source_page=0,
            bbox=bbox,
            extraction_status=ExtractionStatus.ACCEPTED,
        ),
        total_price=ExtractedField(
            name="total_price",
            value=Decimal("1000.00"),
            raw_value="$1,000.00",
            confidence=0.96,
            source_page=0,
            bbox=bbox,
            extraction_status=ExtractionStatus.ACCEPTED,
        ),
    )

    inv_eval = InvariantEvaluationResult(
        invariant_id=InvariantId.INV_001,
        outcome=InvariantOutcomeEnum.PASSED,
        severity=InvariantSeverityEnum.CRITICAL,
        observed_value=Decimal("1000.00"),
        expected_value=Decimal("1000.00"),
        delta=Decimal("0.00"),
        tolerance=Decimal("0.00"),
        diagnostic_code=None,
        diagnostic_message="Line sum matches subtotal exactly",
    )

    return InvoiceExtractionSchema(
        document_type=DocumentType.COMMERCIAL_INVOICE,
        classification_confidence=0.99,
        invoice_number=inv_num_f,
        subtotal=subtot_f,
        tax_amount=tax_f,
        total_amount=total_f,
        line_items=[item_1],
        invariant_evaluations=[inv_eval],
        metadata={"classification_evidence": ["invoice", "total"]},
    )


class MockAsyncpgRecord(dict):
    """Mock record mimicking asyncpg.Record."""
    def __getitem__(self, key):
        return super().__getitem__(key)


class MockAsyncpgConnection:
    """Mock asyncpg connection recording all executed queries and parameters."""
    def __init__(self):
        self.executed_queries = []
        self.fetchrow_calls = []

    async def fetchrow(self, query, *args):
        self.fetchrow_calls.append((query, args))
        field_name = args[3] if len(args) > 3 else "field"
        return MockAsyncpgRecord({
            "id": uuid.uuid4(),
            "field_name": field_name,
        })

    async def fetch(self, query, *args):
        self.executed_queries.append((query, args))
        # Return mock rows for fetch
        return [
            MockAsyncpgRecord({
                "id": uuid.uuid4(),
                "field_name": "invoice_number",
                "field_value_raw": "INV-2026-TEST-001",
                "field_value_normalized": json.dumps("INV-2026-TEST-001"),
                "confidence": 0.99,
                "page_number": 0,
                "bounding_box": json.dumps({"x0": 0.1, "y0": 0.2, "x1": 0.9, "y1": 0.25}),
                "extraction_metadata": json.dumps({"extraction_status": "ACCEPTED"}),
                "is_verified": False,
                "verified_value": None,
                "created_at": "2026-11-06T00:00:00Z",
            }),
            MockAsyncpgRecord({
                "id": uuid.uuid4(),
                "field_name": "line_items",
                "field_value_raw": "1 line items extracted",
                "field_value_normalized": json.dumps([{
                    "line_number": 1,
                    "description": "Cloud Instance Provisioning",
                    "quantity": "2",
                    "unit_price": "500.00",
                    "total_price": "1000.00",
                }]),
                "confidence": 0.96,
                "page_number": 0,
                "bounding_box": json.dumps({"x0": 0.1, "y0": 0.2, "x1": 0.9, "y1": 0.25}),
                "extraction_metadata": json.dumps({
                    "line_item_count": 1,
                    "invariant_evaluations": [{"invariant_id": "INV_001", "outcome": "PASSED"}],
                }),
                "is_verified": False,
                "verified_value": None,
                "created_at": "2026-11-06T00:00:00Z",
            }),
        ]


@pytest.mark.asyncio
async def test_persist_table_extraction_bundle_unit():
    """Verify TablePersistenceService executes correct parameterized SQL upserts."""
    mock_conn = MockAsyncpgConnection()
    org_id = uuid.uuid4()
    ws_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    schema = _make_sample_schema()

    result = await TablePersistenceService.persist_table_extraction_bundle(
        conn=mock_conn,
        org_id=org_id,
        workspace_id=ws_id,
        document_id=doc_id,
        schema=schema,
    )

    assert result["status"] == "SUCCESS"
    assert result["document_id"] == str(doc_id)
    # Expected fields: invoice_number, subtotal, tax_amount, total_amount, line_items
    assert "invoice_number" in result["persisted_fields"]
    assert "subtotal" in result["persisted_fields"]
    assert "tax_amount" in result["persisted_fields"]
    assert "total_amount" in result["persisted_fields"]
    assert "line_items" in result["persisted_fields"]
    assert result["line_item_count"] == 1
    assert result["invariant_count"] == 1

    # Inspect the fetchrow call for line_items
    li_call = next((c for c in mock_conn.fetchrow_calls if c[1][3] == "line_items"), None)
    assert li_call is not None
    _, args = li_call
    assert args[0] == org_id
    assert args[1] == ws_id
    assert args[2] == doc_id
    assert args[3] == "line_items"
    assert args[4] == "1 line items extracted"
    
    # Check normalized JSON content
    norm_li = json.loads(args[5])
    assert len(norm_li) == 1
    assert norm_li[0]["description"] == "Cloud Instance Provisioning"
    assert norm_li[0]["total_price"] == "1000.00"

    # Check metadata invariant evaluations
    meta_li = json.loads(args[9])
    assert meta_li["line_item_count"] == 1
    assert meta_li["all_invariants_passed"] is True
    assert len(meta_li["invariant_evaluations"]) == 1


@pytest.mark.asyncio
async def test_fetch_extracted_table_bundle_unit():
    """Verify TablePersistenceService fetches and reconstructs document extractions."""
    mock_conn = MockAsyncpgConnection()
    org_id = uuid.uuid4()
    ws_id = uuid.uuid4()
    doc_id = uuid.uuid4()

    bundle = await TablePersistenceService.fetch_extracted_table_bundle(
        conn=mock_conn,
        org_id=org_id,
        workspace_id=ws_id,
        document_id=doc_id,
    )

    assert bundle["document_id"] == str(doc_id)
    assert "invoice_number" in bundle["fields"]
    assert bundle["fields"]["invoice_number"]["field_value_normalized"] == "INV-2026-TEST-001"
    assert bundle["line_items"] is not None
    assert bundle["line_items"]["field_name"] == "line_items"
    assert len(bundle["line_items"]["field_value_normalized"]) == 1


@pytest.mark.asyncio
async def test_live_postgres_persistence_and_rls_isolation(db_pool):
    """
    Live Integration Test on Neon PostgreSQL:
    Persists extraction bundle in tenant transaction, validates RLS isolation across workspaces.
    """
    org_id = uuid.uuid4()
    ws1_id = uuid.uuid4()
    ws2_id = uuid.uuid4()
    user_id = uuid.uuid4()
    doc_id = uuid.uuid4()

    schema = _make_sample_schema()

    context_ws1 = TenantContext(
        org_id=org_id,
        workspace_id=ws1_id,
        user_id=user_id,
        user_role="WORKSPACE_ADMIN",
    )
    context_ws2 = TenantContext(
        org_id=org_id,
        workspace_id=ws2_id,
        user_id=user_id,
        user_role="WORKSPACE_ADMIN",
    )

    async with db_pool.acquire() as conn:
        async with conn.transaction():
            # 1. Setup tenant entities with platform admin context
            await apply_tenant_rls_context(
                conn,
                context=TenantContext(is_platform_admin=True),
                enforce_app_role=False,
            )
            await conn.execute(
                "INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)",
                org_id, "Test Wave 4 Org", f"test-org-{uuid.uuid4().hex[:6]}",
            )
            await conn.execute(
                "INSERT INTO workspaces (id, organization_id, name, slug) VALUES ($1, $2, $3, $4)",
                ws1_id, org_id, "Workspace 1", f"ws-1-{uuid.uuid4().hex[:6]}",
            )
            await conn.execute(
                "INSERT INTO workspaces (id, organization_id, name, slug) VALUES ($1, $2, $3, $4)",
                ws2_id, org_id, "Workspace 2", f"ws-2-{uuid.uuid4().hex[:6]}",
            )
            await conn.execute(
                "INSERT INTO users (id, email, password_hash, full_name) VALUES ($1, $2, $3, $4)",
                user_id, f"user-{uuid.uuid4().hex[:6]}@example.com", "hash", "Test User",
            )
            await conn.execute(
                "INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1, $2, $3)",
                org_id, user_id, "MEMBER",
            )
            await conn.execute(
                "INSERT INTO workspace_memberships (organization_id, workspace_id, user_id, role) VALUES ($1, $2, $3, $4)",
                org_id, ws1_id, user_id, "WORKSPACE_ADMIN",
            )
            await conn.execute(
                "INSERT INTO documents (id, organization_id, workspace_id, filename, file_size_bytes, mime_type, sha256_hash, s3_key, status, uploaded_by_user_id) "
                "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
                doc_id, org_id, ws1_id, "invoice_test.pdf", 1024, "application/pdf",
                uuid.uuid4().hex, "test/key", "UPLOADED", user_id,
            )

            # 2. Switch to unprivileged role under Workspace 1 context
            await apply_tenant_rls_context(conn, context=context_ws1, enforce_app_role=True)

            # 3. Persist extraction bundle to extracted_fields
            res = await TablePersistenceService.persist_table_extraction_bundle(
                conn=conn,
                org_id=org_id,
                workspace_id=ws1_id,
                document_id=doc_id,
                schema=schema,
            )
            assert res["status"] == "SUCCESS"
            assert "line_items" in res["persisted_fields"]
            assert res["line_item_count"] == 1

            # 4. Fetch under Workspace 1 context: must succeed and find line_items
            bundle = await TablePersistenceService.fetch_extracted_table_bundle(
                conn=conn,
                org_id=org_id,
                workspace_id=ws1_id,
                document_id=doc_id,
            )
            assert bundle["line_items"] is not None
            assert len(bundle["line_items"]["field_value_normalized"]) == 1
            assert bundle["line_items"]["field_value_normalized"][0]["description"] == "Cloud Instance Provisioning"

            # 5. Switch to Workspace 2 context: RLS must block access (0 rows returned)
            await apply_tenant_rls_context(conn, context=context_ws2, enforce_app_role=True)
            bundle_ws2 = await TablePersistenceService.fetch_extracted_table_bundle(
                conn=conn,
                org_id=org_id,
                workspace_id=ws2_id,
                document_id=doc_id,
            )
            assert len(bundle_ws2["fields"]) == 0
            assert bundle_ws2["line_items"] is None
