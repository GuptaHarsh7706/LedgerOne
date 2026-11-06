"""
Tests for Table Geometry and Augmented Hungarian Solver (Phase 4 Step 4 Wave 2).
Validates bounding box geometry, deskewing, precondition input gates,
finite sentinel K bounds, and bipartite matching with native invalid-match rejection.
"""
import math
import numpy as np
import pytest

from src.intelligence.table_geometry import (
    HungarianInputValidationError,
    build_augmented_cost_matrix,
    compute_box_area,
    compute_center_distance,
    compute_ioa,
    compute_iou,
    derotate_box,
    solve_hungarian_matching,
    union_boxes,
    validate_hungarian_preconditions,
)


# ---------------------------------------------------------------------------
# Basic Geometry Utilities
# ---------------------------------------------------------------------------

def test_compute_box_area():
    """Area calculation and degenerate box handling."""
    box = (10.0, 20.0, 110.0, 70.0)  # w=100, h=50 -> 5000
    assert compute_box_area(box) == 5000.0

    # Inverted or flat box returns 0.0
    assert compute_box_area((10.0, 20.0, 10.0, 70.0)) == 0.0
    assert compute_box_area((10.0, 20.0, 5.0, 70.0)) == 0.0


def test_compute_iou():
    """Intersection over Union for overlapping, disjoint, and identical boxes."""
    # Identical boxes -> IoU = 1.0
    b1 = (0.0, 0.0, 10.0, 10.0)
    assert pytest.approx(compute_iou(b1, b1)) == 1.0

    # Disjoint boxes -> IoU = 0.0
    b2 = (20.0, 20.0, 30.0, 30.0)
    assert compute_iou(b1, b2) == 0.0

    # Half overlap: box1 (0,0,10,10) [area 100], box3 (5,0,15,10) [area 100]
    # intersection: (5,0,10,10) [area 50], union: 150 -> IoU = 50/150 = 1/3
    b3 = (5.0, 0.0, 15.0, 10.0)
    assert pytest.approx(compute_iou(b1, b3)) == 1.0 / 3.0


def test_compute_ioa():
    """Intersection over Area measures containment of inner within outer."""
    inner = (2.0, 2.0, 8.0, 8.0)  # area 36
    outer = (0.0, 0.0, 10.0, 10.0) # area 100
    # inner completely inside outer -> IoA = 1.0
    assert pytest.approx(compute_ioa(inner, outer)) == 1.0

    # Half contained
    half = (5.0, 2.0, 15.0, 8.0) # w=10, h=6 -> area 60; overlap (5,2,10,8) w=5, h=6 -> area 30
    assert pytest.approx(compute_ioa(half, outer)) == 0.5


def test_compute_center_distance():
    """Euclidean distance between bounding box centers."""
    b1 = (0.0, 0.0, 10.0, 10.0)   # center (5, 5)
    b2 = (30.0, 45.0, 50.0, 65.0) # center (40, 55)
    # dx = 35, dy = 50 -> dist = sqrt(35^2 + 50^2) = sqrt(1225 + 2500) = sqrt(3725)
    expected = math.sqrt((40 - 5)**2 + (55 - 5)**2)
    assert pytest.approx(compute_center_distance(b1, b2)) == expected


def test_union_boxes():
    """Bounding box envelope enclosing multiple boxes."""
    boxes = [
        (10.0, 20.0, 50.0, 60.0),
        (5.0, 30.0, 80.0, 40.0),
        (15.0, 10.0, 25.0, 90.0),
    ]
    u = union_boxes(boxes)
    assert u == (5.0, 10.0, 80.0, 90.0)


def test_derotate_box():
    """Rotating an axis-aligned box around origin."""
    box = (10.0, 10.0, 20.0, 20.0)
    # 0 degree rotation produces identical box
    assert derotate_box(box, 0.0) == box

    # 90 degree rotation
    rot = derotate_box(box, 90.0, origin=(0.0, 0.0))
    assert len(rot) == 4


