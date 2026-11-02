"""
Comprehensive OCR and Text Detection Benchmark Suite.

Evaluates:
- Detectors: MorphologicalLineDetector vs. ProjectionProfileDetector
- Recognizers: TrOCRRecognizer (CPU FP32 vs. NVIDIA RTX 3050 GPU FP16) vs. Baseline
- End-to-End Pipeline on Representative Financial Documents
Measures: CER, WER, Detection Precision/Recall/IoU, Reading Order, P50/P95 Latency,
Peak Process RSS (psutil), Peak GPU VRAM, Throughput, and Abstention Rates.
"""
from __future__ import annotations

import io
import json
import os
import sys
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Tuple

import cv2
import numpy as np
import PIL.Image
import PIL.ImageDraw
import PIL.ImageFont
import psutil
import torch

# Ensure LedgerOne root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.intelligence.models import BoundingBox
from src.intelligence.ocr.detectors import MorphologicalLineDetector, ProjectionProfileDetector
from src.intelligence.ocr.metrics import (
    calculate_cer,
    calculate_reading_order_accuracy,
    calculate_wer,
    evaluate_detection_precision_recall,
)
from src.intelligence.ocr.pipeline import OCRPipeline
from src.intelligence.ocr.recognizers import BaselinePatternRecognizer, TrOCRRecognizer


@dataclass
class BenchmarkDocument:
    """Document sample for OCR benchmark evaluation with ground truth."""
    doc_id: str
    category: str
    description: str
    image: PIL.Image.Image
    ground_truth_lines: List[str]
    ground_truth_boxes: List[BoundingBox]


