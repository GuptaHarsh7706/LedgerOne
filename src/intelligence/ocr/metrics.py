"""
Evaluation Metrics for OCR Benchmarks: CER, WER, Detection IoU, and Reading Order Accuracy.
"""
from __future__ import annotations

from typing import List, Sequence, Tuple, Dict, Any, Optional
import numpy as np
from scipy.optimize import linear_sum_assignment
from src.intelligence.models import BoundingBox


def levenshtein_distance(s1: Sequence, s2: Sequence) -> int:
    """
    Calculate Levenshtein edit distance between two sequences (chars or words)
    using O(min(N, M)) memory dynamic programming.
    """
    if len(s1) < len(s2):
        s1, s2 = s2, s1
    if len(s2) == 0:
        return len(s1)

    previous_row = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        current_row = [i + 1] * (len(s2) + 1)
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (0 if c1 == c2 else 1)
            current_row[j + 1] = min(insertions, deletions, substitutions)
        previous_row = current_row

    return previous_row[-1]


def calculate_cer(reference: str, hypothesis: str) -> float:
    """
    Character Error Rate (CER):
        CER = Levenshtein(reference, hypothesis) / max(1, len(reference))
    """
    ref_clean = reference.strip()
    hyp_clean = hypothesis.strip()
    if not ref_clean and not hyp_clean:
        return 0.0
    if not ref_clean:
        return 1.0
    dist = levenshtein_distance(ref_clean, hyp_clean)
    return round(float(dist / len(ref_clean)), 4)


def calculate_wer(reference: str, hypothesis: str) -> float:
    """
    Word Error Rate (WER):
        WER = LevenshteinWords(reference_words, hypothesis_words) / max(1, len(reference_words))
    """
    ref_words = reference.strip().split()
    hyp_words = hypothesis.strip().split()
    if not ref_words and not hyp_words:
        return 0.0
    if not ref_words:
        return 1.0
    dist = levenshtein_distance(ref_words, hyp_words)
    return round(float(dist / len(ref_words)), 4)


def calculate_box_iou(box_a: BoundingBox, box_b: BoundingBox) -> float:
    """
    Calculate Intersection over Union (IoU) of two bounding boxes in normalized coordinates.
    """
    inter_x0 = max(box_a.x0, box_b.x0)
    inter_y0 = max(box_a.y0, box_b.y0)
    inter_x1 = min(box_a.x1, box_b.x1)
    inter_y1 = min(box_a.y1, box_b.y1)

    if inter_x1 <= inter_x0 or inter_y1 <= inter_y0:
        return 0.0

    inter_area = (inter_x1 - inter_x0) * (inter_y1 - inter_y0)
    union_area = box_a.area + box_b.area - inter_area
    if union_area <= 0:
        return 0.0

    return inter_area / union_area


def evaluate_detection_precision_recall(
    predicted_boxes: List[BoundingBox],
    ground_truth_boxes: List[BoundingBox],
    iou_threshold: float = 0.40,
) -> Tuple[float, float, float]:
    """
    Evaluate bounding box text line detection quality against ground truth.
    Returns (precision, recall, f1).
    """
    if not ground_truth_boxes and not predicted_boxes:
        return 1.0, 1.0, 1.0
    if not ground_truth_boxes:
        return 0.0, 1.0, 0.0
    if not predicted_boxes:
        return 1.0, 0.0, 0.0

    matched_gt = set()
    true_positives = 0

    for pred in predicted_boxes:
        best_iou = 0.0
        best_gt_idx = -1
        for gt_idx, gt in enumerate(ground_truth_boxes):
            if gt_idx in matched_gt:
                continue
            iou = calculate_box_iou(pred, gt)
            if iou > best_iou:
                best_iou = iou
                best_gt_idx = gt_idx

        if best_iou >= iou_threshold and best_gt_idx != -1:
            true_positives += 1
            matched_gt.add(best_gt_idx)

    precision = true_positives / len(predicted_boxes)
    recall = true_positives / len(ground_truth_boxes)
    f1 = (2.0 * precision * recall) / max(1e-6, precision + recall) if (precision + recall) > 0 else 0.0

    return round(precision, 4), round(recall, 4), round(f1, 4)


def calculate_reading_order_accuracy(
    predicted_text_lines: List[str],
    ground_truth_lines: List[str],
) -> float:
    """
    Measure pairwise relative ordering accuracy (concordant pairs ratio).
    Matches predicted lines to closest ground-truth line via Levenshtein alignment.
    """
    res = calculate_reading_order_detailed(predicted_text_lines, ground_truth_lines)
    return res["concordance_ratio"]


