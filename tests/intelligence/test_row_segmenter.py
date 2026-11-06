"""
Tests for Row Segmenter and Line Item Extraction Engine (Phase 4 Step 4 Wave 3).
Validates semantic row classification, multi-line wrapped description merging,
and strongly typed LineItemField extraction with pure Decimal arithmetic.
"""
from decimal import Decimal
import pytest

from src.intelligence.models import BoundingBox
from src.intelligence.row_segmenter import (
    RowSegmenter,
    parse_monetary_decimal,
    parse_percentage_decimal,
)
from src.intelligence.table_contracts import (
    TableCell,
    TableBlock,
    TableRow,
    TableRowType,
    TableType,
)


def _make_bbox(x0: float, y0: float, x1: float, y1: float) -> BoundingBox:
    """Helper to create standardized BoundingBox."""
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


def test_parse_monetary_decimal():
    """Parses standard currency formats, thousands separators, and negative parentheses."""
    assert parse_monetary_decimal("$1,250.00") == Decimal("1250.00")
    assert parse_monetary_decimal("€ 450.50") == Decimal("450.50")
    assert parse_monetary_decimal("£99.99") == Decimal("99.99")
    assert parse_monetary_decimal("1500") == Decimal("1500")

    # Negative accounting representations
    assert parse_monetary_decimal("($100.00)") == Decimal("-100.00")
    assert parse_monetary_decimal("-$50.00") == Decimal("-50.00")
    assert parse_monetary_decimal("-25.50") == Decimal("-25.50")

    # Invalid / empty
    assert parse_monetary_decimal("") is None
    assert parse_monetary_decimal("N/A") is None


def test_parse_percentage_decimal():
    """Parses tax and discount percentages."""
    assert parse_percentage_decimal("19%") == Decimal("19")
    assert parse_percentage_decimal("20.0 %") == Decimal("20.0")
    assert parse_percentage_decimal("7.5%") == Decimal("7.5")
    assert parse_percentage_decimal("None") is None


def test_row_segmentation_standard_invoice():
    """Segments standard invoice table into HEADER, DATA, and TOTAL rows."""
    segmenter = RowSegmenter()

    # Row 0: Header
    c00 = _make_cell("Item", 50, 100, 100, 120, 0, 0)
    c01 = _make_cell("Description", 110, 100, 300, 120, 0, 1)
    c02 = _make_cell("Qty", 310, 100, 370, 120, 0, 2)
    c03 = _make_cell("Unit Price", 380, 100, 460, 120, 0, 3)
    c04 = _make_cell("Total", 470, 100, 550, 120, 0, 4)
    row_0 = TableRow(cells=(c00, c01, c02, c03, c04), row_index=0)

    # Row 1: Data 1
    c10 = _make_cell("1", 50, 130, 100, 150, 1, 0)
    c11 = _make_cell("Cloud Server Hosting", 110, 130, 300, 150, 1, 1)
    c12 = _make_cell("2", 310, 130, 370, 150, 1, 2)
    c13 = _make_cell("$4,500.00", 380, 130, 460, 150, 1, 3)
    c14 = _make_cell("$9,000.00", 470, 130, 550, 150, 1, 4)
    row_1 = TableRow(cells=(c10, c11, c12, c13, c14), row_index=1)

    # Row 2: Total
    c20 = _make_cell("Grand Total", 110, 160, 300, 180, 2, 1)
    c21 = _make_cell("$9,000.00", 470, 160, 550, 180, 2, 4)
    row_2 = TableRow(cells=(c20, c21), row_index=2)

    block = TableBlock(
        page_number=1,
        bbox=_make_bbox(50, 100, 550, 180),
        rows=(row_0, row_1, row_2),
        table_type=TableType.STANDARD_GRID,
    )

    enriched_block, line_items = segmenter.segment_table_rows(block)

    # Assert row types
    assert enriched_block.rows[0].row_type == TableRowType.HEADER
    assert enriched_block.rows[1].row_type == TableRowType.DATA
    assert enriched_block.rows[2].row_type == TableRowType.TOTAL

    # Assert extracted LineItemField
    assert len(line_items) == 1
    item = line_items[0]
    assert item.line_number == 1
    assert item.description == "Cloud Server Hosting"
    assert item.quantity == Decimal("2")
    assert item.unit_price == Decimal("4500.00")
    assert item.line_net == Decimal("9000.00")


def test_row_segmentation_multi_line_wrapped_description():
    """
    Multi-line description wrapping:
    Row 1 contains main item details.
    Row 2 contains wrapped continuation text with no financial amounts.
    RowSegmenter must merge Row 2 into Row 1's description!
    """
    segmenter = RowSegmenter()

    # Header
    c00 = _make_cell("Item", 50, 100, 100, 120, 0, 0)
    c01 = _make_cell("Description", 110, 100, 300, 120, 0, 1)
    c02 = _make_cell("Qty", 310, 100, 370, 120, 0, 2)
    c03 = _make_cell("Unit Price", 380, 100, 460, 120, 0, 3)
    c04 = _make_cell("Total", 470, 100, 550, 120, 0, 4)
    row_0 = TableRow(cells=(c00, c01, c02, c03, c04), row_index=0)

    # Line 1: Main data row
    c10 = _make_cell("1", 50, 130, 100, 150, 1, 0)
    c11 = _make_cell("Architecture Review and System Hardening", 110, 130, 300, 150, 1, 1)
    c12 = _make_cell("40.0", 310, 130, 370, 150, 1, 2)
    c13 = _make_cell("$200.00", 380, 130, 460, 150, 1, 3)
    c14 = _make_cell("$8,000.00", 470, 130, 550, 150, 1, 4)
    row_1 = TableRow(cells=(c10, c11, c12, c13, c14), row_index=1)

    # Line 2: Wrapped description cell continuation (no numbers)
    c21 = _make_cell("(includes PostgreSQL Row Level Security audit)", 110, 155, 300, 175, 2, 1)
    row_2 = TableRow(cells=(c21,), row_index=2)

    block = TableBlock(
        page_number=1,
        bbox=_make_bbox(50, 100, 550, 175),
        rows=(row_0, row_1, row_2),
        table_type=TableType.STANDARD_GRID,
    )

    enriched_block, line_items = segmenter.segment_table_rows(block)

    # Line items count must be exactly 1!
    assert len(line_items) == 1
    item = line_items[0]
    assert item.line_number == 1
    # Description was merged seamlessly
    assert "Architecture Review and System Hardening" in item.description
    assert "(includes PostgreSQL Row Level Security audit)" in item.description
    assert item.line_net == Decimal("8000.00")
