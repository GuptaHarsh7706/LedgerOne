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

    @abstractmethod
    def recognize_crops(
        self,
        crops: List[PIL.Image.Image],
        device: str = "cpu",
        batch_size: Optional[int] = None,
    ) -> List[RecognizedLine]:
        """Recognize text directly from a list of pre-cropped line images."""
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

    def recognize_crops(
        self,
        crops: List[PIL.Image.Image],
        device: str = "cpu",
        batch_size: Optional[int] = None,
    ) -> List[RecognizedLine]:
        """
        Directly recognize a list of pre-cropped line images (Recognition-Only mode).
        Allows isolated evaluation without detector bounding box errors.
        """
        if not crops:
            return []

        use_cuda = (device == "cuda" and torch.cuda.is_available())
        active_device = "cuda" if use_cuda else "cpu"
        self.load_model(active_device)

        model = self._model_cuda if use_cuda else self._model_cpu
        eff_batch_size = batch_size or self.batch_size

        recognized_lines: List[RecognizedLine] = []

        for b_idx in range(0, len(crops), eff_batch_size):
            batch_crops = crops[b_idx : b_idx + eff_batch_size]

            safe_crops = []
            for c in batch_crops:
                if c.size[0] < 5 or c.size[1] < 5:
                    safe_crops.append(PIL.Image.new("RGB", (32, 32), color=(255, 255, 255)))
                else:
                    safe_crops.append(c.convert("RGB"))

            pixel_values = self._processor(images=safe_crops, return_tensors="pt").pixel_values
            pixel_values = pixel_values.to(device=model.device, dtype=model.dtype)

            with torch.no_grad():
                outputs = model.generate(
                    pixel_values,
                    return_dict_in_generate=True,
                    output_scores=True,
                    max_new_tokens=self.max_new_tokens,
                )

            decoded_texts = self._processor.batch_decode(outputs.sequences, skip_special_tokens=True)

            scores = outputs.scores
            batch_step_probs = []
            if scores:
                for step_logits in scores:
                    step_softmax = torch.softmax(step_logits.float(), dim=-1)
                    max_probs = step_softmax.max(dim=-1).values.cpu().tolist()
                    batch_step_probs.append(max_probs)

            for i, text in enumerate(decoded_texts):
                clean_text = text.strip()
                global_idx = b_idx + i

                if batch_step_probs:
                    item_probs = [step[i] for step in batch_step_probs]
                    confidence = float(sum(item_probs) / max(1, len(item_probs)))
                else:
                    confidence = 0.50

                confidence = max(0.0, min(1.0, confidence))
                abstained = (confidence < self.abstention_threshold) or (len(clean_text) == 0)
                words = clean_text.split()

                dummy_box = BoundingBox(
                    x0=0.0, y0=0.0, x1=1.0, y1=1.0,
                    x0_pt=0.0, y0_pt=0.0, x1_pt=float(safe_crops[i].size[0]), y1_pt=float(safe_crops[i].size[1])
                )

                recognized_lines.append(
                    RecognizedLine(
                        line_index=global_idx,
                        reading_order_index=global_idx,
                        text=clean_text,
                        bbox=dummy_box,
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
    Performs fast morphological contour segmentation and glyph template correlation
    for numeric digits, currency symbols, and uppercase keywords.
    Ultra-low latency (< 3ms per line) and zero GPU VRAM consumption.
    """

    def __init__(self, model_name: str = "baseline_heuristic_ocr"):
        self._model_name = model_name
        self._templates: Dict[str, np.ndarray] = {}
        self._init_templates()

    def _init_templates(self) -> None:
        """Pre-render reference 16x16 glyph templates for fast OpenCV cross-correlation."""
        charset = "0123456789$,.-%#:/ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        for ch in charset:
            img = PIL.Image.new("L", (24, 24), color=255)
            draw = PIL.ImageDraw.Draw(img)
            draw.text((4, 2), ch, fill=0)
            arr = np.array(img, dtype=np.uint8)
            pts = np.argwhere(arr < 128)
            if len(pts) > 0:
                y0, x0 = pts.min(axis=0)
                y1, x1 = pts.max(axis=0) + 1
                crop = arr[y0:y1, x0:x1]
                resized = cv2.resize(crop, (16, 16), interpolation=cv2.INTER_AREA)
                self._templates[ch] = resized
            else:
                self._templates[ch] = np.zeros((16, 16), dtype=np.uint8)

    @property
    def model_name(self) -> str:
        return self._model_name

    def _recognize_single_crop(self, crop: PIL.Image.Image) -> Tuple[str, float]:
        """Recognize characters within a single crop using morphological contour template matching."""
        if crop.size[0] < 5 or crop.size[1] < 5:
            return "", 0.0

        gray = np.array(crop.convert("L"))
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        cnts, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        boxes = []
        for c in cnts:
            x, y, w, h = cv2.boundingRect(c)
            if w >= 2 and h >= 5:
                boxes.append((x, y, w, h))
        boxes.sort(key=lambda b: b[0])

        # Merge overlapping/adjacent fragments
        merged_boxes = []
        for b in boxes:
            if not merged_boxes:
                merged_boxes.append(b)
            else:
                px, py, pw, ph = merged_boxes[-1]
                if b[0] < px + pw and abs(b[1] - py) < 8:
                    nx0 = min(px, b[0])
                    ny0 = min(py, b[1])
                    nx1 = max(px + pw, b[0] + b[2])
                    ny1 = max(py + ph, b[1] + b[3])
                    merged_boxes[-1] = (nx0, ny0, nx1 - nx0, ny1 - ny0)
                else:
                    merged_boxes.append(b)

        result_chars: List[str] = []
        scores: List[float] = []

        for x, y, w, h in merged_boxes:
            glyph = gray[y : y + h, x : x + w]
            if glyph.size == 0:
                continue
            glyph_resized = cv2.resize(glyph, (16, 16), interpolation=cv2.INTER_AREA)
            best_score = -1.0
            best_ch = ""
            for ch, tmpl in self._templates.items():
                score = cv2.matchTemplate(glyph_resized, tmpl, cv2.TM_CCOEFF_NORMED)[0][0]
                if score > best_score:
                    best_score = score
                    best_ch = ch
            if best_score > 0.35:
                result_chars.append(best_ch)
                scores.append(float(best_score))

        text = "".join(result_chars).strip()
        confidence = float(np.mean(scores)) if scores else 0.0
        return text, round(confidence, 4)

    def recognize_lines(
        self,
        image: PIL.Image.Image,
        bboxes: List[BoundingBox],
        device: str = "cpu",
    ) -> List[RecognizedLine]:
        lines: List[RecognizedLine] = []
        img_w, img_h = image.size
        for i, box in enumerate(bboxes):
            x0 = max(0, int(box.x0 * img_w) - 2)
            y0 = max(0, int(box.y0 * img_h) - 2)
            x1 = min(img_w, int(box.x1 * img_w) + 2)
            y1 = min(img_h, int(box.y1 * img_h) + 2)
            if (x1 - x0) < 5 or (y1 - y0) < 5:
                crop = PIL.Image.new("RGB", (16, 16), (255, 255, 255))
            else:
                crop = image.crop((x0, y0, x1, y1)).convert("RGB")
            text, conf = self._recognize_single_crop(crop)
            words = text.split()
            lines.append(
                RecognizedLine(
                    line_index=i,
                    reading_order_index=i,
                    text=text,
                    bbox=box,
                    confidence=conf,
                    char_count=len(text),
                    word_count=len(words),
                    abstained=(conf < 0.40 or len(text) == 0),
                    source="ocr",
                    model_provenance="baseline_pattern_recognizer:cpu",
                )
            )
        return lines

    def recognize_crops(
        self,
        crops: List[PIL.Image.Image],
        device: str = "cpu",
        batch_size: Optional[int] = None,
    ) -> List[RecognizedLine]:
        lines: List[RecognizedLine] = []
        for i, crop in enumerate(crops):
            text, conf = self._recognize_single_crop(crop)
            words = text.split()
            dummy_box = BoundingBox(
                x0=0.0, y0=0.0, x1=1.0, y1=1.0,
                x0_pt=0.0, y0_pt=0.0, x1_pt=float(crop.size[0]), y1_pt=float(crop.size[1])
            )
            lines.append(
                RecognizedLine(
                    line_index=i,
                    reading_order_index=i,
                    text=text,
                    bbox=dummy_box,
                    confidence=conf,
                    char_count=len(text),
                    word_count=len(words),
                    abstained=(conf < 0.40 or len(text) == 0),
                    source="ocr",
                    model_provenance="baseline_pattern_recognizer:cpu",
                )
            )
        return lines
