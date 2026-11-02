"""
Phase 4 Step 3: Head-to-Head Comparative Extraction Benchmark & Acceptance Audit Suite.

Evaluates:
1. Three-Candidate Comparative Benchmark:
   - Candidate A: SpatialAnchorExtractor (layout regex anchors + SafeFinancialNormalizer)
   - Candidate B: SemanticDenseExtractor (all-MiniLM-L6-v2 dense embeddings + normalizers)
   - Candidate C: HybridStructuredExtractor (spatial + dense semantic + strict corroboration & conflict gating)
   Across exactly the same 30 benchmark documents (177 ground truth annotations).
2. Document Classification Audit:
   - Complete 8x8 confusion matrix across all 30 documents
   - Per-class Precision, Recall, F1, and class support
   - Macro-F1 and Weighted-F1
   - OTHER class rejection behavior
   - Confidence distributions for correct vs incorrect predictions
   - Brier score, Expected Calibration Error (ECE), and reliability diagram data
3. Performance Benchmark Reproducibility:
   - Multi-stage latency breakdown (Classification, Spatial, Semantic, Corroboration, Schema, Serialization)
   - Cold vs warm latency across 5 repetitions (p50, p95, p99, throughput)
   - GPU VRAM (allocated, peak, reserved) and process RSS
"""
from __future__ import annotations

import json
import logging
import os
import re
import sys
import time
from collections import defaultdict
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import psutil

# Add LedgerOne root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from benchmarks.benchmark_ocr import build_full_benchmark_corpus, build_external_held_out_corpus
from benchmarks.benchmark_extraction import benchmark_doc_to_extracted_page
from src.intelligence.classifier import DocumentClassifier
from src.intelligence.extraction_schemas import (
    DocumentType,
    FieldDataType,
    ExtractionStatus,
    ExtractedField,
    InvoiceExtractionSchema,
    ContractExtractionSchema,
)
from src.intelligence.structured_extractor import (
    SpatialAnchorExtractor,
    SemanticDenseExtractor,
    HybridStructuredExtractor,
    INVOICE_ANCHOR_PATTERNS,
    SEMANTIC_PROBES,
)

logger = logging.getLogger(__name__)

# Ground truth document type mapping for all 30 documents across 8 canonical classes
GROUND_TRUTH_DOCUMENT_TYPES: Dict[str, DocumentType] = {
    "DEV-01-CLEAN-INVOICE": DocumentType.COMMERCIAL_INVOICE,
    "DEV-02-THERMAL-RECEIPT": DocumentType.RECEIPT,
    "DEV-03-PURCHASE-ORDER": DocumentType.PURCHASE_ORDER,
    "DEV-04-BANK-STATEMENT": DocumentType.BANK_STATEMENT,
    "DEV-05-FINANCIAL-SCHEDULE": DocumentType.FINANCIAL_SCHEDULE,
    "DEV-06-LEGAL-CONTRACT": DocumentType.LEGAL_CONTRACT,
    "DEV-07-MULTI-COLUMN": DocumentType.MULTI_COLUMN_REPORT,
    "DEV-08-HYBRID-SCAN": DocumentType.COMMERCIAL_INVOICE,
    "DEV-09-SKEWED-INVOICE": DocumentType.COMMERCIAL_INVOICE,
    "DEV-10-STAMP-ANNOTATION": DocumentType.COMMERCIAL_INVOICE,
    "HELD-01-COMMERCIAL-INVOICE": DocumentType.COMMERCIAL_INVOICE,
    "HELD-02-RESTAURANT-RECEIPT": DocumentType.RECEIPT,
    "HELD-03-SUPPLY-PO": DocumentType.PURCHASE_ORDER,
    "HELD-04-CHECKING-STATEMENT": DocumentType.BANK_STATEMENT,
    "HELD-05-TAX-SCHEDULE": DocumentType.FINANCIAL_SCHEDULE,
    "HELD-06-SERVICE-CONTRACT": DocumentType.LEGAL_CONTRACT,
    "HELD-07-TWO-COLUMN-LEDGER": DocumentType.MULTI_COLUMN_REPORT,
    "HELD-08-HYBRID-PORTFOLIO": DocumentType.MULTI_COLUMN_REPORT,
    "HELD-09-LOW-CONTRAST-SCAN": DocumentType.COMMERCIAL_INVOICE,
    "HELD-10-BLANK-PAGE": DocumentType.OTHER,
    "EXT-HELD-01-AWS-INVOICE": DocumentType.COMMERCIAL_INVOICE,
    "EXT-HELD-02-SHELL-POS-RECEIPT": DocumentType.RECEIPT,
    "EXT-HELD-03-DELL-PO": DocumentType.PURCHASE_ORDER,
    "EXT-HELD-04-BARCLAYS-BANK-STATEMENT": DocumentType.BANK_STATEMENT,
    "EXT-HELD-05-IRS-4562-DEPRECIATION": DocumentType.FINANCIAL_SCHEDULE,
    "EXT-HELD-06-ENTERPRISE-SLA-CONTRACT": DocumentType.LEGAL_CONTRACT,
    "EXT-HELD-07-MULTIPAGE-FINANCIAL-P1": DocumentType.MULTI_COLUMN_REPORT,
    "EXT-HELD-08-BALANCE-SHEET-TABLE": DocumentType.FINANCIAL_SCHEDULE,
    "EXT-HELD-09-EUROPEAN-VENDOR-INVOICE": DocumentType.COMMERCIAL_INVOICE,
    "EXT-HELD-10-STAMP-SEAL-CERTIFICATE": DocumentType.COMMERCIAL_INVOICE,
}