def calculate_reading_order_detailed(
    predicted_text_lines: Any,
    ground_truth_lines: Any,
    max_norm_dist: float = 0.40,
    iou_threshold: float = 0.40,
    is_table_mask: Optional[List[bool]] = None,
) -> dict:
    """
    Measure pairwise relative reading-order concordance using strict one-to-one
    bipartite matching (Hungarian algorithm via scipy.optimize.linear_sum_assignment).
    
    Guarantees:
    - Bipartite Matching: Each predicted line matches at most ONE reference line,
      and each reference line matches at most ONE predicted line.
    - Low-Overlap Handling: Assignments with distance > max_norm_dist (0.40) or
      spatial IoU < iou_threshold (0.40) are strictly rejected and counted as unmatched.
    - Strict Concordance as Principal Metric: Evaluates concordant pairs against
      the total possible reference pairs K_ref = N*(N-1)/2, strictly penalizing dropped lines.
    - Full Metric Parity: Reports alignment precision, recall, unmatched predictions,
      unmatched references, matched pairs, reference pairs, matched/strict concordance,
      and non-table body-text numerator/denominator.
    """
    # Normalize input representations: string or (BoundingBox, str) or BoundingBox
    pred_items = list(predicted_text_lines)
    gt_items = list(ground_truth_lines)
    m = len(pred_items)
    n = len(gt_items)
    total_ref_pairs = n * (n - 1) // 2

    empty_res = {
        "concordant_pairs": 0,
        "discordant_pairs": 0,
        "total_annotated_pairs": 0,
        "total_reference_pairs": total_ref_pairs,
        "concordance_ratio": 1.0 if n <= 1 else 0.0,
        "strict_concordance_ratio": 1.0 if n <= 1 else 0.0,
        "alignment_precision": 0.0,
        "alignment_recall": 0.0,
        "matched_lines": 0,
        "total_predicted": m,
        "total_reference": n,
        "unmatched_predictions": list(range(m)),
        "unmatched_references": list(range(n)),
        "non_table_body": {
            "concordant_pairs": 0,
            "total_reference_pairs": 0,
            "strict_concordance_ratio": 1.0,
        },
    }

    if m == 0 or n == 0:
        return empty_res

    # Detect if inputs are bounding boxes or strings
    is_bbox_matching = False
    if m > 0 and n > 0:
        p0 = pred_items[0]
        g0 = gt_items[0]
        if hasattr(p0, "x0") or (isinstance(p0, (tuple, list)) and hasattr(p0[0], "x0")):
            is_bbox_matching = True

    # Construct cost matrix for Hungarian bipartite matching
    cost_matrix = np.full((m, n), 1e6, dtype=np.float64)

    if is_bbox_matching:
        for i, p in enumerate(pred_items):
            box_p = p[0] if isinstance(p, (tuple, list)) else p
            for j, gt in enumerate(gt_items):
                box_gt = gt[0] if isinstance(gt, (tuple, list)) else gt
                iou = calculate_box_iou(box_p, box_gt)
                if iou >= iou_threshold:
                    cost_matrix[i, j] = 1.0 - iou
    else:
        for i, p in enumerate(pred_items):
            p_str = p[1] if isinstance(p, (tuple, list)) else str(p)
            p_clean = p_str.strip().lower()
            if not p_clean:
                continue
            for j, gt in enumerate(gt_items):
                gt_str = gt[1] if isinstance(gt, (tuple, list)) else str(gt)
                gt_clean = gt_str.strip().lower()
                dist = levenshtein_distance(p_clean, gt_clean)
                norm_dist = dist / max(1, len(gt_clean))
                if norm_dist <= max_norm_dist:
                    cost_matrix[i, j] = norm_dist

    # Optimal global linear sum assignment
    row_ind, col_ind = linear_sum_assignment(cost_matrix)

    # Filter assignments exceeding distance or IoU thresholds
    pred_to_ref: Dict[int, int] = {}
    ref_to_pred: Dict[int, int] = {}
    for r, c in zip(row_ind, col_ind):
        if is_bbox_matching:
            if cost_matrix[r, c] <= (1.0 - iou_threshold):
                pred_to_ref[int(r)] = int(c)
                ref_to_pred[int(c)] = int(r)
        else:
            if cost_matrix[r, c] <= max_norm_dist:
                pred_to_ref[int(r)] = int(c)
                ref_to_pred[int(c)] = int(r)

    matched_count = len(pred_to_ref)
    unmatched_preds = [i for i in range(m) if i not in pred_to_ref]
    unmatched_refs = [j for j in range(n) if j not in ref_to_pred]

    align_prec = matched_count / max(1, m)
    align_rec = matched_count / max(1, n)

    if matched_count <= 1:
        return {
            "concordant_pairs": 0,
            "discordant_pairs": 0,
            "total_annotated_pairs": total_ref_pairs if n <= 1 else 0,
            "total_reference_pairs": total_ref_pairs,
            "concordance_ratio": 1.0 if matched_count == 1 and n == 1 else 0.0,
            "strict_concordance_ratio": 1.0 if matched_count == 1 and n == 1 else 0.0,
            "alignment_precision": round(float(align_prec), 4),
            "alignment_recall": round(float(align_rec), 4),
            "matched_lines": matched_count,
            "total_predicted": m,
            "total_reference": n,
            "unmatched_predictions": unmatched_preds,
            "unmatched_references": unmatched_refs,
            "non_table_body": {
                "concordant_pairs": 0,
                "total_reference_pairs": 0,
                "strict_concordance_ratio": 1.0,
            },
        }

    # Evaluate pairwise concordance over matched reference lines
    matched_ref_indices = sorted(ref_to_pred.keys())
    concordant = 0
    discordant = 0
    evaluated_pairs = 0

    for idx_a in range(len(matched_ref_indices)):
        for idx_b in range(idx_a + 1, len(matched_ref_indices)):
            j1 = matched_ref_indices[idx_a]
            j2 = matched_ref_indices[idx_b]
            i1 = ref_to_pred[j1]
            i2 = ref_to_pred[j2]
            evaluated_pairs += 1
            if i1 < i2:
                concordant += 1
            else:
                discordant += 1

    ratio = round(float(concordant / max(1, evaluated_pairs)), 4)
    strict_ratio = round(float(concordant / max(1, total_ref_pairs)), 4)

    # Separate non-table body text concordance if mask provided
    non_table_res = {
        "concordant_pairs": concordant,
        "total_reference_pairs": total_ref_pairs,
        "strict_concordance_ratio": strict_ratio,
    }
    if is_table_mask and len(is_table_mask) == n:
        non_table_refs = [j for j in matched_ref_indices if not is_table_mask[j]]
        nt_ref_total = sum(1 for j in range(n) if not is_table_mask[j])
        nt_ref_pairs = nt_ref_total * (nt_ref_total - 1) // 2
        nt_concordant = 0
        for idx_a in range(len(non_table_refs)):
            for idx_b in range(idx_a + 1, len(non_table_refs)):
                j1 = non_table_refs[idx_a]
                j2 = non_table_refs[idx_b]
                if ref_to_pred[j1] < ref_to_pred[j2]:
                    nt_concordant += 1
        non_table_res = {
            "concordant_pairs": nt_concordant,
            "total_reference_pairs": nt_ref_pairs,
            "strict_concordance_ratio": round(float(nt_concordant / max(1, nt_ref_pairs)), 4) if nt_ref_pairs > 0 else 1.0,
        }

    return {
        "concordant_pairs": concordant,
        "discordant_pairs": discordant,
        "total_annotated_pairs": evaluated_pairs,
        "total_reference_pairs": total_ref_pairs,
        "concordance_ratio": ratio,
        "strict_concordance_ratio": strict_ratio,
        "alignment_precision": round(float(align_prec), 4),
        "alignment_recall": round(float(align_rec), 4),
        "matched_lines": matched_count,
        "total_predicted": m,
        "total_reference": n,
        "unmatched_predictions": unmatched_preds,
        "unmatched_references": unmatched_refs,
        "non_table_body": non_table_res,
    }


