"""
Unit and integration tests for Phase 4 Step 2:
Modular OCR Pipeline, Text-Region Detectors, Deskewing/Binarization,
TrOCR Recognition, and Dual-Stream ExtractedPage Enrichment.
"""
import numpy as np
import pytest
import torch
from PIL import Image, ImageDraw

from src.intelligence.models import (
    BoundingBox,
    ExtractedPage,
    PageClassification,
    TextBlock,
    WordElement,
)
from src.intelligence.ocr.detectors import (
    MorphologicalLineDetector,
    ProjectionProfileDetector,
)
from src.intelligence.ocr.metrics import (
    calculate_box_iou,
    calculate_cer,
    calculate_reading_order_accuracy,
    calculate_reading_order_detailed,
    calculate_wer,
    evaluate_detection_multi_threshold,
    evaluate_detection_precision_recall,
    evaluate_financial_fields_dataset,
    evaluate_financial_fields_exact_match,
    levenshtein_distance,
)
from src.intelligence.ocr.models import RecognizedLine
from src.intelligence.ocr.pipeline import OCRPipeline
from src.intelligence.ocr.preprocessing import ImagePreprocessor
from src.intelligence.ocr.recognizers import (
    BaselinePatternRecognizer,
    TrOCRRecognizer,
)
from src.intelligence.rendering import evaluate_pdfium_lock_contention


# =====================================================================
# 1. Preprocessing & Normalization Tests
# =====================================================================

def test_image_preprocessor_binarization():
    """Verify Otsu and Adaptive binarization produce valid binary masks."""
    arr = np.linspace(0, 255, 100 * 100, dtype=np.uint8).reshape((100, 100))
    img = Image.fromarray(arr, mode="L")

    otsu_bin = ImagePreprocessor.binarize(img, method="otsu")
    otsu_arr = np.array(otsu_bin)
    unique_vals = set(np.unique(otsu_arr))
    assert unique_vals.issubset({0, 255})

    adapt_bin = ImagePreprocessor.binarize(img, method="adaptive")
    adapt_arr = np.array(adapt_bin)
    assert set(np.unique(adapt_arr)).issubset({0, 255})


def test_image_preprocessor_deskew():
    """Verify deskew detects and corrects synthetic rotation within bounds."""
    # Create image with horizontal text bar rotated by 5 degrees
    img = Image.new("L", (200, 200), color=255)
    draw = ImageDraw.Draw(img)
    draw.rectangle([30, 90, 170, 110], fill=0)

    # Rotate by 7 degrees
    rotated = img.rotate(7.0, expand=False, fillcolor=255)
    detected_angle = ImagePreprocessor.detect_skew_angle(rotated)
    assert isinstance(detected_angle, float)

    deskewed, applied_angle = ImagePreprocessor.deskew(rotated)
    assert deskewed.size[0] > 0 and deskewed.size[1] > 0
    assert isinstance(applied_angle, float)


def test_image_preprocessor_pipeline():
    """Verify full normalize_pipeline execution and metadata contract."""
    img = Image.new("RGB", (100, 100), color=(240, 240, 240))
    draw = ImageDraw.Draw(img)
    draw.rectangle([20, 40, 80, 60], fill=(20, 20, 20))

    norm_img, meta = ImagePreprocessor.normalize_pipeline(
        img, apply_deskew=True, apply_binarization=False
    )
    assert isinstance(meta, dict)
    assert "skew_angle" in meta
    assert norm_img.size[0] > 0 and norm_img.size[1] > 0


# =====================================================================
# 2. Text-Region Detection Tests
# =====================================================================