# ---------------------------------------------------------------------------
# Precondition Validation Contract (Spec Section 5.2 & 5.3)
# ---------------------------------------------------------------------------

def test_solver_contract_rejects_nan():
    """Providing pred_boxes containing np.nan raises HungarianInputValidationError."""
    pred = np.array([[10.0, np.nan, 50.0, 60.0]], dtype=np.float64)
    gt = np.array([[10.0, 20.0, 50.0, 60.0]], dtype=np.float64)
    with pytest.raises(HungarianInputValidationError) as exc:
        validate_hungarian_preconditions(pred, gt, 612.0, 792.0)
    assert "E_SOLVER_NON_FINITE" in str(exc.value)


def test_solver_contract_rejects_inf():
    """Providing gt_boxes containing np.inf raises HungarianInputValidationError."""
    pred = np.array([[10.0, 20.0, 50.0, 60.0]], dtype=np.float64)
    gt = np.array([[10.0, 20.0, np.inf, 60.0]], dtype=np.float64)
    with pytest.raises(HungarianInputValidationError) as exc:
        validate_hungarian_preconditions(pred, gt, 612.0, 792.0)
    assert "E_SOLVER_NON_FINITE" in str(exc.value)


def test_solver_contract_rejects_inverted_box():
    """Inverted box (x0 >= x1 or y0 >= y1) raises E_SOLVER_DEGENERATE_BOX."""
    pred = np.array([[100.0, 20.0, 50.0, 60.0]], dtype=np.float64)  # x0 > x1
    gt = np.array([[10.0, 20.0, 50.0, 60.0]], dtype=np.float64)
    with pytest.raises(HungarianInputValidationError) as exc:
        validate_hungarian_preconditions(pred, gt, 612.0, 792.0)
    assert "E_SOLVER_DEGENERATE_BOX" in str(exc.value)


def test_solver_contract_rejects_out_of_bounds():
    """Box exceeding page boundaries raises E_SOLVER_OUT_OF_BOUNDS."""
    pred = np.array([[10.0, 20.0, 1500.0, 60.0]], dtype=np.float64)  # exceeds width 800
    gt = np.array([[10.0, 20.0, 50.0, 60.0]], dtype=np.float64)
    with pytest.raises(HungarianInputValidationError) as exc:
        validate_hungarian_preconditions(pred, gt, 800.0, 1000.0)
    assert "E_SOLVER_OUT_OF_BOUNDS" in str(exc.value)


def test_solver_contract_rejects_negative_coords():
    """Negative coordinates raise E_SOLVER_NEGATIVE_COORDINATES."""
    pred = np.array([[-5.0, 20.0, 50.0, 60.0]], dtype=np.float64)
    gt = np.array([[10.0, 20.0, 50.0, 60.0]], dtype=np.float64)
    with pytest.raises(HungarianInputValidationError) as exc:
        validate_hungarian_preconditions(pred, gt, 612.0, 792.0)
    assert "E_SOLVER_NEGATIVE_COORDINATES" in str(exc.value)


def test_solver_contract_rejects_invalid_type_and_shape():
    """Non-ndarray and incorrect shapes raise validation errors."""
    with pytest.raises(HungarianInputValidationError) as exc:
        validate_hungarian_preconditions([[10, 20, 30, 40]], np.array([]), 612.0, 792.0)  # type: ignore
    assert "E_SOLVER_INVALID_TYPE" in str(exc.value)

    with pytest.raises(HungarianInputValidationError) as exc:
        validate_hungarian_preconditions(np.zeros((3, 5)), np.zeros((3, 4)), 612.0, 792.0)
    assert "E_SOLVER_INVALID_SHAPE" in str(exc.value)


# ---------------------------------------------------------------------------
# Augmented Cost Matrix & Hungarian Solver Execution
# ---------------------------------------------------------------------------

