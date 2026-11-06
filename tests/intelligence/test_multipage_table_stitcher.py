"""
Tests for Multi-Page Table Stitcher (Phase 4 Step 4 Wave 2).
Validates cross-page continuation detection across:
1. Mode A: Carried Forward / Brought Forward financial balance matching.
2. Mode B: Un-totaled column layout alignment corroboration (Delta x <= 5.0 pt).
3. Repeated header deduplication and monotonic row re-indexing.
4. Non-contiguous page rejection.
"""
from decimal import Decimal
import pytest

from src.intelligence.models import BoundingBox
from src.intelligence.multipage_table_stitcher import (
    ContinuationMode,
    MultiPageTableStitcher,
    StitchedTableResult,
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


def _make_row(
    texts: list[str],
    col_bounds: list[tuple[float, float]],
    y0: float,
    y1: float,
    row_idx: int,
    row_type: TableRowType = TableRowType.DATA,
) -> TableRow:
    """Helper to build TableRow with ordered cells."""
    cells = []
    for c_idx, (text, (cx0, cx1)) in enumerate(zip(texts, col_bounds)):
        bbox = _make_bbox(cx0, y0, cx1, y1)
        cells.append(TableCell(
            text=text,
            bbox=bbox,
            row_idx=row_idx,
            col_idx=c_idx,
            is_header=(row_type == TableRowType.HEADER),
        ))
    row_bbox = _make_bbox(col_bounds[0][0], y0, col_bounds[-1][1], y1)
    return TableRow(
        cells=tuple(cells),
        row_type=row_type,
        row_index=row_idx,
        bbox=row_bbox,
    )


# Standard 3-column financial table layout: [Item Description, Quantity, Total Amount]
COL_SPANS = [(50.0, 350.0), (360.0, 430.0), (440.0, 550.0)]


def test_stitch_mode_a_carried_brought_forward():
    """
    Mode A: Explicit Carried Forward / Brought Forward balance equality.
    Page 1 ends with 'Total carried forward $4,500.00'
    Page 2 begins with 'Amount brought forward $4,500.00'
    """
    stitcher = MultiPageTableStitcher()

    row_h1 = _make_row(["Item", "Qty", "Total"], COL_SPANS, 100.0, 120.0, 0, TableRowType.HEADER)
    row_d1 = _make_row(["Server Hardware", "2", "4,500.00"], COL_SPANS, 130.0, 150.0, 1, TableRowType.DATA)
    row_cf = _make_row(["Total carried forward", "", "$4,500.00"], COL_SPANS, 700.0, 720.0, 2, TableRowType.TOTAL)

    page1_table = TableBlock(
        page_number=1,
        bbox=_make_bbox(50.0, 100.0, 550.0, 720.0),
        rows=(row_h1, row_d1, row_cf),
        table_type=TableType.STANDARD_GRID,
    )

    row_bf = _make_row(["Amount brought forward", "", "$4,500.00"], COL_SPANS, 80.0, 100.0, 0, TableRowType.METADATA)
    row_d2 = _make_row(["Installation Service", "1", "500.00"], COL_SPANS, 110.0, 130.0, 1, TableRowType.DATA)

    page2_table = TableBlock(
        page_number=2,
        bbox=_make_bbox(50.0, 80.0, 550.0, 130.0),
        rows=(row_bf, row_d2),
        table_type=TableType.STANDARD_GRID,
    )

    res = stitcher.stitch_two_tables(page1_table, page2_table)
    assert res.is_continuation is True
    assert res.continuation_mode == ContinuationMode.CARRIED_FORWARD
    assert res.carried_forward_amount == Decimal("4500.00")
    assert res.brought_forward_amount == Decimal("4500.00")
    assert res.source_pages == (1, 2)
    assert res.stitched_table is not None
    # All rows preserved monotonically
    assert len(res.stitched_table.rows) == 5


def test_stitch_mode_b_column_alignment_and_header_pruning():
    """
    Mode B: Un-totaled continuation with column alignment corroboration (Delta x <= 5.0 pt).
    Page 2 repeats the header row; stitcher prunes it and continues row index.
    """
    stitcher = MultiPageTableStitcher(max_column_alignment_delta_pt=5.0)

    # Page 1: Header + 2 data rows
    row_h1 = _make_row(["Product", "Qty", "Price"], COL_SPANS, 100.0, 120.0, 0, TableRowType.HEADER)
    row_d1 = _make_row(["Widget A", "10", "100.00"], COL_SPANS, 130.0, 150.0, 1, TableRowType.DATA)
    row_d2 = _make_row(["Widget B", "5", "50.00"], COL_SPANS, 160.0, 180.0, 2, TableRowType.DATA)

    page1_table = TableBlock(
        page_number=1,
        bbox=_make_bbox(50.0, 100.0, 550.0, 180.0),
        rows=(row_h1, row_d1, row_d2),
        table_type=TableType.STANDARD_GRID,
    )

    # Page 2: Column bounds with slight offset of 1.5 pt (< 5.0 pt max delta)
    aligned_spans = [(cx0 + 1.5, cx1 + 1.5) for cx0, cx1 in COL_SPANS]
    row_h2_repeated = _make_row(["Product", "Qty", "Price"], aligned_spans, 100.0, 120.0, 0, TableRowType.HEADER)
    row_d3 = _make_row(["Widget C", "20", "200.00"], aligned_spans, 130.0, 150.0, 1, TableRowType.DATA)

    page2_table = TableBlock(
        page_number=2,
        bbox=_make_bbox(51.5, 100.0, 551.5, 150.0),
        rows=(row_h2_repeated, row_d3),
        table_type=TableType.STANDARD_GRID,
    )

    res = stitcher.stitch_two_tables(page1_table, page2_table)
    assert res.is_continuation is True
    assert res.continuation_mode == ContinuationMode.COLUMN_ALIGNMENT_CORROBORATION
    assert res.alignment_delta_pt <= 5.0
    assert res.pruned_header_count == 1
    assert res.stitched_table is not None

    # Total rows: 3 from page 1 + 1 from page 2 (repeated header was pruned) = 4 rows
    assert len(res.stitched_table.rows) == 4
    # Check monotonic row indexing
    indices = [r.row_index for r in res.stitched_table.rows]
    assert indices == [0, 1, 2, 3]


def test_stitch_rejects_non_contiguous_pages():
    """Stitcher must reject tables on non-contiguous pages (e.g. Page 1 and Page 3)."""
    stitcher = MultiPageTableStitcher()

    row_h1 = _make_row(["Product", "Qty", "Price"], COL_SPANS, 100.0, 120.0, 0, TableRowType.HEADER)
    page1_table = TableBlock(page_number=1, bbox=_make_bbox(50, 100, 550, 120), rows=(row_h1,))

    row_d1 = _make_row(["Widget C", "20", "200.00"], COL_SPANS, 100.0, 120.0, 0, TableRowType.DATA)
    page3_table = TableBlock(page_number=3, bbox=_make_bbox(50, 100, 550, 120), rows=(row_d1,))

    res = stitcher.stitch_two_tables(page1_table, page3_table)
    assert res.is_continuation is False
    assert res.continuation_mode == ContinuationMode.NONE


def test_stitch_rejects_mismatched_unaligned_tables():
    """Stitcher must reject tables with different schemas and mismatched balances."""
    stitcher = MultiPageTableStitcher()

    # Table 1: 3 columns
    row_h1 = _make_row(["Col1", "Col2", "Col3"], COL_SPANS, 100.0, 120.0, 0, TableRowType.HEADER)
    page1_table = TableBlock(page_number=1, bbox=_make_bbox(50, 100, 550, 120), rows=(row_h1,))

    # Table 2: 2 completely different columns at different positions
    different_spans = [(100.0, 250.0), (300.0, 450.0)]
    row_h2 = _make_row(["DiffA", "DiffB"], different_spans, 100.0, 120.0, 0, TableRowType.HEADER)
    page2_table = TableBlock(page_number=2, bbox=_make_bbox(100, 100, 450, 120), rows=(row_h2,))

    res = stitcher.stitch_two_tables(page1_table, page2_table)
    assert res.is_continuation is False
    assert res.continuation_mode == ContinuationMode.NONE


def test_stitch_sequence():
    """stitch_sequence combines multi-page continuation runs."""
    stitcher = MultiPageTableStitcher()

    row_h1 = _make_row(["Col1", "Col2", "Col3"], COL_SPANS, 100.0, 120.0, 0, TableRowType.HEADER)
    row_d1 = _make_row(["Val1", "Val2", "Val3"], COL_SPANS, 130.0, 150.0, 1, TableRowType.DATA)
    p1 = TableBlock(page_number=1, bbox=_make_bbox(50, 100, 550, 150), rows=(row_h1, row_d1))

    # Page 2 continues Page 1
    row_d2 = _make_row(["Val4", "Val5", "Val6"], COL_SPANS, 130.0, 150.0, 0, TableRowType.DATA)
    p2 = TableBlock(page_number=2, bbox=_make_bbox(50, 100, 550, 150), rows=(row_d2,))

    # Page 4 is non-contiguous
    p4 = TableBlock(page_number=4, bbox=_make_bbox(50, 100, 550, 150), rows=(row_d2,))

    results = stitcher.stitch_sequence([p1, p2, p4])
    assert len(results) == 2
    # First result stitched page 1 and page 2
    assert results[0].is_continuation is True
    assert results[0].source_pages == (1, 2)
    # Second result is page 4 alone
    assert results[1].is_continuation is False
    assert results[1].source_pages == (4,)