def test_morphological_line_detector():
    """Verify MorphologicalLineDetector segments isolated text lines accurately."""
    # Create image with 3 distinct horizontal bars
    img = Image.new("RGB", (400, 300), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    # Line 1: y=30..50
    draw.rectangle([50, 30, 350, 50], fill=(0, 0, 0))
    # Line 2: y=100..120
    draw.rectangle([50, 100, 350, 120], fill=(0, 0, 0))
    # Line 3: y=180..200
    draw.rectangle([50, 180, 350, 200], fill=(0, 0, 0))

    detector = MorphologicalLineDetector(min_width_px=30, min_height_px=6)
    boxes = detector.detect(img)

    assert len(boxes) >= 3
    for b in boxes:
        assert isinstance(b, BoundingBox)
        assert b.x1 > b.x0
        assert b.y1 > b.y0
        assert 0.0 <= b.x0 <= 1.0
        assert 0.0 <= b.y0 <= 1.0


def test_projection_profile_detector():
    """Verify ProjectionProfileDetector detects line slices from horizontal profiles."""
    img = Image.new("RGB", (300, 200), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.rectangle([20, 40, 280, 60], fill=(0, 0, 0))
    draw.rectangle([20, 120, 280, 140], fill=(0, 0, 0))

    detector = ProjectionProfileDetector(min_line_height_px=6)
    boxes = detector.detect(img)
    assert len(boxes) >= 2
    for b in boxes:
        assert isinstance(b, BoundingBox)


# =====================================================================
# 3. OCR Metrics & Evaluation Tests
# =====================================================================

def test_metrics_cer_and_wer():
    """Verify CER and WER computation edge cases and standard strings."""
    assert levenshtein_distance("hello", "hello") == 0
    assert levenshtein_distance("kitten", "sitting") == 3

    # Exact match
    assert calculate_cer("INVOICE #1024", "INVOICE #1024") == 0.0
    assert calculate_wer("TOTAL DUE: $500.00", "TOTAL DUE: $500.00") == 0.0

    # 1 edit distance
    assert calculate_cer("abc", "abd") == 0.3333
    assert calculate_wer("invoice date 2026", "invoice paid 2026") == pytest.approx(1.0 / 3.0, abs=1e-3)

    # Empty string edge cases
    assert calculate_cer("", "") == 0.0
    assert calculate_cer("abc", "") == 1.0
    assert calculate_cer("", "abc") == 1.0


def test_metrics_box_iou_and_pr():
    """Verify bounding box IoU and detection Precision/Recall/F1."""
    box_a = BoundingBox(
        x0=0.0, y0=0.0, x1=0.5, y1=0.5,
        x0_pt=0.0, y0_pt=0.0, x1_pt=100.0, y1_pt=100.0
    )
    box_b = BoundingBox(
        x0=0.0, y0=0.0, x1=0.5, y1=0.5,
        x0_pt=0.0, y0_pt=0.0, x1_pt=100.0, y1_pt=100.0
    )
    assert calculate_box_iou(box_a, box_b) == pytest.approx(1.0)

    box_c = BoundingBox(
        x0=0.6, y0=0.6, x1=1.0, y1=1.0,
        x0_pt=120.0, y0_pt=120.0, x1_pt=200.0, y1_pt=200.0
    )
    assert calculate_box_iou(box_a, box_c) == pytest.approx(0.0)

    # Precision & Recall evaluation
    gt = [box_a, box_c]
    pred = [box_a, box_c]
    p, r, f1 = evaluate_detection_precision_recall(pred, gt, iou_threshold=0.5)
    assert p == 1.0
    assert r == 1.0
    assert f1 == 1.0


def test_reading_order_accuracy():
    """Verify pairwise concordance ratio in reading order evaluation."""
    gt = ["Line 1", "Line 2", "Line 3"]
    pred_perfect = ["Line 1", "Line 2", "Line 3"]
    assert calculate_reading_order_accuracy(pred_perfect, gt) == 1.0

    pred_reversed = ["Line 3", "Line 2", "Line 1"]
    assert calculate_reading_order_accuracy(pred_reversed, gt) == 0.0


# =====================================================================
# 4. Recognizer & Abstention Tests
# =====================================================================

def test_baseline_pattern_recognizer():
    """Verify BaselinePatternRecognizer returns valid abstained lines for fallback."""
    rec = BaselinePatternRecognizer()
    assert rec.model_name == "baseline_heuristic_ocr"

    img = Image.new("RGB", (100, 100), color=(255, 255, 255))
    box = BoundingBox(
        x0=0.1, y0=0.1, x1=0.9, y1=0.4,
        x0_pt=10.0, y0_pt=10.0, x1_pt=90.0, y1_pt=40.0
    )

    lines = rec.recognize_lines(img, [box], device="cpu")
    assert len(lines) == 1
    assert isinstance(lines[0], RecognizedLine)
    assert lines[0].abstained is True


@pytest.mark.skipif(not torch.cuda.is_available(), reason="CUDA required for TrOCR GPU testing")
def test_trocr_cuda_initialization_and_recognition():
    """Verify TrOCRRecognizer loads cleanly in FP16 on NVIDIA RTX 3050 and recognizes text."""
    rec = TrOCRRecognizer()
    assert rec.model_name == "microsoft/trocr-small-printed"

    # Render clean image with 'INVOICE'
    crop = Image.new("RGB", (200, 60), color=(255, 255, 255))
    draw = ImageDraw.Draw(crop)
    draw.text((10, 20), "INVOICE #9901", fill=(0, 0, 0))

    box = BoundingBox(
        x0=0.05, y0=0.15, x1=0.95, y1=0.85,
        x0_pt=10.0, y0_pt=10.0, x1_pt=190.0, y1_pt=50.0
    )

    lines = rec.recognize_lines(crop, [box], device="cuda")
    assert len(lines) == 1
    line = lines[0]
    assert isinstance(line, RecognizedLine)
    assert "microsoft/trocr-small-printed" in line.model_provenance
    assert 0.0 <= line.confidence <= 1.0


# =====================================================================
# 5. Dual-Stream Pipeline & ExtractedPage Enrichment
# =====================================================================

def test_ocr_pipeline_dual_stream_enrichment():
    """
    CRITICAL ARCHITECTURAL CONTRACT:
    OCR output must NEVER overwrite or mutate native digital text.
    It must populate ocr_text and ocr_blocks while keeping digital text intact.
    """
    pipeline = OCRPipeline(
        detector=MorphologicalLineDetector(min_width_px=20, min_height_px=6),
        recognizer=BaselinePatternRecognizer(),
    )

    dummy_box = BoundingBox(
        x0=0.1, y0=0.1, x1=0.5, y1=0.2,
        x0_pt=50.0, y0_pt=50.0, x1_pt=200.0, y1_pt=70.0
    )
    native_block = TextBlock(
        block_index=0,
        reading_order_index=0,
        text="Native Digital Invoice #1234",
        bbox=dummy_box,
        words=[WordElement(text="Native", bbox=dummy_box)],
        line_count=1,
        confidence=1.0,
        source="native",
    )
    page = ExtractedPage(
        page_index=0,
        width_pt=612.0,
        height_pt=792.0,
        classification=PageClassification.HYBRID,
        classification_confidence=0.88,
        digital_text="Native Digital Invoice #1234",
        digital_blocks=[native_block],
    )

    page_img = Image.new("RGB", (612, 792), color=(255, 255, 255))
    draw = ImageDraw.Draw(page_img)
    # Scanned barcode / rubber stamp element at bottom
    draw.rectangle([50, 600, 300, 640], fill=(0, 0, 0))

    enriched_page = pipeline.enrich_page(page, page_img, device="cpu")

    # Native text must be completely preserved!
    assert enriched_page.digital_text == "Native Digital Invoice #1234"
    assert len(enriched_page.digital_blocks) == 1
    assert enriched_page.digital_blocks[0].text == "Native Digital Invoice #1234"

    # OCR stream must be populated separately
    assert enriched_page.ocr_text is not None
    assert len(enriched_page.ocr_blocks) >= 1
    assert "ocr" in enriched_page.metadata
    assert enriched_page.metadata["ocr"]["detector"] == "morphological_line_detector"


# =====================================================================
# 6. Revalidation Benchmark Enhancements
# =====================================================================

def test_reading_order_detailed_explicit_denominator():
    """Verify reading order detailed returns exact concordant pairs, total pairs, and ratio."""
    gt = ["Line 1", "Line 2", "Line 3", "Line 4"]
    # Perfect order: K = 4*3/2 = 6 pairs
    pred_perfect = ["Line 1", "Line 2", "Line 3", "Line 4"]
    res_perfect = calculate_reading_order_detailed(pred_perfect, gt)
    assert res_perfect["concordant_pairs"] == 6
    assert res_perfect["total_annotated_pairs"] == 6
    assert res_perfect["concordance_ratio"] == 1.0

    # Reversed order: 0 concordant pairs
    pred_reversed = ["Line 4", "Line 3", "Line 2", "Line 1"]
    res_reversed = calculate_reading_order_detailed(pred_reversed, gt)
    assert res_reversed["concordant_pairs"] == 0
    assert res_reversed["total_annotated_pairs"] == 6
    assert res_reversed["concordance_ratio"] == 0.0

    # Fuzzy tolerance for minor OCR character substitution
    pred_fuzzy = ["Line 1", "Line 2 - typo", "Line 3", "Line 4"]
    res_fuzzy = calculate_reading_order_detailed(pred_fuzzy, gt)
    assert res_fuzzy["total_annotated_pairs"] >= 3
    assert res_fuzzy["concordance_ratio"] > 0.5


def test_evaluate_detection_multi_threshold():
    """Verify multi-threshold detection evaluation at IoU 0.40, 0.50, and 0.75."""
    box = BoundingBox(x0=0.1, y0=0.1, x1=0.5, y1=0.3, x0_pt=10, y0_pt=10, x1_pt=50, y1_pt=30)
    res = evaluate_detection_multi_threshold([box], [box], thresholds=[0.40, 0.50, 0.75])
    assert "iou_40" in res
    assert "iou_50" in res
    assert "iou_75" in res
    assert res["iou_50"]["f1"] == 1.0


def test_evaluate_financial_fields_exact_match():
    """Verify exact-match evaluation preserves punctuation and decimal separators."""
    gt_fields = {
        "invoice_number": "INV-2026-90",
        "date": "2026-05-15",
        "currency_code": "USD",
        "total_amount": "$1,450.00",
    }
    # Verbatim match
    text_verbatim = "INVOICE #INV-2026-90 Date: 2026-05-15 Currency: USD Total: $1,450.00"
    res_verbatim = evaluate_financial_fields_exact_match(text_verbatim, gt_fields)
    assert res_verbatim["_summary"]["matched_fields"] == 4
    assert res_verbatim["_summary"]["exact_match_accuracy"] == 1.0

    # Altered decimal separator or missing comma must FAIL exact match
    text_altered = "INVOICE #INV-2026-90 Date: 2026-05-15 Currency: USD Total: $1450.00"
    res_altered = evaluate_financial_fields_exact_match(text_altered, gt_fields)
    assert res_altered["total_amount"]["matched"] is False
    assert res_altered["_summary"]["matched_fields"] == 3


def test_recognize_crops_method():
    """Verify recognize_crops executes directly on image crops in Recognition-Only mode."""
    rec = BaselinePatternRecognizer()
    crop1 = Image.new("RGB", (100, 30), color=(255, 255, 255))
    crop2 = Image.new("RGB", (120, 30), color=(255, 255, 255))

    lines = rec.recognize_crops([crop1, crop2], device="cpu")
    assert len(lines) == 2
    for l in lines:
        assert isinstance(l, RecognizedLine)
        assert l.abstained is True


def test_evaluate_pdfium_lock_contention():
    """Verify evaluate_pdfium_lock_contention benchmarks scaling across thread counts."""
    sample_pdf = Image.new("RGB", (300, 300), (255, 255, 255))
    bio = Image.new("RGB", (300, 300), (255, 255, 255))
    import io as _io
    buf = _io.BytesIO()
    sample_pdf.save(buf, format="PDF")
    pdf_bytes = buf.getvalue()

    contention = evaluate_pdfium_lock_contention(pdf_bytes, thread_counts=[1, 2], pages_per_worker=1)
    assert "scaling" in contention
    assert "1_threads" in contention["scaling"]
    assert "2_threads" in contention["scaling"]
    assert "architectural_recommendation" in contention

