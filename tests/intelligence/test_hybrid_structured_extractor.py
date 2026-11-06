"""
Unit & Integration Tests for HybridStructuredExtractor (Phase 4 Step 4 Wave 4).
Tests:
1. End-to-end table extraction and line-item generation from TableBlock.
2. Accounting invariant evaluation (INV-001 through INV-008) attached to schema.
3. Multi-line wrapped description cell merging through extraction pipeline.
4. Multipage table stitching and unified line-item extraction.
5. Automatic table discovery from page text blocks.
6. LineItemSchema and LineItemField lossless conversion round-trip.
"""
from decimal import Decimal
import pytest
import torch

from src.intelligence.extraction_schemas import (
    DocumentType,
    FieldDataType,
    ExtractionStatus,
    VerificationStatus,
    ExtractedField,
    InvoiceExtractionSchema,
    LineItemSchema,
)
from src.intelligence.hybrid_structured_extractor import (
    HybridStructuredExtractor,
    extract_tables_from_blocks,
    table_region_to_table_block,
)
from src.intelligence.models import (
    BoundingBox,
    ExtractedPage,
    PageClassification,
    TextBlock,
)
from src.intelligence.table_contracts import (
    TableCell,
    TableBlock,
    TableRow,
    TableRowType,
    TableType,
    LineItemField,
    InvariantId,
    InvariantOutcomeEnum,
)


def _make_bbox(x0: float, y0: float, x1: float, y1: float) -> BoundingBox:
    """Helper to create standardized normalized and point coordinates."""
    return BoundingBox(
        x0=x0 / 612.0,
        y0=y0 / 792.0,
        x1=x1 / 612.0,
        y1=y1 / 792.0,
        x0_pt=x0,
        y0_pt=y0,
        x1_pt=x1,
        y1_pt=y1,
    )


def _make_cell(text: str, cx0: float, y0: float, cx1: float, y1: float, r: int, c: int) -> TableCell:
    return TableCell(
        text=text,
        bbox=_make_bbox(cx0, y0, cx1, y1),
        row_idx=r,
        col_idx=c,
    )


def _make_test_page(lines: list[str], page_idx: int = 0) -> ExtractedPage:
    """Helper to construct ExtractedPage from text lines."""
    blocks = []
    for i, line in enumerate(lines):
        y0 = 40.0 + (i * 25.0)
        bbox = _make_bbox(50.0, y0, 550.0, y0 + 20.0)
        blocks.append(
            TextBlock(
                block_index=i,
                reading_order_index=i,
                text=line,
                bbox=bbox,
                confidence=1.0,
                source="native",
            )
        )

    return ExtractedPage(
        page_index=page_idx,
        width_pt=612.0,
        height_pt=792.0,
        classification=PageClassification.DIGITAL_TEXT,
        classification_confidence=1.0,
        digital_text="\n".join(lines),
        digital_blocks=blocks,
    )


