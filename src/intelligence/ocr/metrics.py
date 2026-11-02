"""
Evaluation Metrics for OCR Benchmarks: CER, WER, Detection IoU, and Reading Order Accuracy.
"""
from __future__ import annotations

from typing import List, Sequence, Tuple
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
    predicted_text_lines: List[str],
    ground_truth_lines: List[str],
) -> dict:
    """
    Measure pairwise relative ordering with explicit denominator tracking.
    Matches lines via string similarity (normalized edit distance <= 0.40) to decouple
    reading-order evaluation from OCR character substitution noise.
    Returns:
        - concordant_pairs: Number of correctly ordered pairs
        - total_annotated_pairs: Total evaluated pairs K = N*(N-1)/2
        - concordance_ratio: concordant_pairs / max(1, total_annotated_pairs)
    """
    n_gt = len(ground_truth_lines)
    total_k = n_gt * (n_gt - 1) // 2

    if n_gt <= 1:
        return {
            "concordant_pairs": 0,
            "total_annotated_pairs": 0,
            "concordance_ratio": 1.0,
        }

    # Match each predicted line to closest ground truth line
    matched_preds: List[int] = []
    for p in predicted_text_lines:
        p_clean = p.strip()
        if not p_clean:
            continue
        best_dist = 9999
        best_gt_idx = -1
        for gt_idx, gt in enumerate(ground_truth_lines):
            gt_clean = gt.strip()
            dist = levenshtein_distance(p_clean, gt_clean)
            norm_dist = dist / max(1, len(gt_clean))
            if norm_dist <= 0.40 and dist < best_dist:
                best_dist = dist
                best_gt_idx = gt_idx
        if best_gt_idx != -1 and best_gt_idx not in matched_preds:
            matched_preds.append(best_gt_idx)

    if len(matched_preds) <= 1:
        return {
            "concordant_pairs": 0,
            "total_annotated_pairs": total_k,
            "concordance_ratio": 0.0,
        }

    concordant = 0
    evaluated_pairs = 0
    for i in range(len(matched_preds)):
        for j in range(i + 1, len(matched_preds)):
            evaluated_pairs += 1
            if matched_preds[i] < matched_preds[j]:
                concordant += 1

    ratio = round(float(concordant / max(1, evaluated_pairs)), 4)
    return {
        "concordant_pairs": concordant,
        "total_annotated_pairs": evaluated_pairs,
        "concordance_ratio": ratio,
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

    # 3. Cell Adjacency Matrix Evaluation
    # Collect adjacency pairs in ground truth: (cell_a_text, cell_b_text, relation)
    gt_adj: set = set()
    for row in ground_truth_table.rows:
        for idx in range(len(row.cells) - 1):
            c1_txt = row.cells[idx].text.strip()
            c2_txt = row.cells[idx + 1].text.strip()
            if c1_txt and c2_txt:
                gt_adj.add((c1_txt, c2_txt, "horizontal"))

    # Vertical adjacency in ground truth
    gt_cells = ground_truth_table.cells
    for i, c1 in enumerate(gt_cells):
        for j, c2 in enumerate(gt_cells):
            if c1.col_index == c2.col_index and c2.row_index == c1.row_index + 1:
                t1 = c1.text.strip()
                t2 = c2.text.strip()
                if t1 and t2:
                    gt_adj.add((t1, t2, "vertical"))

    # Predicted adjacency
    pred_adj: set = set()
    for row in predicted_table.rows:
        for idx in range(len(row.cells) - 1):
            c1_txt = row.cells[idx].text.strip()
            c2_txt = row.cells[idx + 1].text.strip()
            if c1_txt and c2_txt:
                pred_adj.add((c1_txt, c2_txt, "horizontal"))

    pred_cells = predicted_table.cells
    for i, c1 in enumerate(pred_cells):
        for j, c2 in enumerate(pred_cells):
            if c1.col_index == c2.col_index and c2.row_index == c1.row_index + 1:
                t1 = c1.text.strip()
                t2 = c2.text.strip()
                if t1 and t2:
                    pred_adj.add((t1, t2, "vertical"))

    tp = len(pred_adj.intersection(gt_adj))
    fp = len(pred_adj - gt_adj)
    fn = len(gt_adj - pred_adj)

    cell_adj_p = round(float(tp / max(1, tp + fp)), 4) if (tp + fp) > 0 else 1.0
    cell_adj_r = round(float(tp / max(1, tp + fn)), 4) if (tp + fn) > 0 else 1.0
    cell_adj_f1 = (
        round(float(2 * cell_adj_p * cell_adj_r / max(1e-6, cell_adj_p + cell_adj_r)), 4)
        if (cell_adj_p + cell_adj_r) > 0 else 0.0
    )

    composite_score = round((row_f1 + col_f1 + cell_adj_f1) / 3.0, 4)

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
        },
        "composite_table_structure_f1": composite_score,
    }