def evaluate_detection_multi_threshold(
    predicted_boxes: List[BoundingBox],
    ground_truth_boxes: List[BoundingBox],
    thresholds: List[float] = [0.40, 0.50, 0.75],
) -> dict:
    """Evaluate detection Precision, Recall, and F1 across multiple IoU thresholds."""
    results = {}
    for th in thresholds:
        p, r, f1 = evaluate_detection_precision_recall(predicted_boxes, ground_truth_boxes, iou_threshold=th)
        results[f"iou_{int(th*100)}"] = {
            "precision": p,
            "recall": r,
            "f1": f1,
        }
    return results


FINANCIAL_FIELD_CATEGORIES = [
    "invoice_number",
    "date",
    "tax_id",
    "currency_code",
    "quantity",
    "unit_price",
    "subtotal",
    "tax_amount",
    "tax_percentage",
    "total_amount",
]


def evaluate_financial_fields_exact_match(
    predicted_text: str,
    ground_truth_fields: dict,
) -> dict:
    """
    Evaluate exact-match recognition of critical financial fields.
    Preserves exact punctuation, case, decimal points, and currency symbols.
    Never normalizes away characters that alter financial meaning.
    """
    field_results = {}
    matched_count = 0
    total_count = len(ground_truth_fields)

    for category, expected_val in ground_truth_fields.items():
        # Verbatim substring match preserving punctuation and decimals
        matched = expected_val in predicted_text
        if matched:
            matched_count += 1
        field_results[category] = {
            "expected": expected_val,
            "matched": matched,
        }

    field_results["_summary"] = {
        "total_fields": total_count,
        "matched_fields": matched_count,
        "exact_match_accuracy": round(matched_count / max(1, total_count), 4),
    }
    return field_results


