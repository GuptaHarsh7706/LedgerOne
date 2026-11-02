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


def test_incorrect_column_assignment_penalizes_metrics():
    """
    Adversarial test: verify that merging or misassigning columns strictly penalizes
    column precision, recall, and horizontal cell adjacency F1.
    """
    extractor = TableStructureExtractor()
    items_gt = [
        (BoundingBox(x0=0.1, y0=0.1, x1=0.3, y1=0.2, x0_pt=50, y0_pt=50, x1_pt=150, y1_pt=100), "Item"),
        (BoundingBox(x0=0.4, y0=0.1, x1=0.6, y1=0.2, x0_pt=200, y0_pt=50, x1_pt=300, y1_pt=100), "Qty"),
        (BoundingBox(x0=0.7, y0=0.1, x1=0.9, y1=0.2, x0_pt=350, y0_pt=50, x1_pt=450, y1_pt=100), "Total"),
        (BoundingBox(x0=0.1, y0=0.3, x1=0.3, y1=0.4, x0_pt=50, y0_pt=150, x1_pt=150, y1_pt=200), "Widget"),
        (BoundingBox(x0=0.4, y0=0.3, x1=0.6, y1=0.4, x0_pt=200, y0_pt=150, x1_pt=300, y1_pt=200), "5"),
        (BoundingBox(x0=0.7, y0=0.3, x1=0.9, y1=0.4, x0_pt=350, y0_pt=150, x1_pt=450, y1_pt=200), "$100.00"),
    ]
    gt_table = extractor.extract_table_region(items_gt)

    # Erroneous prediction: columns 1 and 2 merged into a single wide column
    items_pred_merged = [
        (BoundingBox(x0=0.1, y0=0.1, x1=0.3, y1=0.2, x0_pt=50, y0_pt=50, x1_pt=150, y1_pt=100), "Item"),
        (BoundingBox(x0=0.4, y0=0.1, x1=0.9, y1=0.2, x0_pt=200, y0_pt=50, x1_pt=450, y1_pt=100), "Qty Total"),
        (BoundingBox(x0=0.1, y0=0.3, x1=0.3, y1=0.4, x0_pt=50, y0_pt=150, x1_pt=150, y1_pt=200), "Widget"),
        (BoundingBox(x0=0.4, y0=0.3, x1=0.9, y1=0.4, x0_pt=200, y0_pt=150, x1_pt=450, y1_pt=200), "5 $100.00"),
    ]
    pred_merged_table = extractor.extract_table_region(items_pred_merged)
    metrics_merged = evaluate_table_structure(pred_merged_table, gt_table)

    # Column F1 is penalized from 1.0 to 0.40
    assert metrics_merged["column_metrics"]["f1"] < 0.50
    assert metrics_merged["column_metrics"]["recall"] < 0.50
    # Horizontal cell adjacency is completely destroyed (f1 = 0.0)
    assert metrics_merged["cell_adjacency_metrics"]["horizontal"]["f1"] == 0.0
    # Composite structure score is penalized below 0.50
    assert metrics_merged["composite_table_structure_f1"] < 0.50


def test_incorrect_cell_content_association_penalizes_accuracy():
    """
    Adversarial test: verify that displaced or swapped text blocks strictly penalize
    content association accuracy below 1.0.
    """
    extractor = TableStructureExtractor()
    items_gt = [
        (BoundingBox(x0=0.1, y0=0.1, x1=0.3, y1=0.2, x0_pt=50, y0_pt=50, x1_pt=150, y1_pt=100), "Item"),
        (BoundingBox(x0=0.4, y0=0.1, x1=0.6, y1=0.2, x0_pt=200, y0_pt=50, x1_pt=300, y1_pt=100), "Qty"),
        (BoundingBox(x0=0.7, y0=0.1, x1=0.9, y1=0.2, x0_pt=350, y0_pt=50, x1_pt=450, y1_pt=100), "Total"),
        (BoundingBox(x0=0.1, y0=0.3, x1=0.3, y1=0.4, x0_pt=50, y0_pt=150, x1_pt=150, y1_pt=200), "Widget"),
        (BoundingBox(x0=0.4, y0=0.3, x1=0.6, y1=0.4, x0_pt=200, y0_pt=150, x1_pt=300, y1_pt=200), "5"),
        (BoundingBox(x0=0.7, y0=0.3, x1=0.9, y1=0.4, x0_pt=350, y0_pt=150, x1_pt=450, y1_pt=200), "$100.00"),
    ]
    gt_table = extractor.extract_table_region(items_gt)

    # Erroneous prediction: Qty and Total values are horizontally swapped
    items_pred_swapped = [
        (BoundingBox(x0=0.1, y0=0.1, x1=0.3, y1=0.2, x0_pt=50, y0_pt=50, x1_pt=150, y1_pt=100), "Item"),
        (BoundingBox(x0=0.4, y0=0.1, x1=0.6, y1=0.2, x0_pt=200, y0_pt=50, x1_pt=300, y1_pt=100), "Qty"),
        (BoundingBox(x0=0.7, y0=0.1, x1=0.9, y1=0.2, x0_pt=350, y0_pt=50, x1_pt=450, y1_pt=100), "Total"),
        (BoundingBox(x0=0.1, y0=0.3, x1=0.3, y1=0.4, x0_pt=50, y0_pt=150, x1_pt=150, y1_pt=200), "Widget"),
        (BoundingBox(x0=0.4, y0=0.3, x1=0.6, y1=0.4, x0_pt=200, y0_pt=150, x1_pt=300, y1_pt=200), "$100.00"),
        (BoundingBox(x0=0.7, y0=0.3, x1=0.9, y1=0.4, x0_pt=350, y0_pt=150, x1_pt=450, y1_pt=200), "5"),
    ]
    pred_swapped_table = extractor.extract_table_region(items_pred_swapped)
    metrics_swapped = evaluate_table_structure(pred_swapped_table, gt_table)

    # Content association accuracy is strictly penalized (4/6 = 0.6667)
    assert metrics_swapped["content_association"]["accuracy"] == pytest.approx(0.6667, abs=1e-3)
    assert metrics_swapped["content_association"]["matched_cells"] == 4
    assert metrics_swapped["content_association"]["total_cells"] == 6
    assert metrics_swapped["composite_table_structure_f1"] < 0.85