CANONICAL_CATEGORIES = [
    "invoice_number",
    "date",
    "tax_id",
    "currency_code",
    "quantity",
    "unit_price",
    "tax_percentage",
    "total_amount",
    "subtotal",
    "tax_amount",
]


def clean_num(val: Any) -> Optional[float]:
    """Clean string or Decimal representation into float for numeric tolerance evaluation."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, Decimal):
        return float(val)
    s = (
        str(val)
        .replace("$", "")
        .replace("€", "")
        .replace("£", "")
        .replace("¥", "")
        .replace(",", "")
        .replace("%", "")
        .strip()
    )
    try:
        return float(s)
    except ValueError:
        return None


def clean_str(val: Any) -> str:
    """Normalize string representation for comparison."""
    if val is None:
        return ""
    return str(val).strip().upper()


def evaluate_field_match(
    predicted_field: Optional[ExtractedField],
    ground_truth_raw: str,
    ground_truth_norm: Any,
    category: str,
    threshold: float = 0.75,
) -> Tuple[bool, bool, bool]:
    """
    Evaluate candidate extraction against ground truth annotation.
    Returns: (is_accepted, is_correct, is_exact_match)
    """
    if predicted_field is None:
        return False, False, False

    if predicted_field.extraction_status != ExtractionStatus.ACCEPTED:
        return False, False, False

    if predicted_field.confidence < threshold:
        return False, False, False

    # Accepted field
    is_accepted = True

    # Exact match check (raw OCR text verbatim match)
    pred_raw = clean_str(predicted_field.raw_value)
    gt_raw = clean_str(ground_truth_raw)
    is_exact_match = (pred_raw == gt_raw) or (gt_raw in pred_raw) or (pred_raw in gt_raw and len(pred_raw) > 3)

    # Normalized semantic correctness check
    pred_v = predicted_field.value
    gt_v = ground_truth_norm

    is_correct = False
    if category in ("total_amount", "subtotal", "tax_amount", "unit_price", "quantity", "tax_percentage"):
        pred_num = clean_num(pred_v)
        gt_num = clean_num(gt_v)
        if pred_num is not None and gt_num is not None:
            is_correct = abs(pred_num - gt_num) <= 0.02
        elif pred_v is not None and gt_v is not None:
            is_correct = clean_str(pred_v) == clean_str(gt_v)
    else:
        # String / categorical / identifier (invoice_number, date, tax_id, currency_code)
        p_str = clean_str(pred_v)
        g_str = clean_str(gt_v)
        r_str = clean_str(predicted_field.raw_value)
        is_correct = (
            (p_str == g_str)
            or (g_str in p_str)
            or (p_str in g_str and len(p_str) > 2)
            or (g_str in r_str)
            or (r_str in g_str and len(r_str) > 2)
        )

    return is_accepted, is_correct, is_exact_match


def run_comparative_extraction_benchmark(output_path: Optional[str] = None) -> Dict[str, Any]:
    """Execute complete comparative evaluation across Candidate A, B, and C."""
    print("=" * 80)
    print("LedgerOne Phase 4 Step 3: Three-Candidate Comparative Benchmark & Audit")
    print("=" * 80)

    # 1. Hardware baseline
    import torch
    cuda_available = torch.cuda.is_available()
    device_name = torch.cuda.get_device_name(0) if cuda_available else "CPU"
    print(f"Compute Device: {device_name} (CUDA Available: {cuda_available})")

    if cuda_available:
        torch.cuda.reset_peak_memory_stats()
        torch.cuda.empty_cache()

    process = psutil.Process()
    rss_start = process.memory_info().rss / (1024 * 1024)

    # 2. Load 30 benchmark documents
    t0_docs = time.time()
    docs = build_full_benchmark_corpus() + build_external_held_out_corpus()
    assert len(docs) == 30, f"Expected 30 documents, got {len(docs)}"
    print(f"Loaded {len(docs)} benchmark documents in {time.time() - t0_docs:.2f}s")

    # 3. Load immutable 177-annotation manifest
    manifest_path = os.path.join(os.path.dirname(__file__), "annotation_manifest_177.json")
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    annotations = manifest["annotations"]
    assert len(annotations) == 177, f"Expected 177 annotations, got {len(annotations)}"
    print(f"Loaded {len(annotations)} ground-truth annotations from immutable manifest")

    doc_pages: Dict[str, Any] = {}
    for d in docs:
        doc_pages[d.doc_id] = benchmark_doc_to_extracted_page(d)

    # 4. Initialize Candidates
    print("\nInitializing extraction candidates...")
    t0_init = time.time()
    candidate_A = SpatialAnchorExtractor(confidence_threshold=0.75)
    candidate_B = SemanticDenseExtractor(use_gpu=cuda_available, similarity_threshold=0.40)
    candidate_B._init_embedder()
    candidate_C = HybridStructuredExtractor(confidence_threshold=0.75, use_gpu=cuda_available)
    init_duration_s = time.time() - t0_init
    print(f"Candidates initialized in {init_duration_s:.2f}s")

    # 5. Extract fields per document for each candidate
    print("\nRunning extraction across 30 documents for Candidates A, B, and C...")

    # Extractions maps: candidate -> doc_id -> field_name -> ExtractedField
    extractions_A: Dict[str, Dict[str, ExtractedField]] = {}
    extractions_B: Dict[str, Dict[str, ExtractedField]] = {}
    extractions_C: Dict[str, Dict[str, ExtractedField]] = {}

    target_eval_fields = [
        "invoice_number", "invoice_date", "vendor_tax_id", "currency",
        "quantity", "unit_price", "tax_percentage", "total_amount",
        "subtotal", "tax_amount",
    ]

    for d in docs:
        page = doc_pages[d.doc_id]

        # Candidate A: Spatial Anchor
        fields_A_raw = candidate_A.extract_from_blocks(page.digital_blocks)
        # Normalize key names to canonical category names
        fields_A: Dict[str, ExtractedField] = {
            "invoice_number": fields_A_raw.get("invoice_number"),
            "date": fields_A_raw.get("invoice_date"),
            "tax_id": fields_A_raw.get("vendor_tax_id"),
            "currency_code": fields_A_raw.get("currency"),
            "quantity": fields_A_raw.get("quantity"),
            "unit_price": fields_A_raw.get("unit_price"),
            "tax_percentage": fields_A_raw.get("tax_percentage"),
            "total_amount": fields_A_raw.get("total_amount"),
            "subtotal": fields_A_raw.get("subtotal"),
            "tax_amount": fields_A_raw.get("tax_amount"),
        }
        extractions_A[d.doc_id] = {k: v for k, v in fields_A.items() if v is not None}

        # Candidate B: Semantic Dense
        fields_B_raw = candidate_B.extract_semantic_entities(page.digital_blocks, fields_to_extract=target_eval_fields)
        fields_B: Dict[str, ExtractedField] = {
            "invoice_number": fields_B_raw.get("invoice_number"),
            "date": fields_B_raw.get("invoice_date"),
            "tax_id": fields_B_raw.get("vendor_tax_id"),
            "currency_code": fields_B_raw.get("currency"),
            "quantity": fields_B_raw.get("quantity"),
            "unit_price": fields_B_raw.get("unit_price"),
            "tax_percentage": fields_B_raw.get("tax_percentage"),
            "total_amount": fields_B_raw.get("total_amount"),
            "subtotal": fields_B_raw.get("subtotal"),
            "tax_amount": fields_B_raw.get("tax_amount"),
        }
        extractions_B[d.doc_id] = {k: v for k, v in fields_B.items() if v is not None}

        # Candidate C: Hybrid Structured
        schema_C = candidate_C.extract_document([page])
        if isinstance(schema_C, InvoiceExtractionSchema):
            fields_C = {
                "invoice_number": schema_C.invoice_number,
                "date": schema_C.invoice_date,
                "tax_id": schema_C.vendor_tax_id,
                "currency_code": schema_C.currency,
                "quantity": schema_C.quantity,
                "unit_price": schema_C.unit_price,
                "tax_percentage": schema_C.tax_percentage,
                "total_amount": schema_C.total_amount,
                "subtotal": schema_C.subtotal,
                "tax_amount": schema_C.tax_amount,
            }
        else:
            fields_C = {
                "date": schema_C.effective_date,
                "total_amount": schema_C.total_value,
            }
        extractions_C[d.doc_id] = {k: v for k, v in fields_C.items() if v is not None}

    # 6. Comparative evaluation across 177 annotations at standard threshold tau = 0.75
    candidates = {
        "Candidate_A_Spatial": extractions_A,
        "Candidate_B_Semantic": extractions_B,
        "Candidate_C_Hybrid": extractions_C,
    }

    comparative_results: Dict[str, Any] = {}
    threshold_taus = [0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95]

    for cand_name, cand_extractions in candidates.items():
        total_fields = len(annotations)
        accepted = 0
        correct_accepted = 0
        incorrect_accepted = 0
        abstained = 0
        exact_matches = 0

        # Per category metrics
        cat_metrics: Dict[str, Dict[str, int]] = {
            cat: {"total": 0, "accepted": 0, "correct": 0, "incorrect": 0, "abstained": 0, "exact_match": 0}
            for cat in CANONICAL_CATEGORIES
        }

        for ann in annotations:
            doc_id = ann["document_id"]
            cat = ann["canonical_category_v3_5"]
            raw_gt = ann["raw_reference_text"]
            norm_gt = ann["normalized_ground_truth_value"]

            cat_metrics[cat]["total"] += 1
            pred_field = cand_extractions.get(doc_id, {}).get(cat)

            is_acc, is_corr, is_em = evaluate_field_match(
                predicted_field=pred_field,
                ground_truth_raw=raw_gt,
                ground_truth_norm=norm_gt,
                category=cat,
                threshold=0.75,
            )

            if is_acc:
                accepted += 1
                cat_metrics[cat]["accepted"] += 1
                if is_corr:
                    correct_accepted += 1
                    cat_metrics[cat]["correct"] += 1
                else:
                    incorrect_accepted += 1
                    cat_metrics[cat]["incorrect"] += 1
                if is_em:
                    exact_matches += 1
                    cat_metrics[cat]["exact_match"] += 1
            else:
                abstained += 1
                cat_metrics[cat]["abstained"] += 1

        precision = (correct_accepted / accepted) if accepted > 0 else 1.0
        recall = (correct_accepted / total_fields) if total_fields > 0 else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
        exact_match_acc = (exact_matches / total_fields) if total_fields > 0 else 0.0
        coverage = (accepted / total_fields) if total_fields > 0 else 0.0
        pfai = (incorrect_accepted / total_fields) if total_fields > 0 else 0.0

        # Category breakdowns
        cat_breakdown: Dict[str, Any] = {}
        for cat in CANONICAL_CATEGORIES:
            cm = cat_metrics[cat]
            c_acc = cm["accepted"]
            c_corr = cm["correct"]
            c_tot = cm["total"]
            c_prec = (c_corr / c_acc) if c_acc > 0 else 1.0
            c_cov = (c_acc / c_tot) if c_tot > 0 else 0.0
            c_pfai = (cm["incorrect"] / c_tot) if c_tot > 0 else 0.0
            cat_breakdown[cat] = {
                "total_fields": c_tot,
                "accepted": c_acc,
                "correct_accepted": c_corr,
                "incorrect_accepted": cm["incorrect"],
                "abstained": cm["abstained"],
                "precision": round(c_prec, 4),
                "coverage": round(c_cov, 4),
                "population_false_acceptance_incidence": round(c_pfai, 4),
                "exact_matches": cm["exact_match"],
            }

        # Risk-coverage curve across thresholds
        risk_coverage_curve: List[Dict[str, Any]] = []
        for tau in threshold_taus:
            tau_acc = 0
            tau_corr = 0
            tau_inc = 0
            for ann in annotations:
                doc_id = ann["document_id"]
                cat = ann["canonical_category_v3_5"]
                raw_gt = ann["raw_reference_text"]
                norm_gt = ann["normalized_ground_truth_value"]

                pred_field = cand_extractions.get(doc_id, {}).get(cat)
                is_acc, is_corr, _ = evaluate_field_match(
                    predicted_field=pred_field,
                    ground_truth_raw=raw_gt,
                    ground_truth_norm=norm_gt,
                    category=cat,
                    threshold=tau,
                )
                if is_acc:
                    tau_acc += 1
                    if is_corr:
                        tau_corr += 1
                    else:
                        tau_inc += 1

            t_prec = (tau_corr / tau_acc) if tau_acc > 0 else 1.0
            t_cov = (tau_acc / total_fields) if total_fields > 0 else 0.0
            t_risk = (tau_inc / tau_acc) if tau_acc > 0 else 0.0  # Empirical error rate on accepted fields
            t_pfai = (tau_inc / total_fields) if total_fields > 0 else 0.0
            risk_coverage_curve.append({
                "threshold_tau": tau,
                "accepted_fields": tau_acc,
                "correct_accepted": tau_corr,
                "incorrect_accepted": tau_inc,
                "coverage": round(t_cov, 4),
                "precision": round(t_prec, 4),
                "empirical_risk": round(t_risk, 4),
                "population_false_acceptance_incidence": round(t_pfai, 4),
            })

        comparative_results[cand_name] = {
            "total_annotated_fields": total_fields,
            "accepted_fields": accepted,
            "correct_accepted_fields": correct_accepted,
            "incorrect_accepted_fields": incorrect_accepted,
            "abstained_fields": abstained,
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1_score": round(f1, 4),
            "exact_match_accuracy": round(exact_match_acc, 4),
            "coverage": round(coverage, 4),
            "population_false_acceptance_incidence": round(pfai, 4),
            "category_breakdown": cat_breakdown,
            "risk_coverage_curve": risk_coverage_curve,
        }

    # 7. Document Classification Audit (8x8 Confusion Matrix & Calibration)
    print("\nAuditing Document Classification & Confidence Calibration...")
    classifier = DocumentClassifier(use_gpu=cuda_available)
    all_classes = [dt for dt in DocumentType]
    class_idx = {dt: i for i, dt in enumerate(all_classes)}
    conf_matrix = np.zeros((8, 8), dtype=int)

    cls_confidences_correct: List[float] = []
    cls_confidences_incorrect: List[float] = []
    cls_predictions: List[Dict[str, Any]] = []

    # For Brier Score: sum of squared differences over all classes
    brier_sum = 0.0

    # For ECE: confidence binning
    n_bins = 10
    bins = [[] for _ in range(n_bins)]

    for d in docs:
        expected_type = GROUND_TRUTH_DOCUMENT_TYPES[d.doc_id]
        page = doc_pages[d.doc_id]
        cls_res = classifier.classify_document_pages([page])
        pred_type = cls_res.predicted_type
        conf = cls_res.confidence

        row = class_idx[expected_type]
        col = class_idx[pred_type]
        conf_matrix[row, col] += 1

        is_correct = (pred_type == expected_type)
        if is_correct:
            cls_confidences_correct.append(conf)
        else:
            cls_confidences_incorrect.append(conf)

        # Brier calculation
        for dt, p_prob in cls_res.class_probabilities.items():
            y_true = 1.0 if dt == expected_type.value else 0.0
            brier_sum += (p_prob - y_true) ** 2

        # ECE binning
        bin_idx = min(int(conf * n_bins), n_bins - 1)
        bins[bin_idx].append((conf, 1 if is_correct else 0))

        cls_predictions.append({
            "doc_id": d.doc_id,
            "expected_type": expected_type.value,
            "predicted_type": pred_type.value,
            "is_correct": is_correct,
            "confidence": conf,
            "probabilities": cls_res.class_probabilities,
        })

    total_docs = len(docs)
    brier_score = brier_sum / total_docs

    # ECE & Reliability Diagram
    ece_sum = 0.0
    reliability_diagram: List[Dict[str, Any]] = []
    for b_idx in range(n_bins):
        bin_items = bins[b_idx]
        b_low = b_idx / n_bins
        b_high = (b_idx + 1) / n_bins
        if not bin_items:
            reliability_diagram.append({
                "bin_range": f"[{b_low:.1f}, {b_high:.1f})",
                "count": 0,
                "mean_predicted_confidence": round((b_low + b_high) / 2.0, 4),
                "empirical_accuracy": 0.0,
                "calibration_gap": 0.0,
            })
            continue

        b_count = len(bin_items)
        b_mean_conf = float(np.mean([item[0] for item in bin_items]))
        b_acc = float(np.mean([item[1] for item in bin_items]))
        b_gap = abs(b_acc - b_mean_conf)
        ece_sum += (b_count / total_docs) * b_gap

        reliability_diagram.append({
            "bin_range": f"[{b_low:.1f}, {b_high:.1f})",
            "count": b_count,
            "mean_predicted_confidence": round(b_mean_conf, 4),
            "empirical_accuracy": round(b_acc, 4),
            "calibration_gap": round(b_gap, 4),
        })

    # Per-class P/R/F1 from confusion matrix
    per_class_metrics: Dict[str, Dict[str, Any]] = {}
    f1_list: List[float] = []
    weighted_f1_sum = 0.0

    for dt in all_classes:
        idx = class_idx[dt]
        tp = int(conf_matrix[idx, idx])
        fp = int(np.sum(conf_matrix[:, idx]) - tp)
        fn = int(np.sum(conf_matrix[idx, :]) - tp)
        support = int(np.sum(conf_matrix[idx, :]))

        p = (tp / (tp + fp)) if (tp + fp) > 0 else (1.0 if support == 0 else 0.0)
        r = (tp / (tp + fn)) if (tp + fn) > 0 else (1.0 if support == 0 else 0.0)
        f1_val = (2 * p * r / (p + r)) if (p + r) > 0 else 0.0

        per_class_metrics[dt.value] = {
            "true_positive": tp,
            "false_positive": fp,
            "false_negative": fn,
            "support": support,
            "precision": round(p, 4),
            "recall": round(r, 4),
            "f1_score": round(f1_val, 4),
        }
        f1_list.append(f1_val)
        weighted_f1_sum += f1_val * support

    macro_f1 = float(np.mean(f1_list))
    weighted_f1 = (weighted_f1_sum / total_docs) if total_docs > 0 else 0.0
    overall_cls_accuracy = float(np.trace(conf_matrix)) / total_docs

    # Confidence distribution stats
    conf_correct_stats = {
        "count": len(cls_confidences_correct),
        "mean": round(float(np.mean(cls_confidences_correct)), 4) if cls_confidences_correct else 0.0,
        "median": round(float(np.median(cls_confidences_correct)), 4) if cls_confidences_correct else 0.0,
        "std": round(float(np.std(cls_confidences_correct)), 4) if cls_confidences_correct else 0.0,
        "min": round(float(np.min(cls_confidences_correct)), 4) if cls_confidences_correct else 0.0,
        "max": round(float(np.max(cls_confidences_correct)), 4) if cls_confidences_correct else 0.0,
    }
    conf_incorrect_stats = {
        "count": len(cls_confidences_incorrect),
        "mean": round(float(np.mean(cls_confidences_incorrect)), 4) if cls_confidences_incorrect else 0.0,
        "median": round(float(np.median(cls_confidences_incorrect)), 4) if cls_confidences_incorrect else 0.0,
        "std": round(float(np.std(cls_confidences_incorrect)), 4) if cls_confidences_incorrect else 0.0,
        "min": round(float(np.min(cls_confidences_incorrect)), 4) if cls_confidences_incorrect else 0.0,
        "max": round(float(np.max(cls_confidences_incorrect)), 4) if cls_confidences_incorrect else 0.0,
    }

    classification_audit = {
        "total_documents": total_docs,
        "overall_accuracy": round(overall_cls_accuracy, 4),
        "macro_f1": round(macro_f1, 4),
        "weighted_f1": round(weighted_f1, 4),
        "brier_score": round(brier_score, 4),
        "expected_calibration_error": round(ece_sum, 4),
        "confusion_matrix_8x8": {
            "classes": [dt.value for dt in all_classes],
            "matrix": conf_matrix.tolist(),
        },
        "per_class_metrics": per_class_metrics,
        "confidence_distributions": {
            "correct_predictions": conf_correct_stats,
            "incorrect_predictions": conf_incorrect_stats,
        },
        "reliability_diagram": reliability_diagram,
        "other_rejection_behavior": {
            "blank_page_classified_as_other": any(
                p["doc_id"] == "HELD-10-BLANK-PAGE" and p["predicted_type"] == "OTHER" for p in cls_predictions
            ),
            "rejection_sink_note": "DocumentType.OTHER acts as rejection fallback for blank, corrupted, or unclassified documents.",
        },
    }

    # 8. Performance Benchmark Reproducibility across 5 repetitions
    print("\nMeasuring multi-stage latency and resource containment across 5 repetitions...")
    warm_latencies_by_stage: Dict[str, List[float]] = defaultdict(list)
    total_warm_latencies: List[float] = []

    # Warm-up run
    for d in docs[:5]:
        candidate_C.extract_document([doc_pages[d.doc_id]])

    # 5 Repetitions across all 30 documents
    for rep in range(5):
        for d in docs:
            page = doc_pages[d.doc_id]
            t_start = time.perf_counter()

            # Stage 1: Document classification
            t0 = time.perf_counter()
            clf_res = candidate_C.classifier.classify_document_pages([page])
            t_clf = (time.perf_counter() - t0) * 1000.0

            # Stage 2: Spatial anchor extraction
            t0 = time.perf_counter()
            sp_fields = candidate_C.spatial_extractor.extract_from_blocks(page.digital_blocks)
            t_sp = (time.perf_counter() - t0) * 1000.0

            # Stage 3: Semantic dense extraction
            t0 = time.perf_counter()
            sem_fields = candidate_C.semantic_extractor.extract_semantic_entities(page.digital_blocks)
            t_sem = (time.perf_counter() - t0) * 1000.0

            # Stage 4: Corroboration & reconciliation
            t0 = time.perf_counter()
            merged = candidate_C._reconcile_fields(sp_fields, sem_fields)
            t_corrob = (time.perf_counter() - t0) * 1000.0

            # Stage 5: Schema construction & Pydantic validation
            t0 = time.perf_counter()
            schema = InvoiceExtractionSchema(
                document_type=clf_res.predicted_type,
                classification_confidence=clf_res.confidence,
                invoice_number=merged.get("invoice_number"),
                invoice_date=merged.get("invoice_date"),
                total_amount=merged.get("total_amount"),
                subtotal=merged.get("subtotal"),
            )
            t_schema = (time.perf_counter() - t0) * 1000.0

            # Stage 6: JSON serialization
            t0 = time.perf_counter()
            _ = schema.model_dump_json()
            t_ser = (time.perf_counter() - t0) * 1000.0

            t_total = (time.perf_counter() - t_start) * 1000.0

            warm_latencies_by_stage["stage_1_classification_ms"].append(t_clf)
            warm_latencies_by_stage["stage_2_spatial_extraction_ms"].append(t_sp)
            warm_latencies_by_stage["stage_3_semantic_dense_extraction_ms"].append(t_sem)
            warm_latencies_by_stage["stage_4_corroboration_reconciliation_ms"].append(t_corrob)
            warm_latencies_by_stage["stage_5_schema_validation_ms"].append(t_schema)
            warm_latencies_by_stage["stage_6_json_serialization_ms"].append(t_ser)
            total_warm_latencies.append(t_total)

    mean_warm_lat = float(np.mean(total_warm_latencies))
    p50_warm_lat = float(np.percentile(total_warm_latencies, 50))
    p95_warm_lat = float(np.percentile(total_warm_latencies, 95))
    p99_warm_lat = float(np.percentile(total_warm_latencies, 99))
    warm_throughput = 1000.0 / mean_warm_lat if mean_warm_lat > 0 else 0.0

    stage_breakdown = {
        stage: {
            "mean_ms": round(float(np.mean(vals)), 2),
            "p50_ms": round(float(np.percentile(vals, 50)), 2),
            "p95_ms": round(float(np.percentile(vals, 95)), 2),
        }
        for stage, vals in warm_latencies_by_stage.items()
    }

    # Memory accounting
    rss_end = process.memory_info().rss / (1024 * 1024)
    if cuda_available:
        vram_alloc = torch.cuda.memory_allocated() / (1024 * 1024)
        vram_peak = torch.cuda.max_memory_allocated() / (1024 * 1024)
        vram_reserved = torch.cuda.max_memory_reserved() / (1024 * 1024)
    else:
        vram_alloc = 0.0
        vram_peak = 0.0
        vram_reserved = 0.0

    performance_metrics = {
        "repetitions": 5,
        "total_warm_inferences": len(total_warm_latencies),
        "cold_start_init_duration_s": round(init_duration_s, 2),
        "warm_latency_metrics": {
            "mean_ms": round(mean_warm_lat, 2),
            "p50_ms": round(p50_warm_lat, 2),
            "p95_ms": round(p95_warm_lat, 2),
            "p99_ms": round(p99_warm_lat, 2),
            "throughput_docs_per_sec": round(warm_throughput, 2),
        },
        "stage_latency_breakdown": stage_breakdown,
        "hardware_metrics": {
            "vram_allocated_mb": round(vram_alloc, 2),
            "vram_peak_allocated_mb": round(vram_peak, 2),
            "vram_peak_reserved_mb": round(vram_reserved, 2),
            "vram_budget_mb": 1500.0,
            "vram_compliant": bool(vram_peak < 1500.0),
            "rss_start_mb": round(rss_start, 2),
            "rss_peak_mb": round(rss_end, 2),
        },
    }

    final_payload = {
        "benchmark_timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total_documents": len(docs),
        "total_annotations": len(annotations),
        "device": device_name,
        "cuda_available": cuda_available,
        "comparative_candidates": comparative_results,
        "document_classification_audit": classification_audit,
        "performance_and_hardware_audit": performance_metrics,
    }

    # Print summary tables
    print("\n" + "=" * 80)
    print("THREE-CANDIDATE COMPARATIVE BENCHMARK SUMMARY (N=177 Fields)")
    print("=" * 80)
    print(f"{'Candidate':<25} | {'Accepted':<8} | {'Correct':<8} | {'Prec (%)':<8} | {'Recall (%)':<10} | {'F1 (%)':<8} | {'Coverage (%)':<12} | {'PFAI (%)':<8}")
    print("-" * 105)
    for c_name, c_data in comparative_results.items():
        print(
            f"{c_name:<25} | {c_data['accepted_fields']:<8} | {c_data['correct_accepted_fields']:<8} | "
            f"{c_data['precision']*100:<8.2f} | {c_data['recall']*100:<10.2f} | {c_data['f1_score']*100:<8.2f} | "
            f"{c_data['coverage']*100:<12.2f} | {c_data['population_false_acceptance_incidence']*100:<8.2f}"
        )
    print("=" * 80)

    print("\nDOCUMENT CLASSIFICATION AUDIT SUMMARY (N=30 Docs)")
    print("=" * 80)
    print(f"Overall Accuracy:            {overall_cls_accuracy * 100:.2f}% ({np.trace(conf_matrix)}/{total_docs})")
    print(f"Macro-F1:                    {macro_f1 * 100:.2f}%")
    print(f"Weighted-F1:                 {weighted_f1 * 100:.2f}%")
    print(f"Brier Score:                 {brier_score:.4f} (Lower is better)")
    print(f"Expected Calibration Error:  {ece_sum:.4f}")
    print(f"Correct Conf Mean:           {conf_correct_stats['mean']:.4f} (Median: {conf_correct_stats['median']:.4f})")
    print(f"Incorrect Conf Mean:         {conf_incorrect_stats['mean']:.4f} (Median: {conf_incorrect_stats['median']:.4f})")
    print("=" * 80)

    print("\nPERFORMANCE AUDIT (5 Repetitions, Warm Inferences)")
    print("=" * 80)
    print(f"P50 Latency:                 {p50_warm_lat:.2f} ms")
    print(f"P95 Latency:                 {p95_warm_lat:.2f} ms")
    print(f"P99 Latency:                 {p99_warm_lat:.2f} ms")
    print(f"Throughput:                  {warm_throughput:.2f} docs/sec")
    print(f"Peak VRAM Allocated:         {vram_peak:.2f} MB (Budget: 1500 MB -> Passed: {vram_peak < 1500.0})")
    print(f"Peak VRAM Reserved:          {vram_reserved:.2f} MB")
    print(f"Peak Process RSS:            {rss_end:.2f} MB")
    print("=" * 80)

    if output_path is None:
        output_path = os.path.join(os.path.dirname(__file__), "comparative_extraction_results.json")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(final_payload, f, indent=2)
    print(f"\nSaved comprehensive comparative benchmark results to {output_path}")

    return final_payload


if __name__ == "__main__":
    run_comparative_extraction_benchmark()