def test_augmented_cost_matrix_structure_and_sentinel():
    """
    Cost matrix dimension is (N+M) x (N+M).
    Sentinel K = (N + M) + 10.0.
    """
    pred = np.array([[10.0, 10.0, 50.0, 50.0]], dtype=np.float64) # N=1
    gt = np.array([[10.0, 10.0, 50.0, 50.0], [60.0, 60.0, 90.0, 90.0]], dtype=np.float64) # M=2
    # L = 1 + 2 = 3
    C, K_sentinel = build_augmented_cost_matrix(pred, gt, 612.0, 792.0)
    assert C.shape == (3, 3)
    assert K_sentinel == 13.0

    # Pred 0 to GT 0 has IoU=1.0 -> cost = (1-1) + 0.1*(0) = 0.0
    assert pytest.approx(C[0, 0]) == 0.0

    # Pred 0 to GT 1 has IoU=0.0 (< 0.50) -> sentinel K
    assert C[0, 1] == K_sentinel

    # Pred-to-Dummy diagonal C[0, 2] == 1.0 (since M=2, dummy starts at col 2)
    assert C[0, 2] == 1.0

    # Dummy-to-GT diagonal C[1+j, j] == 1.0
    assert C[1, 0] == 1.0
    assert C[2, 1] == 1.0

    # Dummy-to-Dummy block C[1:, 2:] == 0.0
    assert np.all(C[1:, 2:] == 0.0)


def test_solver_contract_empty_dimensions():
    """
    Spec Section 5.3 #5:
    N=0, M=0 evaluates without error, yielding Precision=1.0, Recall=1.0 at page level.
    """
    pred = np.zeros((0, 4), dtype=np.float64)
    gt = np.zeros((0, 4), dtype=np.float64)

    res = solve_hungarian_matching(pred, gt, 612.0, 792.0)
    assert res["is_blank_page"] is True
    assert res["true_positives"] == 0
    assert res["false_positives"] == 0
    assert res["false_negatives"] == 0
    assert res["precision"] == 1.0
    assert res["recall"] == 1.0
    assert res["f1_score"] == 1.0


def test_solver_contract_native_rejection_low_iou():
    """
    Spec Section 5.3 #6:
    With sentinel K, an input pair with IoU = 0.35 (< 0.50) deterministically
    outputs (unmatched, unmatched) with 0 TP, 1 FP, 1 FN.
    """
    # Box 1: (0, 0, 100, 100), Box 2: (50, 0, 150, 100) -> IoU = 5000 / 15000 = 0.333 (< 0.50)
    pred = np.array([[0.0, 0.0, 100.0, 100.0]], dtype=np.float64)
    gt = np.array([[50.0, 0.0, 150.0, 100.0]], dtype=np.float64)

    res = solve_hungarian_matching(pred, gt, 612.0, 792.0, iou_threshold=0.50)
    assert len(res["matched_pairs"]) == 0
    assert res["true_positives"] == 0
    assert res["false_positives"] == 1
    assert res["false_negatives"] == 1
    assert res["precision"] == 0.0
    assert res["recall"] == 0.0
    assert res["unmatched_pred_indices"] == [0]
    assert res["unmatched_gt_indices"] == [0]


def test_solver_contract_high_iou_matching():
    """High IoU boxes are matched with optimal Kuhn-Munkres cost."""
    pred = np.array([
        [10.0, 10.0, 50.0, 50.0],
        [100.0, 100.0, 150.0, 150.0],
    ], dtype=np.float64)
    gt = np.array([
        [12.0, 11.0, 51.0, 49.0], # Matches pred 0
        [102.0, 98.0, 151.0, 152.0], # Matches pred 1
    ], dtype=np.float64)

    res = solve_hungarian_matching(pred, gt, 612.0, 792.0, iou_threshold=0.50)
    assert res["true_positives"] == 2
    assert res["false_positives"] == 0
    assert res["false_negatives"] == 0
    assert res["precision"] == 1.0
    assert res["recall"] == 1.0
    assert len(res["matched_pairs"]) == 2