def evaluate_financial_fields_dataset(
    hypotheses: List[str],
    ground_truth_fields_list: List[dict],
) -> dict:
    """Aggregate financial field exact match accuracy across an entire document set."""
    category_totals = {cat: 0 for cat in FINANCIAL_FIELD_CATEGORIES}
    category_matches = {cat: 0 for cat in FINANCIAL_FIELD_CATEGORIES}

    for hyp, gt_fields in zip(hypotheses, ground_truth_fields_list):
        for cat, expected in gt_fields.items():
            if cat in category_totals:
                category_totals[cat] += 1
                if expected in hyp:
                    category_matches[cat] += 1

    per_category = {}
    total_all = 0
    matches_all = 0
    for cat in FINANCIAL_FIELD_CATEGORIES:
        tot = category_totals[cat]
        mat = category_matches[cat]
        total_all += tot
        matches_all += mat
        acc = round(mat / max(1, tot), 4) if tot > 0 else 0.0
        per_category[cat] = {
            "total": tot,
            "matched": mat,
            "exact_match_accuracy": acc,
        }

    return {
        "per_category": per_category,
        "overall_exact_match_accuracy": round(matches_all / max(1, total_all), 4) if total_all > 0 else 0.0,
        "total_fields_evaluated": total_all,
        "total_fields_matched": matches_all,
    }