def _build_synthetic_line_image(
    lines: List[Tuple[str, int, int, int]],  # (text, x, y, font_size)
    image_size: Tuple[int, int] = (600, 300),
    bg_color: Tuple[int, int, int] = (255, 255, 255),
    text_color: Tuple[int, int, int] = (0, 0, 0),
    add_skew_angle: float = 0.0,
    add_noise: bool = False,
    stamp_rect: Tuple[int, int, int, int] = None,
) -> Tuple[PIL.Image.Image, List[BoundingBox]]:
    """Synthesize image with text lines and exact ground truth bounding boxes."""
    img = PIL.Image.new("RGB", image_size, color=bg_color)
    draw = PIL.ImageDraw.Draw(img)

    boxes: List[BoundingBox] = []
    w_img, h_img = image_size

    for text, x, y, size in lines:
        draw.text((x, y), text, fill=text_color)
        # Approximate bounding box for PIL default font
        char_w = 6.0
        line_w = len(text) * char_w
        line_h = 12.0
        x0, y0 = float(x), float(y)
        x1, y1 = float(x + line_w), float(y + line_h)

        norm_x0 = max(0.0, min(1.0, x0 / w_img))
        norm_y0 = max(0.0, min(1.0, y0 / h_img))
        norm_x1 = max(0.0, min(1.0, x1 / w_img))
        norm_y1 = max(0.0, min(1.0, y1 / h_img))

        boxes.append(
            BoundingBox(
                x0=norm_x0,
                y0=norm_y0,
                x1=norm_x1,
                y1=norm_y1,
                x0_pt=norm_x0 * 612.0,
                y0_pt=norm_y0 * 792.0,
                x1_pt=norm_x1 * 612.0,
                y1_pt=norm_y1 * 792.0,
            )
        )

    if stamp_rect:
        sx0, sy0, sx1, sy1 = stamp_rect
        draw.rectangle([sx0, sy0, sx1, sy1], outline=(200, 50, 50), width=3)
        draw.text((sx0 + 10, sy0 + 10), "OFFICIAL SEAL - APPROVED", fill=(200, 50, 50))

    if add_noise:
        # Add subtle pepper noise
        arr = np.array(img)
        noise = np.random.randint(0, 30, arr.shape, dtype=np.uint8)
        arr = np.clip(arr.astype(int) - noise.astype(int), 0, 255).astype(np.uint8)
        img = PIL.Image.fromarray(arr)

    if abs(add_skew_angle) > 0.1:
        # Rotate image with white border
        arr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        h, w = arr.shape[:2]
        m = cv2.getRotationMatrix2D((w // 2, h // 2), add_skew_angle, 1.0)
        rotated = cv2.warpAffine(arr, m, (w, h), borderValue=(255, 255, 255))
        img = PIL.Image.fromarray(cv2.cvtColor(rotated, cv2.COLOR_BGR2RGB))

    return img, boxes


def build_ocr_benchmark_dataset() -> List[BenchmarkDocument]:
    """
    Construct the 8-category benchmark dataset covering representative financial documents.
    """
    dataset: List[BenchmarkDocument] = []

    # 1. Clean Printed Invoice
    lines_1 = [
        ("INVOICE #INV-2026-0042", 30, 30, 14),
        ("Vendor: Acme Global Technologies", 30, 70, 12),
        ("Subtotal: $14,500.00", 30, 110, 12),
        ("Tax Amount: $1,450.00", 30, 140, 12),
        ("Total Due: $15,950.00", 30, 170, 14),
    ]
    img_1, bboxes_1 = _build_synthetic_line_image(lines_1, image_size=(500, 240))
    dataset.append(
        BenchmarkDocument(
            doc_id="DOC-01-CLEAN-INVOICE",
            category="Clean Printed Invoice",
            description="High-contrast standard invoice with header, line items, and totals",
            image=img_1,
            ground_truth_lines=[l[0] for l in lines_1],
            ground_truth_boxes=bboxes_1,
        )
    )

    # 2. Low-Contrast Thermal Receipt
    lines_2 = [
        ("COFFEE SHOP #41", 30, 20, 12),
        ("1x Espresso Roast $4.50", 30, 50, 11),
        ("1x Croissant $3.75", 30, 80, 11),
        ("Tax $0.66", 30, 110, 11),
        ("Total $8.91", 30, 140, 12),
    ]
    img_2, bboxes_2 = _build_synthetic_line_image(
        lines_2,
        image_size=(350, 200),
        bg_color=(235, 235, 230),  # Grayish background
        text_color=(70, 70, 70),   # Faded gray text
        add_noise=True,
    )
    dataset.append(
        BenchmarkDocument(
            doc_id="DOC-02-LOW-CONTRAST-RECEIPT",
            category="Low-Contrast Receipt",
            description="Thermal paper receipt with gray background and faded low-contrast text",
            image=img_2,
            ground_truth_lines=[l[0] for l in lines_2],
            ground_truth_boxes=bboxes_2,
        )
    )

    # 3. Skewed Invoice (3.5 degrees)
    lines_3 = [
        ("PURCHASE ORDER PO-8812", 40, 30, 14),
        ("Delivery Date: 2026-06-15", 40, 70, 11),
        ("Amount: $64,200.00", 40, 110, 12),
    ]
    img_3, bboxes_3 = _build_synthetic_line_image(
        lines_3, image_size=(450, 180), add_skew_angle=3.5
    )
    dataset.append(
        BenchmarkDocument(
            doc_id="DOC-03-SKEWED-INVOICE",
            category="Skewed Document",
            description="Document scanned at 3.5 degree skew angle requiring deskew preprocessing",
            image=img_3,
            ground_truth_lines=[l[0] for l in lines_3],
            ground_truth_boxes=bboxes_3,
        )
    )

    # 4. Multi-Column Financial Report
    lines_4 = [
        ("Bill To: Alpha Logistics Corp", 20, 30, 12),
        ("Ship To: Beta Harbor LLC", 280, 30, 12),
        ("100 Industrial Road", 20, 70, 11),
        ("500 Harbor Boulevard", 280, 70, 11),
        ("San Francisco CA 94105", 20, 110, 11),
        ("Seattle WA 98101", 280, 110, 11),
    ]
    img_4, bboxes_4 = _build_synthetic_line_image(lines_4, image_size=(560, 180))
    # Ground truth reading order: Left Column completely before Right Column
    gt_order_4 = [
        "Bill To: Alpha Logistics Corp",
        "100 Industrial Road",
        "San Francisco CA 94105",
        "Ship To: Beta Harbor LLC",
        "500 Harbor Boulevard",
        "Seattle WA 98101",
    ]
    dataset.append(
        BenchmarkDocument(
            doc_id="DOC-04-MULTI-COLUMN",
            category="Multi-Column Report",
            description="Side-by-side two-column address blocks requiring XY-Cut reading order sorting",
            image=img_4,
            ground_truth_lines=gt_order_4,
            ground_truth_boxes=bboxes_4,
        )
    )

    # 5. Small-Font Dense Tax Schedule (8pt equivalent)
    lines_5 = [
        ("Line 1 Gross Receipts: $1,250,400.00", 20, 20, 9),
        ("Line 2 Cost of Goods Sold: $820,150.00", 20, 45, 9),
        ("Line 3 Gross Profit: $430,250.00", 20, 70, 9),
        ("Line 4 Operating Expenses: $215,100.00", 20, 95, 9),
        ("Line 5 Net Income Before Taxes: $215,150.00", 20, 120, 9),
    ]
    img_5, bboxes_5 = _build_synthetic_line_image(lines_5, image_size=(480, 160))
    dataset.append(
        BenchmarkDocument(
            doc_id="DOC-05-SMALL-FONT",
            category="Small-Font Financial Schedule",
            description="Dense financial tax schedule with small line height and compact spacing",
            image=img_5,
            ground_truth_lines=[l[0] for l in lines_5],
            ground_truth_boxes=bboxes_5,
        )
    )

    # 6. Document with Stamp Seal
    lines_6 = [
        ("EXECUTIVE APPROVAL MEMORANDUM", 30, 30, 14),
        ("Project LedgerOne AI Engine Authorization", 30, 70, 12),
        ("Authorized Disbursement: $95,000.00", 30, 110, 12),
    ]
    img_6, bboxes_6 = _build_synthetic_line_image(
        lines_6, image_size=(550, 240), stamp_rect=(320, 40, 520, 140)
    )
    dataset.append(
        BenchmarkDocument(
            doc_id="DOC-06-STAMP-SEAL",
            category="Document with Stamp/Seal",
            description="Official document containing a red approval stamp bounding box",
            image=img_6,
            ground_truth_lines=[l[0] for l in lines_6],
            ground_truth_boxes=bboxes_6,
        )
    )

    # 7. Borderless Table Document
    lines_7 = [
        ("Item Description Qty Unit Price Total", 20, 25, 12),
        ("Enterprise Server License 2 $5,000.00 $10,000.00", 20, 60, 11),
        ("Maintenance & Support 1 $2,500.00 $2,500.00", 20, 95, 11),
        ("Total Invoice Amount $12,500.00", 20, 130, 12),
    ]
    img_7, bboxes_7 = _build_synthetic_line_image(lines_7, image_size=(520, 180))
    dataset.append(
        BenchmarkDocument(
            doc_id="DOC-07-BORDERLESS-TABLE",
            category="Borderless Financial Table",
            description="Tabular ledger rows aligned horizontally without physical border lines",
            image=img_7,
            ground_truth_lines=[l[0] for l in lines_7],
            ground_truth_boxes=bboxes_7,
        )
    )

    # 8. Blank / Non-Text Image
    blank_img = PIL.Image.new("RGB", (300, 150), color=(255, 255, 255))
    dataset.append(
        BenchmarkDocument(
            doc_id="DOC-08-BLANK-PAGE",
            category="Blank / Artifact Page",
            description="White page without text to evaluate false positive detection and abstention",
            image=blank_img,
            ground_truth_lines=[],
            ground_truth_boxes=[],
        )
    )

    return dataset


def run_benchmark() -> Dict[str, Any]:
    """Execute complete comparative benchmark and return structured results."""
    print("=================================================================")
    print("LedgerOne Phase 4 Step 2: Scanned-Page Detection & OCR Benchmark")
    print("=================================================================")

    process = psutil.Process()
    initial_rss_mb = process.memory_info().rss / (1024 * 1024)
    cuda_available = torch.cuda.is_available()
    device_name = torch.cuda.get_device_name(0) if cuda_available else "CPU Only"
    print(f"Host Hardware: CUDA={cuda_available}, Device='{device_name}'")
    print(f"Process Baseline RSS: {initial_rss_mb:.1f} MB")

    dataset = build_ocr_benchmark_dataset()
    print(f"Evaluation Dataset: {len(dataset)} representative documents assembled.")

    # -------------------------------------------------------------
    # 1. Detector Benchmark: Morphological vs. Projection Profile
    # -------------------------------------------------------------
    print("\n--- [Phase A: Text-Region Detector Benchmark] ---")
    detectors = [
        MorphologicalLineDetector(),
        ProjectionProfileDetector(),
    ]
    detector_results: Dict[str, Any] = {}

    for det in detectors:
        name = det.detector_name
        precisions = []
        recalls = []
        f1s = []
        latencies_ms = []

        for doc in dataset:
            t0 = time.perf_counter()
            pred_boxes = det.detect(doc.image)
            dt_ms = (time.perf_counter() - t0) * 1000.0
            latencies_ms.append(dt_ms)

            p, r, f = evaluate_detection_precision_recall(pred_boxes, doc.ground_truth_boxes)
            precisions.append(p)
            recalls.append(r)
            f1s.append(f)

        p50 = float(np.percentile(latencies_ms, 50))
        p95 = float(np.percentile(latencies_ms, 95))
        avg_f1 = float(np.mean(f1s))

        detector_results[name] = {
            "avg_precision": round(float(np.mean(precisions)), 4),
            "avg_recall": round(float(np.mean(recalls)), 4),
            "avg_f1": round(avg_f1, 4),
            "p50_latency_ms": round(p50, 2),
            "p95_latency_ms": round(p95, 2),
            "throughput_pages_per_sec": round(1000.0 / max(0.1, float(np.mean(latencies_ms))), 1),
        }
        print(f"Detector [{name}]: F1={avg_f1:.3f}, P50={p50:.2f}ms, P95={p95:.2f}ms")

    # -------------------------------------------------------------
    # 2. Recognizer Benchmark: TrOCR (CPU vs. GPU) vs. Baseline
    # -------------------------------------------------------------
    print("\n--- [Phase B: Text Recognizer Benchmark] ---")
    trocr = TrOCRRecognizer()

    # Pre-measure model loading time
    t_load_0 = time.perf_counter()
    trocr.load_model("cpu")
    cpu_load_time = time.perf_counter() - t_load_0
    print(f"TrOCR CPU model load time: {cpu_load_time:.2f}s")

    gpu_load_time = 0.0
    if cuda_available:
        t_gpu_0 = time.perf_counter()
        trocr.load_model("cuda")
        gpu_load_time = time.perf_counter() - t_gpu_0
        print(f"TrOCR CUDA FP16 model load time: {gpu_load_time:.2f}s")

    recognizer_evaluations = [
        ("TrOCR (CPU FP32)", trocr, "cpu"),
        ("Baseline Pattern Recognizer", BaselinePatternRecognizer(), "cpu"),
    ]
    if cuda_available:
        recognizer_evaluations.append(("TrOCR (RTX 3050 GPU FP16)", trocr, "cuda"))

    recognizer_results: Dict[str, Any] = {}

    for label, rec, dev in recognizer_evaluations:
        cers = []
        wers = []
        latencies_ms = []
        abstained_count = 0
        total_lines = 0

        use_cuda = (dev == "cuda" and cuda_available)
        if use_cuda:
            torch.cuda.reset_peak_memory_stats()

        for doc in dataset:
            if not doc.ground_truth_boxes:
                continue

            t0 = time.perf_counter()
            recognized = rec.recognize_lines(doc.image, doc.ground_truth_boxes, device=dev)
            dt_ms = (time.perf_counter() - t0) * 1000.0
            latencies_ms.append(dt_ms)

            doc_gt_text = " ".join(doc.ground_truth_lines)
            doc_hyp_text = " ".join(r.text for r in recognized if r.text)

            c_err = calculate_cer(doc_gt_text, doc_hyp_text)
            w_err = calculate_wer(doc_gt_text, doc_hyp_text)
            cers.append(c_err)
            wers.append(w_err)

            for r in recognized:
                total_lines += 1
                if r.abstained:
                    abstained_count += 1

        p50 = float(np.percentile(latencies_ms, 50))
        p95 = float(np.percentile(latencies_ms, 95))
        avg_cer = float(np.mean(cers)) if cers else 0.0
        avg_wer = float(np.mean(wers)) if wers else 0.0
        abstention_rate = float(abstained_count / max(1, total_lines))

        peak_vram_mb = (torch.cuda.max_memory_allocated() / (1024 * 1024)) if use_cuda else None
        current_rss_mb = process.memory_info().rss / (1024 * 1024)

        recognizer_results[label] = {
            "device": dev,
            "avg_cer": round(avg_cer, 4),
            "avg_wer": round(avg_wer, 4),
            "p50_latency_ms": round(p50, 2),
            "p95_latency_ms": round(p95, 2),
            "throughput_lines_per_sec": round(1000.0 / max(0.1, (p50 / max(1, total_lines / len(dataset)))), 1),
            "abstention_rate": round(abstention_rate, 4),
            "process_rss_mb": round(current_rss_mb, 2),
            "gpu_vram_peak_mb": round(peak_vram_mb, 2) if peak_vram_mb is not None else "N/A",
        }
        print(
            f"Recognizer [{label}]: CER={avg_cer:.3f}, WER={avg_wer:.3f}, "
            f"P50={p50:.1f}ms, P95={p95:.1f}ms, VRAM={peak_vram_mb or 'N/A'}"
        )

    # -------------------------------------------------------------
    # 3. End-to-End Modular Pipeline Benchmark
    # -------------------------------------------------------------
    print("\n--- [Phase C: Combined End-to-End Pipeline Benchmark] ---")
    pipeline_cpu = OCRPipeline(detector=MorphologicalLineDetector(), recognizer=trocr)
    pipeline_gpu = OCRPipeline(detector=MorphologicalLineDetector(), recognizer=trocr) if cuda_available else None

    e2e_results: Dict[str, Any] = {}
    for pipe_label, pipe, dev in [
        ("Pipeline (CPU)", pipeline_cpu, "cpu"),
        *( [("Pipeline (CUDA FP16)", pipeline_gpu, "cuda")] if pipeline_gpu else [] )
    ]:
        cers = []
        wers = []
        order_accuracies = []
        latencies_ms = []

        for doc in dataset:
            res = pipe.process_image(doc.image, device=dev)
            latencies_ms.append(res.total_latency_ms)

            if doc.ground_truth_lines:
                gt_text = "\n".join(doc.ground_truth_lines)
                c_err = calculate_cer(gt_text, res.full_text)
                w_err = calculate_wer(gt_text, res.full_text)
                cers.append(c_err)
                wers.append(w_err)

                pred_line_texts = [l.text for l in res.lines if l.text]
                order_acc = calculate_reading_order_accuracy(pred_line_texts, doc.ground_truth_lines)
                order_accuracies.append(order_acc)

        p50 = float(np.percentile(latencies_ms, 50))
        p95 = float(np.percentile(latencies_ms, 95))
        avg_cer = float(np.mean(cers)) if cers else 0.0
        avg_wer = float(np.mean(wers)) if wers else 0.0
        avg_order = float(np.mean(order_accuracies)) if order_accuracies else 1.0

        e2e_results[pipe_label] = {
            "device": dev,
            "avg_cer": round(avg_cer, 4),
            "avg_wer": round(avg_wer, 4),
            "reading_order_accuracy": round(avg_order, 4),
            "p50_latency_ms": round(p50, 2),
            "p95_latency_ms": round(p95, 2),
            "pages_per_second": round(1000.0 / max(0.1, p50), 2),
        }
        print(
            f"{pipe_label}: CER={avg_cer:.3f}, WER={avg_wer:.3f}, "
            f"ReadingOrder={avg_order:.3f}, P50={p50:.1f}ms, P95={p95:.1f}ms"
        )

    final_report = {
        "benchmark_timestamp": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "hardware": {
            "cuda_available": cuda_available,
            "device_name": device_name,
            "baseline_rss_mb": round(initial_rss_mb, 2),
            "final_rss_mb": round(process.memory_info().rss / (1024 * 1024), 2),
        },
        "models_evaluated": {
            "detector_candidates": [
                {"name": "MorphologicalLineDetector", "type": "Rule-based Morphological Dilation", "license": "Apache 2.0"},
                {"name": "ProjectionProfileDetector", "type": "Histogram Scanline Profile", "license": "Apache 2.0"},
            ],
            "recognizer_candidates": [
                {
                    "name": "microsoft/trocr-small-printed",
                    "architecture": "VisionEncoderDecoder (DeiT + MiniLM)",
                    "parameters": 61596672,
                    "license": "Apache 2.0",
                    "cpu_load_time_seconds": round(cpu_load_time, 2),
                    "gpu_load_time_seconds": round(gpu_load_time, 2),
                },
                {"name": "BaselinePatternRecognizer", "type": "Deterministic Rule-based Fallback", "license": "Apache 2.0"},
            ],
        },
        "detector_benchmark": detector_results,
        "recognizer_benchmark": recognizer_results,
        "end_to_end_pipeline_benchmark": e2e_results,
    }

    # Save to JSON
    out_path = os.path.join(os.path.dirname(__file__), "ocr_benchmark_results.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(final_report, f, indent=2)
    print(f"\nRaw benchmark results successfully saved to: {out_path}")

    return final_report


if __name__ == "__main__":
    run_benchmark()
