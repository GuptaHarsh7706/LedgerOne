"""
Adversarial Tests for Reading Order Bipartite Evaluation (Hungarian Algorithm).
Verifies:
1. Missed blocks penalize strict concordance while matched concordance may mask the defect.
2. Duplicated/hallucinated blocks penalize alignment precision.
3. Inversions and wrong ordering penalize concordant pairs and strict concordance.
4. Low-overlap assignments (distance > max_norm_dist or IoU < threshold) are strictly rejected.
5. Non-table body text concordance is evaluated with explicit numerators and denominators.
"""
from __future__ import annotations

import pytest
from src.intelligence.ocr.metrics import calculate_reading_order_detailed
from src.intelligence.models import BoundingBox


def test_adversarial_missed_blocks_penalizes_strict_concordance():
    """
    Reference has 5 blocks (10 pairs).
    Prediction drops 1 block (4 blocks remain, ordered correctly).
    Demonstrates that matched concordance masks the drop (1.0000),
    whereas strict concordance correctly drops to 6/10 = 0.6000.
    """
    refs = ["Block 1 Header", "Block 2 Vendor", "Block 3 Items", "Block 4 Subtotal", "Block 5 Total"]
    preds = ["Block 1 Header", "Block 2 Vendor", "Block 3 Items", "Block 5 Total"]  # Dropped Block 4
    
    res = calculate_reading_order_detailed(preds, refs)
    
    assert res["total_reference"] == 5
    assert res["total_predicted"] == 4
    assert res["matched_lines"] == 4
    assert res["unmatched_references"] == [3]  # Block 4 index
    assert res["alignment_recall"] == 0.8000
    
    # 4 matched items form 4*3/2 = 6 pairs. All 6 are concordant.
    assert res["concordant_pairs"] == 6
    assert res["total_annotated_pairs"] == 6
    assert res["total_reference_pairs"] == 10
    
    # Matched concordance ratio masks the missing block
    assert res["concordance_ratio"] == 1.0000
    
    # Strict concordance ratio penalizes the missing block
    assert res["strict_concordance_ratio"] == 0.6000


def test_adversarial_duplicated_blocks_penalizes_alignment_precision():
    """
    Reference has 4 blocks.
    Prediction hallucinates 2 duplicate blocks (total 6 blocks).
    Hungarian matching guarantees strict 1-to-1 matching,
    penalizing alignment precision from 1.0 to 4/6 = 0.6667.
    """
    refs = ["Invoice No: 101", "Date: 2026-11-01", "Amount: $100.00", "Total: $100.00"]
    preds = [
        "Invoice No: 101",
        "Invoice No: 101",  # duplicate
        "Date: 2026-11-01",
        "Amount: $100.00",
        "Amount: $100.00",  # duplicate
        "Total: $100.00",
    ]
    
    res = calculate_reading_order_detailed(preds, refs)
    
    assert res["total_predicted"] == 6
    assert res["total_reference"] == 4
    assert res["matched_lines"] == 4
    assert len(res["unmatched_predictions"]) == 2
    assert res["alignment_precision"] == 0.6667
    assert res["alignment_recall"] == 1.0000


def test_adversarial_wrong_ordering_penalizes_concordance():
    """
    Reference has 4 sequential blocks: [A, B, C, D] (6 pairs).
    Prediction transposes B and C: [A, C, B, D].
    Pairs:
    (A, C): concordant
    (A, B): concordant
    (A, D): concordant
    (C, B): DISCORDANT (inverted)
    (C, D): concordant
    (B, D): concordant
    Concordant: 5/6, Discordant: 1/6.
    """
    refs = ["Section A Intro", "Section B Scope", "Section C Terms", "Section D Sign"]
    preds = ["Section A Intro", "Section C Terms", "Section B Scope", "Section D Sign"]
    
    res = calculate_reading_order_detailed(preds, refs)
    
    assert res["concordant_pairs"] == 5
    assert res["discordant_pairs"] == 1
    assert res["total_annotated_pairs"] == 6
    assert res["total_reference_pairs"] == 6
    assert res["concordance_ratio"] == 0.8333
    assert res["strict_concordance_ratio"] == 0.8333


def test_adversarial_low_overlap_matching_rejection():
    """
    Verify that low-overlap line crops (edit distance > 0.40 or IoU < 0.40)
    are strictly rejected by Hungarian cost gating and marked unmatched.
    """
    # 1. Text-based distance cutoff
    refs = ["Subtotal Amount Due: $1,420.00"]
    preds = ["Completely Unrelated Garbage Text Noise"]
    
    res = calculate_reading_order_detailed(preds, refs, max_norm_dist=0.40)
    assert res["matched_lines"] == 0
    assert res["unmatched_predictions"] == [0]
    assert res["unmatched_references"] == [0]
    assert res["strict_concordance_ratio"] == 0.0

    # 2. Bounding-box IoU cutoff
    b_ref = BoundingBox(x0=0.1, y0=0.1, x1=0.3, y1=0.2, x0_pt=60, y0_pt=40, x1_pt=180, y1_pt=80)
    b_pred_low_overlap = BoundingBox(x0=0.28, y0=0.18, x1=0.5, y1=0.3, x0_pt=168, y0_pt=72, x1_pt=300, y1_pt=120)
    
    res_bbox = calculate_reading_order_detailed([b_pred_low_overlap], [b_ref], iou_threshold=0.40)
    assert res_bbox["matched_lines"] == 0
    assert res_bbox["unmatched_predictions"] == [0]
    assert res_bbox["unmatched_references"] == [0]


def test_non_table_body_concordance_isolation():
    """
    Verify that non-table body text concordance is evaluated
    with an explicit numerator and denominator separated from table elements.
    """
    # 5 reference blocks: 2 body, 3 table, 1 body
    refs = ["Header Memo", "Vendor Intro", "Table Row 1", "Table Row 2", "Table Row 3", "Footer Sign"]
    table_mask = [False, False, True, True, True, False]  # True = table, False = body
    
    # Body lines: [0: "Header Memo", 1: "Vendor Intro", 5: "Footer Sign"] -> 3 lines -> 3 pairs
    # In prediction, table rows are scrambled but body lines are ordered correctly
    preds = ["Header Memo", "Vendor Intro", "Table Row 3", "Table Row 1", "Table Row 2", "Footer Sign"]
    
    res = calculate_reading_order_detailed(preds, refs, is_table_mask=table_mask)
    
    nt = res["non_table_body"]
    assert nt["total_reference_pairs"] == 3
    assert nt["concordant_pairs"] == 3
    assert nt["strict_concordance_ratio"] == 1.0000
    
    # Overall table was scrambled so overall concordant pairs < total
    assert res["concordant_pairs"] < res["total_reference_pairs"]