def evaluate_table_structure(
    predicted_table: Any,  # TableRegion
    ground_truth_table: Any,  # TableRegion
    iou_threshold: float = 0.50,
) -> dict:
    """
    Evaluate table structural parsing against ground truth.
    Measures Row F1, Column F1, and Cell Adjacency Matrix F1 (ICDAR standard).
    """
    # 1. Row Bounding Box Precision, Recall, F1
    pred_row_boxes = [r.bbox for r in predicted_table.rows]
    gt_row_boxes = [r.bbox for r in ground_truth_table.rows]
    row_p, row_r, row_f1 = evaluate_detection_precision_recall(
        pred_row_boxes, gt_row_boxes, iou_threshold=iou_threshold
    )

    # 2. Column Bounding Box Precision, Recall, F1
    pred_col_boxes = [c.bbox for c in predicted_table.columns]
    gt_col_boxes = [c.bbox for c in ground_truth_table.columns]
    col_p, col_r, col_f1 = evaluate_detection_precision_recall(
        pred_col_boxes, gt_col_boxes, iou_threshold=iou_threshold
    )

    # 3. Cell Adjacency Matrix Evaluation (ICDAR Standard)
    # Collect horizontal and vertical adjacency pairs in ground truth: (cell_a_text, cell_b_text)
    gt_adj_h: set = set()
    for row in ground_truth_table.rows:
        for idx in range(len(row.cells) - 1):
            c1_txt = row.cells[idx].text.strip()
            c2_txt = row.cells[idx + 1].text.strip()
            if c1_txt and c2_txt:
                gt_adj_h.add((c1_txt, c2_txt))

    gt_adj_v: set = set()
    gt_cells = ground_truth_table.cells
    for i, c1 in enumerate(gt_cells):
        for j, c2 in enumerate(gt_cells):
            if c1.col_index == c2.col_index and c2.row_index == c1.row_index + 1:
                t1 = c1.text.strip()
                t2 = c2.text.strip()
                if t1 and t2:
                    gt_adj_v.add((t1, t2))

    # Predicted horizontal and vertical adjacency
    pred_adj_h: set = set()
    for row in predicted_table.rows:
        for idx in range(len(row.cells) - 1):
            c1_txt = row.cells[idx].text.strip()
            c2_txt = row.cells[idx + 1].text.strip()
            if c1_txt and c2_txt:
                pred_adj_h.add((c1_txt, c2_txt))

    pred_adj_v: set = set()
    pred_cells = predicted_table.cells
    for i, c1 in enumerate(pred_cells):
        for j, c2 in enumerate(pred_cells):
            if c1.col_index == c2.col_index and c2.row_index == c1.row_index + 1:
                t1 = c1.text.strip()
                t2 = c2.text.strip()
                if t1 and t2:
                    pred_adj_v.add((t1, t2))

    # Compute Horizontal Adjacency Metrics
    tp_h = len(pred_adj_h.intersection(gt_adj_h))
    fp_h = len(pred_adj_h - gt_adj_h)
    fn_h = len(gt_adj_h - pred_adj_h)
    p_h = round(float(tp_h / max(1, tp_h + fp_h)), 4) if (tp_h + fp_h) > 0 else 1.0
    r_h = round(float(tp_h / max(1, tp_h + fn_h)), 4) if (tp_h + fn_h) > 0 else 1.0
    f1_h = round(float(2 * p_h * r_h / max(1e-6, p_h + r_h)), 4) if (p_h + r_h) > 0 else 0.0

    # Compute Vertical Adjacency Metrics
    tp_v = len(pred_adj_v.intersection(gt_adj_v))
    fp_v = len(pred_adj_v - gt_adj_v)
    fn_v = len(gt_adj_v - pred_adj_v)
    p_v = round(float(tp_v / max(1, tp_v + fp_v)), 4) if (tp_v + fp_v) > 0 else 1.0
    r_v = round(float(tp_v / max(1, tp_v + fn_v)), 4) if (tp_v + fn_v) > 0 else 1.0
    f1_v = round(float(2 * p_v * r_v / max(1e-6, p_v + r_v)), 4) if (p_v + r_v) > 0 else 0.0

    # Overall Combined Adjacency
    tp = tp_h + tp_v
    fp = fp_h + fp_v
    fn = fn_h + fn_v
    cell_adj_p = round(float(tp / max(1, tp + fp)), 4) if (tp + fp) > 0 else 1.0
    cell_adj_r = round(float(tp / max(1, tp + fn)), 4) if (tp + fn) > 0 else 1.0
    cell_adj_f1 = (
        round(float(2 * cell_adj_p * cell_adj_r / max(1e-6, cell_adj_p + cell_adj_r)), 4)
        if (cell_adj_p + cell_adj_r) > 0 else 0.0
    )

    # 4. Content Association / Value Alignment
    # Evaluates exact text matching at (row_index, col_index) grid intersections
    gt_grid_map = {(c.row_index, c.col_index): c.text.strip().lower() for c in gt_cells}
    pred_grid_map = {(c.row_index, c.col_index): c.text.strip().lower() for c in pred_cells}
    matched_content = 0
    total_gt_cells = len(gt_grid_map)
    for coord, gt_txt in gt_grid_map.items():
        if coord in pred_grid_map and pred_grid_map[coord] == gt_txt:
            matched_content += 1
    content_assoc_acc = round(float(matched_content / max(1, total_gt_cells)), 4)

    composite_score = round((row_f1 + col_f1 + cell_adj_f1 + content_assoc_acc) / 4.0, 4)

    return {
        "row_metrics": {"precision": row_p, "recall": row_r, "f1": row_f1},
        "column_metrics": {"precision": col_p, "recall": col_r, "f1": col_f1},
        "cell_adjacency_metrics": {
            "true_positives": tp,
            "false_positives": fp,
            "false_negatives": fn,
            "precision": cell_adj_p,
            "recall": cell_adj_r,
            "f1": cell_adj_f1,
            "horizontal": {"precision": p_h, "recall": r_h, "f1": f1_h},
            "vertical": {"precision": p_v, "recall": r_v, "f1": f1_v},
        },
        "content_association": {
            "total_cells": total_gt_cells,
            "matched_cells": matched_content,
            "accuracy": content_assoc_acc,
        },
        "composite_table_structure_f1": composite_score,
    }


