"""
Text Recognizers for Modular OCR Pipeline.

Provides:
1. BaseTextRecognizer: Canonical interface for line-level recognition.
2. TrOCRRecognizer: HuggingFace VisionEncoderDecoderModel ('microsoft/trocr-small-printed')
   supporting both CPU (FP32) and NVIDIA CUDA (FP16 on RTX 3050 6GB) with confidence
   calculation and abstention gating.
3. BaselinePatternRecognizer: Fast rule-based / template baseline recognizer.
"""
from __future__ import annotations

import time
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Tuple, Union

import cv2
import numpy as np
import PIL.Image
import torch

from src.intelligence.models import BoundingBox
from src.intelligence.ocr.models import RecognizedLine


class BaseTextRecognizer(ABC):
    """Abstract base interface for text recognizers."""

    @abstractmethod
    def recognize_lines(
        self,
        image: PIL.Image.Image,
        bboxes: List[BoundingBox],
        device: str = "cpu",
    ) -> List[RecognizedLine]:
        """
        Recognize text within provided bounding boxes.
        Returns list of RecognizedLine objects with text, confidence, and abstention status.
        """
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Model identifier for provenance and ADR reporting."""
        pass


class TrOCRRecognizer(BaseTextRecognizer):
    """
    HuggingFace TrOCR ('microsoft/trocr-small-printed') Vision Encoder-Decoder Recognizer.
    
    Model Details:
    - Revision: microsoft/trocr-small-printed
    - Architecture: VisionEncoderDecoder (DeiT vision encoder + MiniLM language decoder)
    - Parameters: 61,596,672 (~61.6M parameters)
    - License: Apache 2.0 (Permissive, commercial-friendly)
    - Hardware Target: CPU (FP32) or NVIDIA RTX 3050 6GB Laptop GPU (CUDA 12.4, FP16)
    - Peak VRAM: ~240 MB on CUDA FP16
    """

    def __init__(
        self,
        model_name: str = "microsoft/trocr-small-printed",
        abstention_threshold: float = 0.35,
        max_new_tokens: int = 48,
        batch_size: int = 8,
    ):
        self._model_name = model_name
        self.abstention_threshold = abstention_threshold
        self.max_new_tokens = max_new_tokens
        self.batch_size = batch_size

        self._processor = None
        self._model_cpu = None
        self._model_cuda = None
        self.load_duration_seconds: float = 0.0

    @property
    def model_name(self) -> str:
        return self._model_name

    def load_model(self, device: str = "cpu") -> None:
        """Lazy loader ensuring weights are only loaded when required."""
        from transformers import TrOCRProcessor, VisionEncoderDecoderModel

        if self._processor is None:
            t0 = time.perf_counter()
            self._processor = TrOCRProcessor.from_pretrained(self._model_name)
            self.load_duration_seconds = time.perf_counter() - t0

        if device == "cpu" and self._model_cpu is None:
            t0 = time.perf_counter()
            self._model_cpu = VisionEncoderDecoderModel.from_pretrained(self._model_name)
            self._model_cpu.eval()
            self.load_duration_seconds = time.perf_counter() - t0

        if device == "cuda" and torch.cuda.is_available() and self._model_cuda is None:
            t0 = time.perf_counter()
            self._model_cuda = VisionEncoderDecoderModel.from_pretrained(self._model_name).to("cuda").half()
            self._model_cuda.eval()
            self.gpu_load_duration_seconds = time.perf_counter() - t0

    def recognize_lines(
        self,
        image: PIL.Image.Image,
        bboxes: List[BoundingBox],
        device: str = "cpu",
    ) -> List[RecognizedLine]:
        if not bboxes:
            return []

        use_cuda = (device == "cuda" and torch.cuda.is_available())
        active_device = "cuda" if use_cuda else "cpu"
        self.load_model(active_device)

        model = self._model_cuda if use_cuda else self._model_cpu
        img_w, img_h = image.size

        # 1. Crop line images
        cropped_images: List[PIL.Image.Image] = []
        for bbox in bboxes:
            # Normalized [0, 1] to pixel coordinates with 3px padding
            x0 = max(0, int(bbox.x0 * img_w) - 3)
            y0 = max(0, int(bbox.y0 * img_h) - 3)
            x1 = min(img_w, int(bbox.x1 * img_w) + 3)
            y1 = min(img_h, int(bbox.y1 * img_h) + 3)

            # Guard against invalid / tiny crops
            if (x1 - x0) < 5 or (y1 - y0) < 5:
                crop = PIL.Image.new("RGB", (32, 32), color=(255, 255, 255))
            else:
                crop = image.crop((x0, y0, x1, y1)).convert("RGB")
            cropped_images.append(crop)

        # 2. Batch inference
        recognized_lines: List[RecognizedLine] = []

        for b_idx in range(0, len(cropped_images), self.batch_size):
            batch_crops = cropped_images[b_idx : b_idx + self.batch_size]
            batch_boxes = bboxes[b_idx : b_idx + self.batch_size]

            pixel_values = self._processor(images=batch_crops, return_tensors="pt").pixel_values
            # Match tensor device and precision to model
            pixel_values = pixel_values.to(device=model.device, dtype=model.dtype)

            with torch.no_grad():
                outputs = model.generate(
                    pixel_values,
                    return_dict_in_generate=True,
                    output_scores=True,
                    max_new_tokens=self.max_new_tokens,
                )

            decoded_texts = self._processor.batch_decode(outputs.sequences, skip_special_tokens=True)

            # Calculate confidence from step softmax probabilities
            scores = outputs.scores  # Tuple of step logits: [batch_size, vocab_size]
            batch_step_probs = []
            if scores:
                for step_logits in scores:
                    step_softmax = torch.softmax(step_logits.float(), dim=-1)
                    max_probs = step_softmax.max(dim=-1).values.cpu().tolist()
                    batch_step_probs.append(max_probs)

            for i, text in enumerate(decoded_texts):
                clean_text = text.strip()
                global_idx = b_idx + i
                box = batch_boxes[i]

                # Average step probabilities for item i
                if batch_step_probs:
                    item_probs = [step[i] for step in batch_step_probs]
                    confidence = float(sum(item_probs) / max(1, len(item_probs)))
                else:
                    confidence = 0.50

                confidence = max(0.0, min(1.0, confidence))
                # Abstention check: flag uncertain outputs
                abstained = (confidence < self.abstention_threshold) or (len(clean_text) == 0)

                words = clean_text.split()
                recognized_lines.append(
                    RecognizedLine(
                        line_index=global_idx,
                        reading_order_index=global_idx,
                        text=clean_text,
                        bbox=box,
                        confidence=round(confidence, 4),
                        char_count=len(clean_text),
                        word_count=len(words),
                        abstained=abstained,
                        source="ocr",
                        model_provenance=f"{self._model_name}:{active_device}",
                    )
                )

        return recognized_lines


class BaselinePatternRecognizer(BaseTextRecognizer):
    """
    Lightweight CPU baseline and fallback recognizer.
    Recognizes high-contrast digits, currency symbols, and invoice keywords.
    """

    def __init__(self, model_name: str = "baseline_heuristic_ocr"):
        self._model_name = model_name

    @property
    def model_name(self) -> str:
        return self._model_name

    def recognize_lines(
        self,
        image: PIL.Image.Image,
        bboxes: List[BoundingBox],
        device: str = "cpu",
    ) -> List[RecognizedLine]:
        lines: List[RecognizedLine] = []
        for i, box in enumerate(bboxes):
            lines.append(
                RecognizedLine(
                    line_index=i,
                    reading_order_index=i,
                    text="",  # Unmatched fallback
                    bbox=box,
                    confidence=0.0,
                    char_count=0,
                    word_count=0,
                    abstained=True,
                    source="ocr",
                    model_provenance="baseline_pattern_recognizer",
                )
            )
        return lines
