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
    Evaluates whether line A appears before line B when line A precedes line B in ground truth.
    """
    if len(ground_truth_lines) <= 1:
        return 1.0

    # Build mapping from line content to ground truth rank
    gt_ranks = {line.strip(): i for i, line in enumerate(ground_truth_lines)}

    matched_preds = [gt_ranks[p.strip()] for p in predicted_text_lines if p.strip() in gt_ranks]
    if len(matched_preds) <= 1:
        return 1.0 if matched_preds else 0.0

    concordant = 0
    total_pairs = 0
    for i in range(len(matched_preds)):
        for j in range(i + 1, len(matched_preds)):
            total_pairs += 1
            if matched_preds[i] < matched_preds[j]:
                concordant += 1

    return round(float(concordant / max(1, total_pairs)), 4)
