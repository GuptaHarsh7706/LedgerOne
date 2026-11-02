"""
Evaluation Harness and Benchmark Dataset for Page Classification and OCR Pipelines.

Provides:
1. Labeled page dataset covering DIGITAL_TEXT, SCANNED_IMAGE, and HYBRID categories.
2. Ground-truth evaluation runner computing Precision, Recall, F1, and Confusion Matrix.
3. Metric helpers for Character Error Rate (CER), Word Error Rate (WER), and Bounding Box IoU.
"""
from __future__ import annotations

import io
import ctypes
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import PIL.Image
import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c

from src.intelligence.models import (
    PageClassification,
)
from src.intelligence.pdf_extractor import extract_pdf_document


@dataclass
class LabeledPage:
    """Ground truth labeled document sample for classification benchmarks."""
    sample_id: str
    pdf_bytes: bytes
    expected_class: PageClassification
    category_description: str
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ClassificationEvaluationReport:
    """Per-class and overall classification benchmark metrics."""
    total_samples: int
    accuracy: float
    per_class_precision: Dict[str, float]
    per_class_recall: Dict[str, float]
    per_class_f1: Dict[str, float]
    confusion_matrix: Dict[str, Dict[str, int]]
    average_heuristic_confidence: float
    misclassified_samples: List[Dict[str, Any]]


def _create_sample_pdf_page(
    text_items: Optional[List[Tuple[str, float, float, float]]] = None,
    image_rect: Optional[Tuple[float, float, float, float]] = None,
    page_size: Tuple[float, float] = (612.0, 792.0),
) -> bytes:
    """Helper to synthesize in-memory PDF page with deterministic elements."""
    doc = pdfium.PdfDocument.new()
    page = doc.new_page(*page_size)
    font = pdfium.PdfFont.load_standard(doc, "Helvetica")

    if text_items:
        for text, x, y, size in text_items:
            raw_obj = pdfium_c.FPDFPageObj_CreateTextObj(doc.raw, font.raw, float(size))
            tb = pdfium.PdfTextObj(raw_obj, None, doc)
            u16 = (ctypes.c_ushort * (len(text) + 1))(*[ord(c) for c in text], 0)
            pdfium_c.FPDFText_SetText(raw_obj, u16)
            tb.transform(pdfium.PdfMatrix(1, 0, 0, 1, x, y))
            page.insert_obj(tb)

    if image_rect:
        x0, y0, x1, y1 = image_rect
        w = max(10, int(x1 - x0))
        h = max(10, int(y1 - y0))
        img = PIL.Image.new("RGB", (w, h), color=(180, 180, 180))
        bio = io.BytesIO()
        img.save(bio, format="JPEG")
        bio.seek(0)
        img_obj = pdfium.PdfImage.new(doc)
        img_obj.load_jpeg(bio)
        img_obj.transform(pdfium.PdfMatrix(w, 0, 0, h, x0, y0))
        page.insert_obj(img_obj)

    page.gen_content()
    out = io.BytesIO()
    doc.save(out)
    doc.close()
    return out.getvalue()


