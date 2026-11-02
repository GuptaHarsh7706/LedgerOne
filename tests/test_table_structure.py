"""
Tests for Table Structure Extraction and Metric Evaluation.
Verifies row grouping, column alignment, borderless ledgers,
wrapped text handling, and cell adjacency matrix metrics.
"""
import pytest
from src.intelligence.models import BoundingBox, TableRegion, TableCell, TableRow, TableColumn
from src.intelligence.table_structure import TableStructureExtractor
from src.intelligence.ocr.metrics import evaluate_table_structure


def test_table_structure_extractor_basic_grid():
    """Verify 3x3 table grid extraction from bounding boxes."""
    extractor = TableStructureExtractor()
    
    # 3 rows, 3 columns:
    # Row 0: y in [20, 40]
    # Row 1: y in [50, 70]
    # Row 2: y in [80, 100]
    # Col 0: x in [20, 100]
    # Col 1: x in [120, 200]
    # Col 2: x in [220, 300]
    items = [
        (BoundingBox(x0=0.03, y0=0.02, x1=0.16, y1=0.05, x0_pt=20, y0_pt=20, x1_pt=100, y1_pt=40), "Date"),
        (BoundingBox(x0=0.20, y0=0.02, x1=0.33, y1=0.05, x0_pt=120, y0_pt=20, x1_pt=200, y1_pt=40), "Description"),
        (BoundingBox(x0=0.36, y0=0.02, x1=0.49, y1=0.05, x0_pt=220, y0_pt=20, x1_pt=300, y1_pt=40), "Amount"),
        (BoundingBox(x0=0.03, y0=0.06, x1=0.16, y1=0.09, x0_pt=20, y0_pt=50, x1_pt=100, y1_pt=70), "2026-01-15"),
        (BoundingBox(x0=0.20, y0=0.06, x1=0.33, y1=0.09, x0_pt=120, y0_pt=50, x1_pt=200, y1_pt=70), "Server Hosting"),
        (BoundingBox(x0=0.36, y0=0.06, x1=0.49, y1=0.09, x0_pt=220, y0_pt=50, x1_pt=300, y1_pt=70), "$500.00"),
        (BoundingBox(x0=0.03, y0=0.10, x1=0.16, y1=0.13, x0_pt=20, y0_pt=80, x1_pt=100, y1_pt=100), "2026-01-16"),
        (BoundingBox(x0=0.20, y0=0.10, x1=0.33, y1=0.13, x0_pt=120, y0_pt=80, x1_pt=200, y1_pt=100), "Domain Reg"),
        (BoundingBox(x0=0.36, y0=0.10, x1=0.49, y1=0.13, x0_pt=220, y0_pt=80, x1_pt=300, y1_pt=100), "$25.00"),
    ]

    table = extractor.extract_table_region(items, region_id="tbl_test")
    assert table.row_count == 3
    assert table.col_count == 3
    assert len(table.cells) == 9

    # Verify first row is header
    assert table.rows[0].is_header is True
    assert table.rows[0].cells[0].text == "Date"
    assert table.rows[0].cells[1].text == "Description"
    assert table.rows[0].cells[2].text == "Amount"

    # Verify reading order relations
    relations = extractor.generate_reading_order_relations(table)
    assert len(relations) > 0
    # Between row 0 and row 1
    assert any(r.relation_type == "precedes" for r in relations)


def test_borderless_table_with_wrapped_text():
    """Verify borderless table where a description wraps to create irregular row height."""
    extractor = TableStructureExtractor(vertical_overlap_threshold=0.30)

    # Row 1 has a tall description box (height 35pt vs standard 15pt)
    items = [
        (BoundingBox(x0=0.05, y0=0.05, x1=0.20, y1=0.08, x0_pt=30, y0_pt=40, x1_pt=120, y1_pt=60), "Line Item 1"),
        (BoundingBox(x0=0.25, y0=0.05, x1=0.60, y1=0.11, x0_pt=150, y0_pt=40, x1_pt=360, y1_pt=80), "Multi-line wrapped\nproduct description text"),
        (BoundingBox(x0=0.70, y0=0.05, x1=0.90, y1=0.08, x0_pt=420, y0_pt=40, x1_pt=540, y1_pt=60), "$1,200.00"),
        (BoundingBox(x0=0.05, y0=0.15, x1=0.20, y1=0.18, x0_pt=30, y0_pt=110, x1_pt=120, y1_pt=130), "Line Item 2"),
        (BoundingBox(x0=0.25, y0=0.15, x1=0.60, y1=0.18, x0_pt=150, y0_pt=110, x1_pt=360, y1_pt=130), "Standard item"),
        (BoundingBox(x0=0.70, y0=0.15, x1=0.90, y1=0.18, x0_pt=420, y0_pt=110, x1_pt=540, y1_pt=130), "$450.00"),
    ]

    table = extractor.extract_table_region(items, is_borderless=True)
    assert table.is_borderless is True
    assert table.row_count == 2
    assert table.col_count == 3
    assert len(table.cells) == 6


def test_evaluate_table_structure_perfect_match():
    """Verify evaluation metric on identical predicted and ground truth tables."""
    extractor = TableStructureExtractor()
    items = [
        (BoundingBox(x0=0.1, y0=0.1, x1=0.4, y1=0.2, x0_pt=50, y0_pt=50, x1_pt=200, y1_pt=100), "Qty"),
        (BoundingBox(x0=0.5, y0=0.1, x1=0.8, y1=0.2, x0_pt=250, y0_pt=50, x1_pt=400, y1_pt=100), "Total"),
        (BoundingBox(x0=0.1, y0=0.3, x1=0.4, y1=0.4, x0_pt=50, y0_pt=150, x1_pt=200, y1_pt=200), "5"),
        (BoundingBox(x0=0.5, y0=0.3, x1=0.8, y1=0.4, x0_pt=250, y0_pt=150, x1_pt=400, y1_pt=200), "$100.00"),
    ]
    pred = extractor.extract_table_region(items)
    gt = extractor.extract_table_region(items)

    metrics = evaluate_table_structure(pred, gt)
    assert metrics["row_metrics"]["f1"] == 1.0
    assert metrics["column_metrics"]["f1"] == 1.0
    assert metrics["cell_adjacency_metrics"]["f1"] == 1.0
    assert metrics["composite_table_structure_f1"] == 1.0
