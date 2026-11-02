"""
Modular Production OCR Pipeline.

Coordinates:
1. Deterministic Image Preprocessing (Deskewing & Contrast Normalization)
2. Text-Region & Text-Line Detection (Morphological / Projection Profile)
3. XY-Cut Reading-Order Reconstruction
4. Vision-Language Text Recognition (TrOCR / Baseline)
5. Dual-Stream Integration with ExtractedPage
"""
from __future__ import annotations

import time
from typing import List, Optional

import PIL.Image
import psutil
import torch

from src.intelligence.models import ExtractedPage, PageClassification, TextBlock, WordElement
from src.intelligence.ocr.detectors import BaseTextDetector, MorphologicalLineDetector
from src.intelligence.ocr.models import OCRExtractionResult, RecognizedLine
from src.intelligence.ocr.preprocessing import ImagePreprocessor
from src.intelligence.ocr.recognizers import BaseTextRecognizer, TrOCRRecognizer
from src.intelligence.xy_cut import recursive_xy_cut


class OCRPipeline:
    """
    End-to-end modular OCR pipeline decoupling detection, reading-order,
    and text recognition.
    """

    def __init__(
        self,
        detector: Optional[BaseTextDetector] = None,
        recognizer: Optional[BaseTextRecognizer] = None,
    ):
        self.detector = detector or MorphologicalLineDetector()
        self.recognizer = recognizer or TrOCRRecognizer()

    def process_image(
        self,
        image: PIL.Image.Image,
        page_index: int = 0,
        device: str = "cpu",
        apply_deskew: bool = True,
    ) -> OCRExtractionResult:
        """
        Execute full OCR pipeline on an image page:
        Preprocessing -> Detection -> XY-Cut Sorting -> Recognition -> Text Assembly.
        """
        process = psutil.Process()
        initial_rss = process.memory_info().rss
        t_start_total = time.perf_counter()

        use_cuda = (device == "cuda" and torch.cuda.is_available())
        if use_cuda:
            torch.cuda.reset_peak_memory_stats()

        # Step 1: Preprocessing & Normalization
        prep_img, prep_meta = ImagePreprocessor.normalize_pipeline(
            image, apply_deskew=apply_deskew, apply_binarization=False
        )

        # Step 2: Text-Line Detection
        t_start_det = time.perf_counter()
        raw_boxes = self.detector.detect(prep_img)
        detection_ms = (time.perf_counter() - t_start_det) * 1000.0

        if not raw_boxes:
            total_ms = (time.perf_counter() - t_start_total) * 1000.0
            peak_rss_mb = process.memory_info().rss / (1024 * 1024)
            peak_vram_mb = (torch.cuda.max_memory_allocated() / (1024 * 1024)) if use_cuda else None
            return OCRExtractionResult(
                page_index=page_index,
                full_text="",
                lines=[],
                blocks=[],
                detector_used=self.detector.detector_name,
                recognizer_used=self.recognizer.model_name,
                device_used="cuda" if use_cuda else "cpu",
                detection_latency_ms=round(detection_ms, 2),
                recognition_latency_ms=0.0,
                total_latency_ms=round(total_ms, 2),
                peak_process_rss_mb=round(peak_rss_mb, 2),
                peak_gpu_vram_mb=round(peak_vram_mb, 2) if peak_vram_mb is not None else None,
                abstained_lines_count=0,
                metadata={"prep_meta": prep_meta},
            )

        # Step 3: Reconstruct reading order using XY-Cut on detected bounding boxes
        items = [(i, b) for i, b in enumerate(raw_boxes)]
        ordered_indices = recursive_xy_cut(items)
        sorted_boxes = [raw_boxes[i] for i in ordered_indices]

        # Step 4: Text Recognition
        t_start_rec = time.perf_counter()
        recognized_lines = self.recognizer.recognize_lines(
            prep_img, sorted_boxes, device="cuda" if use_cuda else "cpu"
        )
        recognition_ms = (time.perf_counter() - t_start_rec) * 1000.0

        # Step 5: Convert lines to TextBlocks and assemble full text
        blocks: List[TextBlock] = []
        full_text_lines: List[str] = []
        abstained_count = 0

        for idx, line in enumerate(recognized_lines):
            line.reading_order_index = idx
            if line.abstained:
                abstained_count += 1

            if line.text:
                full_text_lines.append(line.text)

            # Convert line into TextBlock
            words = [
                WordElement(
                    text=w,
                    bbox=line.bbox,
                    confidence=line.confidence,
                    char_count=len(w),
                )
                for w in line.text.split()
            ]

            blocks.append(
                TextBlock(
                    block_index=idx,
                    reading_order_index=idx,
                    text=line.text,
                    bbox=line.bbox,
                    words=words,
                    line_count=1,
                    confidence=line.confidence,
                    source="ocr",
                )
            )

        total_ms = (time.perf_counter() - t_start_total) * 1000.0
        peak_rss_mb = process.memory_info().rss / (1024 * 1024)
        peak_vram_mb = (torch.cuda.max_memory_allocated() / (1024 * 1024)) if use_cuda else None

        return OCRExtractionResult(
            page_index=page_index,
            full_text="\n".join(full_text_lines),
            lines=recognized_lines,
            blocks=blocks,
            detector_used=self.detector.detector_name,
            recognizer_used=self.recognizer.model_name,
            device_used="cuda" if use_cuda else "cpu",
            detection_latency_ms=round(detection_ms, 2),
            recognition_latency_ms=round(recognition_ms, 2),
            total_latency_ms=round(total_ms, 2),
            peak_process_rss_mb=round(peak_rss_mb, 2),
            peak_gpu_vram_mb=round(peak_vram_mb, 2) if peak_vram_mb is not None else None,
            abstained_lines_count=abstained_count,
            metadata={
                "prep_meta": prep_meta,
                "detected_boxes_count": len(raw_boxes),
            },
        )

    def enrich_page(
        self,
        extracted_page: ExtractedPage,
        rendered_image: PIL.Image.Image,
        device: str = "cpu",
    ) -> ExtractedPage:
        """
        Enrich an ExtractedPage with OCR outputs if page is SCANNED_IMAGE or HYBRID.
        Preserves existing native digital_text and digital_blocks.
        """
        if extracted_page.classification == PageClassification.DIGITAL_TEXT:
            # Pure digital pages skip OCR execution
            return extracted_page

        ocr_result = self.process_image(
            rendered_image,
            page_index=extracted_page.page_index,
            device=device,
        )

        return extracted_page.model_copy(
            update={
                "ocr_text": ocr_result.full_text,
                "ocr_blocks": ocr_result.blocks,
                "metadata": {
                    **extracted_page.metadata,
                    "ocr": {
                        "detector": ocr_result.detector_used,
                        "recognizer": ocr_result.recognizer_used,
                        "device": ocr_result.device_used,
                        "detection_ms": ocr_result.detection_latency_ms,
                        "recognition_ms": ocr_result.recognition_latency_ms,
                        "total_ms": ocr_result.total_latency_ms,
                        "peak_rss_mb": ocr_result.peak_process_rss_mb,
                        "peak_vram_mb": ocr_result.peak_gpu_vram_mb,
                        "abstained_lines": ocr_result.abstained_lines_count,
                    },
                },
            }
        )