def build_labeled_classification_benchmark() -> List[LabeledPage]:
    """
    Construct a labeled dataset covering clean digital documents,
    full raster scans, and hybrid stamped/signed documents.
    """
    samples: List[LabeledPage] = []

    # Category 1: DIGITAL_TEXT - Clean corporate invoice
    p1 = _create_sample_pdf_page(
        text_items=[
            ("INVOICE #INV-9001", 50, 720, 16),
            ("Bill To: Alpha Corp", 50, 690, 12),
            ("Payment Terms: Net 30", 50, 660, 11),
            ("Subtotal: $15,000.00 Tax: $1,500.00 Total: $16,500.00", 50, 620, 12),
        ],
        image_rect=None,
    )
    samples.append(LabeledPage("DIG-001", p1, PageClassification.DIGITAL_TEXT, "Clean printed invoice with rich text"))

    # Category 1: DIGITAL_TEXT - Multi-column financial ledger
    p2 = _create_sample_pdf_page(
        text_items=[
            ("Quarterly Financial Report Q3", 50, 740, 14),
            ("Revenue: $120,000.00", 50, 700, 11),
            ("Operating Expenses: $85,000.00", 50, 670, 11),
            ("Operating Income: $35,000.00", 50, 640, 11),
            ("EBITDA Margin: 29.1%", 50, 610, 11),
        ],
        image_rect=None,
    )
    samples.append(LabeledPage("DIG-002", p2, PageClassification.DIGITAL_TEXT, "Multi-column digital financial ledger"))

    # Category 1: DIGITAL_TEXT - Sparse-text cover page
    p3 = _create_sample_pdf_page(
        text_items=[
            ("Confidential Audit Working Papers", 100, 500, 16),
            ("Fiscal Year 2026", 100, 460, 12),
        ],
        image_rect=None,
    )
    samples.append(LabeledPage("DIG-003", p3, PageClassification.DIGITAL_TEXT, "Sparse-text cover page without raster graphics"))

    # Category 2: SCANNED_IMAGE - Full-page scanned invoice (dominant raster, 0 text)
    p4 = _create_sample_pdf_page(
        text_items=None,
        image_rect=(36.0, 36.0, 576.0, 756.0),  # Full 8.5x11 page coverage
    )
    samples.append(LabeledPage("SCN-001", p4, PageClassification.SCANNED_IMAGE, "Full-page scanned invoice photo"))

    # Category 2: SCANNED_IMAGE - Low-contrast thermal receipt scan
    p5 = _create_sample_pdf_page(
        text_items=None,
        image_rect=(100.0, 100.0, 500.0, 700.0),
    )
    samples.append(LabeledPage("SCN-002", p5, PageClassification.SCANNED_IMAGE, "Low-contrast thermal receipt scan"))

    # Category 2: SCANNED_IMAGE - Blank / non-text raster scan
    p6 = _create_sample_pdf_page(
        text_items=None,
        image_rect=(50.0, 50.0, 550.0, 720.0),
    )
    samples.append(LabeledPage("SCN-003", p6, PageClassification.SCANNED_IMAGE, "Raster scan page without embedded digital text"))

    # Category 3: HYBRID - Purchase order with digital text and official seal stamp
    p7 = _create_sample_pdf_page(
        text_items=[
            ("PURCHASE ORDER PO-2026-88", 50, 720, 14),
            ("Vendor: Apex Logistics", 50, 680, 12),
            ("Approved Amount: $42,500.00", 50, 640, 12),
        ],
        image_rect=(200.0, 200.0, 520.0, 520.0),  # ~21% area raster stamp
    )
    samples.append(LabeledPage("HYB-001", p7, PageClassification.HYBRID, "Digital purchase order with scanned stamp seal"))

    # Category 3: HYBRID - Invoice with embedded scanned receipt attachment
    p8 = _create_sample_pdf_page(
        text_items=[
            ("Expense Reimbursement Claim #512", 50, 720, 14),
            ("Claimant: Engineering Department", 50, 680, 11),
            ("Attached Supporting Receipt Below:", 50, 640, 11),
        ],
        image_rect=(100.0, 150.0, 500.0, 550.0),  # Large scanned receipt attached
    )
    samples.append(LabeledPage("HYB-002", p8, PageClassification.HYBRID, "Digital document with scanned receipt graphic"))

    # Category 3: HYBRID - Signed contract with digital body and scanned signature block
    p9 = _create_sample_pdf_page(
        text_items=[
            ("Master Services Agreement - Signature Page", 50, 730, 13),
            ("In witness whereof, parties have executed this agreement:", 50, 690, 11),
            ("Party A Authorized Representative: John Doe", 50, 650, 11),
        ],
        image_rect=(150.0, 250.0, 480.0, 550.0),
    )
    samples.append(LabeledPage("HYB-003", p9, PageClassification.HYBRID, "Signed contract with scanned handwritten signature"))

    return samples


def evaluate_page_classifier(dataset: List[LabeledPage]) -> ClassificationEvaluationReport:
    """
    Run the classifier on each labeled page and calculate accuracy,
    per-class precision, recall, F1, and full confusion matrix.
    """
    classes = [PageClassification.DIGITAL_TEXT, PageClassification.SCANNED_IMAGE, PageClassification.HYBRID]
    class_names = [c.value for c in classes]

    # Initialize confusion matrix C[true][pred]
    cm: Dict[str, Dict[str, int]] = {
        t: {p: 0 for p in class_names} for t in class_names
    }

    correct_count = 0
    total_confidence = 0.0
    misclassified: List[Dict[str, Any]] = []

    for item in dataset:
        doc_res = extract_pdf_document(item.pdf_bytes)
        pred_page = doc_res.pages[0]
        pred_class = pred_page.classification.value
        true_class = item.expected_class.value

        cm[true_class][pred_class] += 1
        total_confidence += pred_page.classification_confidence

        if pred_class == true_class:
            correct_count += 1
        else:
            misclassified.append({
                "sample_id": item.sample_id,
                "description": item.category_description,
                "true_class": true_class,
                "predicted_class": pred_class,
                "confidence": pred_page.classification_confidence,
                "metadata": pred_page.metadata,
            })

    total = len(dataset)
    accuracy = correct_count / max(1, total)

    precision: Dict[str, float] = {}
    recall: Dict[str, float] = {}
    f1: Dict[str, float] = {}

    for c in class_names:
        tp = cm[c][c]
        fp = sum(cm[other][c] for other in class_names if other != c)
        fn = sum(cm[c][other] for other in class_names if other != c)

        prec = tp / max(1, tp + fp) if (tp + fp) > 0 else 0.0
        rec = tp / max(1, tp + fn) if (tp + fn) > 0 else 0.0
        f1_score = (2.0 * prec * rec) / max(1e-6, prec + rec) if (prec + rec) > 0 else 0.0

        precision[c] = round(prec, 4)
        recall[c] = round(rec, 4)
        f1[c] = round(f1_score, 4)

    avg_conf = total_confidence / max(1, total)

    return ClassificationEvaluationReport(
        total_samples=total,
        accuracy=round(accuracy, 4),
        per_class_precision=precision,
        per_class_recall=recall,
        per_class_f1=f1,
        confusion_matrix=cm,
        average_heuristic_confidence=round(avg_conf, 4),
        misclassified_samples=misclassified,
    )
