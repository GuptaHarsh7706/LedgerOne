"""
Table Geometry and Bounding Box Utilities for LedgerOne.
Phase 4 Step 4 Wave 2 Implementation.

Provides coordinate space transformations, spatial intersection metrics (IoU, IoA),
zero-area box validation, rotation correction, and the augmented Hungarian/Kuhn-Munkres
assignment solver with finite sentinel K for bipartite evaluation.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

import numpy as np
from scipy.optimize import linear_sum_assignment


class HungarianInputValidationError(ValueError):
    """Raised when bounding box inputs violate mathematical solver preconditions."""
    pass


# ---------------------------------------------------------------------------
# Fundamental Geometry Utilities
# ---------------------------------------------------------------------------

def compute_box_area(box: Union[np.ndarray, Sequence[float]]) -> float:
    """
    Compute area of a bounding box (x0, y0, x1, y1).
    Raises HungarianInputValidationError if box is degenerate (x0 >= x1 or y0 >= y1).
    """
    x0, y0, x1, y1 = float(box[0]), float(box[1]), float(box[2]), float(box[3])
    w = x1 - x0
    h = y1 - y0
    if w <= 0.0 or h <= 0.0:
        return 0.0
    return w * h


def compute_iou(
    box1: Union[np.ndarray, Sequence[float]],
    box2: Union[np.ndarray, Sequence[float]],
) -> float:
    """
    Calculate Intersection over Union (IoU) of two bounding boxes (x0, y0, x1, y1).
    Returns float in range [0.0, 1.0].
    """
    x0_a, y0_a, x1_a, y1_a = float(box1[0]), float(box1[1]), float(box1[2]), float(box1[3])
    x0_b, y0_b, x1_b, y1_b = float(box2[0]), float(box2[1]), float(box2[2]), float(box2[3])

    # Compute intersection rectangle
    ix0 = max(x0_a, x0_b)
    iy0 = max(y0_a, y0_b)
    ix1 = min(x1_a, x1_b)
    iy1 = min(y1_a, y1_b)

    iw = max(0.0, ix1 - ix0)
    ih = max(0.0, iy1 - iy0)
    intersection_area = iw * ih

    if intersection_area <= 0.0:
        return 0.0

    area_a = max(0.0, (x1_a - x0_a) * (y1_a - y0_a))
    area_b = max(0.0, (x1_b - x0_b) * (y1_b - y0_b))
    union_area = area_a + area_b - intersection_area

    if union_area <= 0.0:
        return 0.0

    iou = intersection_area / union_area
    return float(np.clip(iou, 0.0, 1.0))


def compute_ioa(
    box_inner: Union[np.ndarray, Sequence[float]],
    box_outer: Union[np.ndarray, Sequence[float]],
) -> float:
    """
    Calculate Intersection over Area (IoA) with respect to box_inner.
    Measures the degree to which box_inner is contained within box_outer.
    Returns float in range [0.0, 1.0].
    """
    x0_a, y0_a, x1_a, y1_a = float(box_inner[0]), float(box_inner[1]), float(box_inner[2]), float(box_inner[3])
    x0_b, y0_b, x1_b, y1_b = float(box_outer[0]), float(box_outer[1]), float(box_outer[2]), float(box_outer[3])

    ix0 = max(x0_a, x0_b)
    iy0 = max(y0_a, y0_b)
    ix1 = min(x1_a, x1_b)
    iy1 = min(y1_a, y1_b)

    iw = max(0.0, ix1 - ix0)
    ih = max(0.0, iy1 - iy0)
    intersection_area = iw * ih

    area_inner = max(0.0, (x1_a - x0_a) * (y1_a - y0_a))
    if area_inner <= 0.0:
        return 0.0

    ioa = intersection_area / area_inner
    return float(np.clip(ioa, 0.0, 1.0))


def compute_center_distance(
    box1: Union[np.ndarray, Sequence[float]],
    box2: Union[np.ndarray, Sequence[float]],
) -> float:
    """
    Euclidean distance between bounding box centers.
    """
    c1_x = (float(box1[0]) + float(box1[2])) / 2.0
    c1_y = (float(box1[1]) + float(box1[3])) / 2.0
    c2_x = (float(box2[0]) + float(box2[2])) / 2.0
    c2_y = (float(box2[1]) + float(box2[3])) / 2.0

    return float(math.sqrt((c1_x - c2_x) ** 2 + (c1_y - c2_y) ** 2))


def union_boxes(boxes: Sequence[Union[np.ndarray, Sequence[float]]]) -> Tuple[float, float, float, float]:
    """
    Compute minimal enclosing bounding box covering all given boxes.
    """
    if not boxes:
        raise ValueError("Cannot compute union of empty box sequence")
    x0 = min(float(b[0]) for b in boxes)
    y0 = min(float(b[1]) for b in boxes)
    x1 = max(float(b[2]) for b in boxes)
    y1 = max(float(b[3]) for b in boxes)
    return (x0, y0, x1, y1)


def derotate_box(
    box: Sequence[float],
    angle_deg: float,
    origin: Tuple[float, float] = (0.0, 0.0),
) -> Tuple[float, float, float, float]:
    """
    Deskew / derotate bounding box around an origin by angle_deg.
    Returns the axis-aligned bounding box enclosing the 4 rotated vertices.
    """
    if abs(angle_deg) < 1e-4:
        return (float(box[0]), float(box[1]), float(box[2]), float(box[3]))

    rad = math.radians(-angle_deg)
    cos_a = math.cos(rad)
    sin_a = math.sin(rad)
    ox, oy = origin

    x0, y0, x1, y1 = float(box[0]), float(box[1]), float(box[2]), float(box[3])
    vertices = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]

    rot_x = []
    rot_y = []
    for vx, vy in vertices:
        tx = vx - ox
        ty = vy - oy
        rx = ox + tx * cos_a - ty * sin_a
        ry = oy + tx * sin_a + ty * cos_a
        rot_x.append(rx)
        rot_y.append(ry)

    return (min(rot_x), min(rot_y), max(rot_x), max(rot_y))


# ---------------------------------------------------------------------------
# Hungarian Preconditions and Augmented Cost Matrix
# ---------------------------------------------------------------------------

def validate_hungarian_preconditions(
    pred_boxes: np.ndarray,
    gt_boxes: np.ndarray,
    page_width: float,
    page_height: float,
) -> None:
    """
    Executable precondition gate enforcing solver input integrity.
    Specification Section 5.2.
    """
    # 1. Type and Shape Validation
    if not isinstance(pred_boxes, np.ndarray) or not isinstance(gt_boxes, np.ndarray):
        raise HungarianInputValidationError("E_SOLVER_INVALID_TYPE: Inputs must be numpy ndarrays.")

    if (pred_boxes.ndim != 2 or pred_boxes.shape[1] != 4) and pred_boxes.size > 0:
        raise HungarianInputValidationError(f"E_SOLVER_INVALID_SHAPE: pred_boxes must be (N, 4), got {pred_boxes.shape}")

    if (gt_boxes.ndim != 2 or gt_boxes.shape[1] != 4) and gt_boxes.size > 0:
        raise HungarianInputValidationError(f"E_SOLVER_INVALID_SHAPE: gt_boxes must be (M, 4), got {gt_boxes.shape}")

    # 2. Strict Float64 & Non-NaN/Inf Checking
    if pred_boxes.size > 0:
        if not np.all(np.isfinite(pred_boxes)):
            raise HungarianInputValidationError("E_SOLVER_NON_FINITE: pred_boxes contains NaN or Inf.")
    if gt_boxes.size > 0:
        if not np.all(np.isfinite(gt_boxes)):
            raise HungarianInputValidationError("E_SOLVER_NON_FINITE: gt_boxes contains NaN or Inf.")

    # 3. Coordinate Geometry Range Validation: [0, page_dim] and x0 < x1, y0 < y1
    diag = np.sqrt(page_width**2 + page_height**2)
    if diag <= 0.0 or not np.isfinite(diag):
        raise HungarianInputValidationError("E_SOLVER_INVALID_PAGE_DIMENSIONS: Page dimensions must be positive finite.")

    for name, boxes in [("pred_boxes", pred_boxes), ("gt_boxes", gt_boxes)]:
        if boxes.size == 0:
            continue
        x0, y0, x1, y1 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
        if np.any(x0 < 0.0) or np.any(y0 < 0.0):
            raise HungarianInputValidationError(f"E_SOLVER_NEGATIVE_COORDINATES: {name} contains coordinates < 0.0")
        if np.any(x1 > page_width + 1e-3) or np.any(y1 > page_height + 1e-3):
            raise HungarianInputValidationError(f"E_SOLVER_OUT_OF_BOUNDS: {name} exceeds page boundaries.")
        if np.any(x0 >= x1) or np.any(y0 >= y1):
            raise HungarianInputValidationError(f"E_SOLVER_DEGENERATE_BOX: {name} contains inverted/degenerate box (x0>=x1 or y0>=y1).")


def build_augmented_cost_matrix(
    pred_boxes: np.ndarray,
    gt_boxes: np.ndarray,
    page_width: float,
    page_height: float,
) -> Tuple[np.ndarray, float]:
    """
    Constructs the augmented square cost matrix with finite sentinel K.
    Specification Section 5.1 & 5.2.
    """
    validate_hungarian_preconditions(pred_boxes, gt_boxes, page_width, page_height)

    N = len(pred_boxes)
    M = len(gt_boxes)
    L = N + M
    K_sentinel = float(L + 10.0)
    diag = float(np.sqrt(page_width**2 + page_height**2))

    if L == 0:
        return np.zeros((0, 0), dtype=np.float64), K_sentinel

    C = np.full((L, L), K_sentinel, dtype=np.float64)

    # Real-to-Real Block (N x M)
    for i in range(N):
        for j in range(M):
            iou = compute_iou(pred_boxes[i], gt_boxes[j])
            if not (0.0 <= iou <= 1.0):
                raise HungarianInputValidationError(f"E_SOLVER_INVALID_IOU: Calculated IoU {iou} outside [0.0, 1.0]")
            if iou >= 0.50:
                d_c = compute_center_distance(pred_boxes[i], gt_boxes[j])
                norm_d = d_c / diag
                if not (0.0 <= norm_d <= 1.0):
                    raise HungarianInputValidationError(f"E_SOLVER_INVALID_DISTANCE: Normalized distance {norm_d} outside [0.0, 1.0]")
                cost = (1.0 - iou) + 0.10 * norm_d
                assert 0.0 <= cost <= 0.60, f"Cost invariant violated: {cost}"
                C[i, j] = cost

    # Prediction-to-Dummy Diagonal (N x N)
    for i in range(N):
        C[i, M + i] = 1.0

    # Dummy-to-GT Diagonal (M x M)
    for j in range(M):
        C[N + j, j] = 1.0

    # Dummy-to-Dummy Block (M x N)
    C[N:, M:] = 0.0

    assert np.all(np.isfinite(C)), "Cost matrix contains non-finite entries prior to solver"
    return C, K_sentinel


def solve_hungarian_matching(
    pred_boxes: np.ndarray,
    gt_boxes: np.ndarray,
    page_width: float,
    page_height: float,
    iou_threshold: float = 0.50,
) -> Dict[str, Any]:
    """
    Solve bipartite matching between predicted and ground-truth bounding boxes
    using the augmented Hungarian cost matrix.
    
    Returns:
    - matched_pairs: List of dicts (pred_idx, gt_idx, iou, cost)
    - unmatched_pred_indices: List of pred_idx
    - unmatched_gt_indices: List of gt_idx
    - true_positives, false_positives, false_negatives
    - precision, recall, f1_score
    - is_blank_page: True if N=0, M=0
    """
    N = len(pred_boxes)
    M = len(gt_boxes)

    # Empty Page (Blank Page True Negative)
    if N == 0 and M == 0:
        return {
            "matched_pairs": [],
            "unmatched_pred_indices": [],
            "unmatched_gt_indices": [],
            "true_positives": 0,
            "false_positives": 0,
            "false_negatives": 0,
            "precision": 1.0,
            "recall": 1.0,
            "f1_score": 1.0,
            "is_blank_page": True,
            "sentinel_k": 10.0,
        }

    C, K_sentinel = build_augmented_cost_matrix(pred_boxes, gt_boxes, page_width, page_height)
    row_ind, col_ind = linear_sum_assignment(C)

    matched_pairs: List[Dict[str, Any]] = []
    matched_preds = set()
    matched_gts = set()

    for r, c in zip(row_ind, col_ind):
        # A valid real-to-real match occurs only when r < N, c < M, and cost < K_sentinel
        if r < N and c < M and C[r, c] < K_sentinel:
            iou = compute_iou(pred_boxes[r], gt_boxes[c])
            if iou >= iou_threshold:
                matched_pairs.append({
                    "pred_idx": int(r),
                    "gt_idx": int(c),
                    "iou": float(iou),
                    "cost": float(C[r, c]),
                })
                matched_preds.add(r)
                matched_gts.add(c)

    unmatched_preds = [i for i in range(N) if i not in matched_preds]
    unmatched_gts = [j for j in range(M) if j not in matched_gts]

    tp = len(matched_pairs)
    fp = len(unmatched_preds)
    fn = len(unmatched_gts)

    precision = tp / (tp + fp) if (tp + fp) > 0 else (1.0 if N == 0 and M == 0 else 0.0)
    recall = tp / (tp + fn) if (tp + fn) > 0 else (1.0 if N == 0 and M == 0 else 0.0)
    f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

    return {
        "matched_pairs": matched_pairs,
        "unmatched_pred_indices": unmatched_preds,
        "unmatched_gt_indices": unmatched_gts,
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
        "precision": float(precision),
        "recall": float(recall),
        "f1_score": float(f1),
        "is_blank_page": False,
        "sentinel_k": K_sentinel,
    }