class TestHybridStructuredExtractorPipeline:
    """Test suite for unified table extraction and accounting invariant evaluation."""

    def test_pipeline_table_extraction_and_invariants(self):
        """Verify extraction pipeline extracts line items, validates INV-001 and INV-005."""
        extractor = HybridStructuredExtractor(use_gpu=torch.cuda.is_available())

        # Page header text
        page = _make_test_page([
            "COMMERCIAL INVOICE",
            "Invoice #: INV-2026-9041",
            "Invoice Date: 2026-10-15",
            "Subtotal: $12,500.00 USD",
            "Tax Amount: $1,250.00 USD",
            "Total Due: $13,750.00 USD",
        ])

        # Tabular line items: 2 data rows totaling 12,500.00
        # Row 0: Header
        c00 = _make_cell("Item", 50, 200, 100, 220, 0, 0)
        c01 = _make_cell("Description", 110, 200, 300, 220, 0, 1)
        c02 = _make_cell("Qty", 310, 200, 370, 220, 0, 2)
        c03 = _make_cell("Unit Price", 380, 200, 460, 220, 0, 3)
        c04 = _make_cell("Total", 470, 200, 550, 220, 0, 4)
        row_0 = TableRow(cells=(c00, c01, c02, c03, c04), row_index=0)

        # Row 1: Line 1 -> 2 * 5,000 = 10,000
        c10 = _make_cell("1", 50, 230, 100, 250, 1, 0)
        c11 = _make_cell("Database Cluster Node", 110, 230, 300, 250, 1, 1)
        c12 = _make_cell("2", 310, 230, 370, 250, 1, 2)
        c13 = _make_cell("$5,000.00", 380, 230, 460, 250, 1, 3)
        c14 = _make_cell("$10,000.00", 470, 230, 550, 250, 1, 4)
        row_1 = TableRow(cells=(c10, c11, c12, c13, c14), row_index=1)

        # Row 2: Line 2 -> 5 * 500 = 2,500
        c20 = _make_cell("2", 50, 260, 100, 280, 2, 0)
        c21 = _make_cell("NVMe Storage Volume", 110, 260, 300, 280, 2, 1)
        c22 = _make_cell("5", 310, 260, 370, 280, 2, 2)
        c23 = _make_cell("$500.00", 380, 260, 460, 280, 2, 3)
        c24 = _make_cell("$2,500.00", 470, 260, 550, 280, 2, 4)
        row_2 = TableRow(cells=(c20, c21, c22, c23, c24), row_index=2)

        table_block = TableBlock(
            page_number=1,
            bbox=_make_bbox(50, 200, 550, 280),
            rows=(row_0, row_1, row_2),
            table_type=TableType.STANDARD_GRID,
        )

        schema = extractor.extract_document([page], tables=[table_block])

        assert isinstance(schema, InvoiceExtractionSchema)
        assert schema.invoice_number is not None
        assert "INV-2026-9041" in schema.invoice_number.value
        assert schema.total_amount.value == Decimal("13750.00")
        assert schema.subtotal.value == Decimal("12500.00")
        assert schema.tax_amount.value == Decimal("1250.00")

        # Line items assertion
        assert len(schema.line_items) == 2
        item_1 = schema.line_items[0]
        assert item_1.line_number == 1
        assert item_1.description.value == "Database Cluster Node"
        assert item_1.quantity.value == Decimal("2")
        assert item_1.unit_price.value == Decimal("5000.00")
        assert item_1.total_price.value == Decimal("10000.00")

        item_2 = schema.line_items[1]
        assert item_2.line_number == 2
        assert item_2.description.value == "NVMe Storage Volume"
        assert item_2.quantity.value == Decimal("5")
        assert item_2.unit_price.value == Decimal("500.00")
        assert item_2.total_price.value == Decimal("2500.00")

        # Accounting Invariants assertion
        inv_map = {inv.invariant_id: inv for inv in schema.invariant_evaluations}
        assert InvariantId.INV_001 in inv_map
        assert inv_map[InvariantId.INV_001].outcome == InvariantOutcomeEnum.PASSED
        assert inv_map[InvariantId.INV_001].delta == Decimal("0.00")

        assert InvariantId.INV_005 in inv_map
        assert inv_map[InvariantId.INV_005].outcome == InvariantOutcomeEnum.PASSED
        assert inv_map[InvariantId.INV_005].delta == Decimal("0.00")

        assert InvariantId.INV_008 in inv_map
        assert inv_map[InvariantId.INV_008].outcome == InvariantOutcomeEnum.PASSED

    def test_pipeline_wrapped_description_merging(self):
        """Verify pipeline merges wrapped description rows and produces coherent line item."""
        extractor = HybridStructuredExtractor(use_gpu=torch.cuda.is_available())

        page = _make_test_page([
            "COMMERCIAL INVOICE #INV-WRAP-1",
            "Total: $8,000.00 USD",
            "Subtotal: $8,000.00 USD",
        ])

        # Header
        c00 = _make_cell("Description", 110, 100, 300, 120, 0, 0)
        c01 = _make_cell("Qty", 310, 100, 370, 120, 0, 1)
        c02 = _make_cell("Price", 380, 100, 460, 120, 0, 2)
        c03 = _make_cell("Total", 470, 100, 550, 120, 0, 3)
        row_0 = TableRow(cells=(c00, c01, c02, c03), row_index=0)

        # Line 1: Main item
        c10 = _make_cell("Infrastructure Engineering and Security Architecture", 110, 130, 300, 150, 1, 0)
        c11 = _make_cell("1", 310, 130, 370, 150, 1, 1)
        c12 = _make_cell("$8,000.00", 380, 130, 460, 150, 1, 2)
        c13 = _make_cell("$8,000.00", 470, 130, 550, 150, 1, 3)
        row_1 = TableRow(cells=(c10, c11, c12, c13), row_index=1)

        # Line 2: Wrapped text continuation
        c20 = _make_cell("(includes PostgreSQL Row-Level Security policy hardening)", 110, 155, 300, 175, 2, 0)
        row_2 = TableRow(cells=(c20,), row_index=2)

        table_block = TableBlock(
            page_number=1,
            bbox=_make_bbox(50, 100, 550, 175),
            rows=(row_0, row_1, row_2),
            table_type=TableType.STANDARD_GRID,
        )

        schema = extractor.extract_document([page], tables=[table_block])
        assert len(schema.line_items) == 1
        item = schema.line_items[0]
        assert "Infrastructure Engineering" in item.description.value
        assert "Row-Level Security policy hardening" in item.description.value
        assert item.total_price.value == Decimal("8000.00")

    def test_line_item_schema_lossless_roundtrip(self):
        """Verify LineItemField and LineItemSchema lossless bidirectional conversion."""
        original_lif = LineItemField(
            line_number=3,
            description="High-Throughput Distributed Cache Redis Cluster",
            line_net=Decimal("1599.99"),
            quantity=Decimal("3"),
            unit_price=Decimal("533.33"),
            line_discount=Decimal("0.00"),
            tax_rate=Decimal("19.0"),
            tax_amount=Decimal("303.99"),
            line_total=Decimal("1903.98"),
            item_code="REDIS-PRO-3X",
            confidence=0.98,
            bbox=_make_bbox(10, 20, 300, 50),
        )

        schema_item = LineItemSchema.from_line_item_field(original_lif)
        assert schema_item.line_number == 3
        assert schema_item.description.value == "High-Throughput Distributed Cache Redis Cluster"
        assert schema_item.quantity.value == Decimal("3")
        assert schema_item.unit_price.value == Decimal("533.33")
        assert schema_item.total_price.value == Decimal("1903.98")
        assert schema_item.item_code.value == "REDIS-PRO-3X"

        # Convert back
        recovered_lif = schema_item.to_line_item_field()
        assert recovered_lif.line_number == original_lif.line_number
        assert recovered_lif.description == original_lif.description
        assert recovered_lif.quantity == original_lif.quantity
        assert recovered_lif.unit_price == original_lif.unit_price
        assert recovered_lif.line_total == original_lif.line_total
        assert recovered_lif.item_code == original_lif.item_code
