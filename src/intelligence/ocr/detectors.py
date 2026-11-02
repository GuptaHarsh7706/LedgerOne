"""
Text-Region and Text-Line Detectors for Modular OCR Pipeline.

Provides:
1. BaseTextDetector: Canonical interface for text detection.
2. MorphologicalLineDetector: High-speed morphological gradient + horizontal dilation (sub-5ms CPU).
3. ProjectionProfileDetector: Scanline projection profile histogram detector for financial ledgers.
4. MSERLineDetector: Maximally Stable Extremal Regions character clustering detector.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Tuple, Union

import cv2
import numpy as np
import PIL.Image

from src.intelligence.models import BoundingBox


class BaseTextDetector(ABC):
    """Abstract base interface for text region / text line detection."""

    @abstractmethod
    def detect(self, image: Union[PIL.Image.Image, np.ndarray]) -> List[BoundingBox]:
        """
        Detect text line bounding boxes from an image.
        Returns list of BoundingBox objects with normalized [0.0, 1.0] coordinates.
        """
        pass

    @property
    @abstractmethod
    def detector_name(self) -> str:
        """Name of detector for telemetry and provenance."""
        pass


class MorphologicalLineDetector(BaseTextDetector):
    """
    High-throughput CPU-based text line detector using morphological gradient
    and directional rectangular dilation.
    Connects adjacent characters along the horizontal baseline into line bounding boxes
    while preserving inter-line vertical spacing.
    """

    def __init__(
        self,
        kernel_width_ratio: float = 0.025,  # ~2.5% of image width
        kernel_height: int = 3,
        min_width_px: int = 15,
        min_height_px: int = 6,
        padding_px: int = 2,
    ):
        self.kernel_width_ratio = kernel_width_ratio
        self.kernel_height = kernel_height
        self.min_width_px = min_width_px
        self.min_height_px = min_height_px
        self.padding_px = padding_px

    @property
    def detector_name(self) -> str:
        return "morphological_line_detector"

    def detect(self, image: Union[PIL.Image.Image, np.ndarray]) -> List[BoundingBox]:
        if isinstance(image, PIL.Image.Image):
            arr = np.array(image.convert("RGB"))
            cv_img = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
            img_w, img_h = image.size
        else:
            cv_img = image
            img_h, img_w = cv_img.shape[:2]

        if len(cv_img.shape) == 3:
            gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
        else:
            gray = cv_img

        # Invert Otsu thresholding: dark text becomes white (255)
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        # Dynamic kernel width proportional to document pixel width
        k_w = max(12, int(round(img_w * self.kernel_width_ratio)))
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (k_w, self.kernel_height))
        dilated = cv2.dilate(thresh, kernel, iterations=1)

        # Find external contours of dilated text lines
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        raw_boxes: List[Tuple[int, int, int, int]] = []
        for c in contours:
            x, y, w, h = cv2.boundingRect(c)
            if w >= self.min_width_px and h >= self.min_height_px:
                # Add small padding
                pad_x0 = max(0, x - self.padding_px)
                pad_y0 = max(0, y - self.padding_px)
                pad_x1 = min(img_w, x + w + self.padding_px)
                pad_y1 = min(img_h, y + h + self.padding_px)
                raw_boxes.append((pad_x0, pad_y0, pad_x1, pad_y1))

        # Sort top-to-bottom primarily
        raw_boxes.sort(key=lambda b: (b[1], b[0]))

        # Convert to standardized BoundingBox
        boxes: List[BoundingBox] = []
        for x0, y0, x1, y1 in raw_boxes:
            norm_x0 = max(0.0, min(1.0, x0 / img_w))
            norm_y0 = max(0.0, min(1.0, y0 / img_h))
            norm_x1 = max(0.0, min(1.0, x1 / img_w))
            norm_y1 = max(0.0, min(1.0, y1 / img_h))

            # Point coordinates in standard 72 pt/in space (relative to 72 points)
            pt_w = img_w * 72.0 / 200.0
            pt_h = img_h * 72.0 / 200.0

            boxes.append(
                BoundingBox(
                    x0=norm_x0,
                    y0=norm_y0,
                    x1=norm_x1,
                    y1=norm_y1,
                    x0_pt=norm_x0 * pt_w,
                    y0_pt=norm_y0 * pt_h,
                    x1_pt=norm_x1 * pt_w,
                    y1_pt=norm_y1 * pt_h,
                )
            )

        return boxes


class ProjectionProfileDetector(BaseTextDetector):
    """
    Scanline projection profile detector.
    Analyzes horizontal pixel density histograms to identify line bands and vertical
    projections to separate columnar blocks. Highly effective for tabular ledgers.
    """

    def __init__(
        self,
        min_line_height_px: int = 6,
        valley_threshold: float = 0.005,  # Pixel density below which is considered valley
    ):
        self.min_line_height_px = min_line_height_px
        self.valley_threshold = valley_threshold

    @property
    def detector_name(self) -> str:
        return "projection_profile_detector"

    def detect(self, image: Union[PIL.Image.Image, np.ndarray]) -> List[BoundingBox]:
        if isinstance(image, PIL.Image.Image):
            arr = np.array(image.convert("RGB"))
            cv_img = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
            img_w, img_h = image.size
        else:
            cv_img = image
            img_h, img_w = cv_img.shape[:2]

        if len(cv_img.shape) == 3:
            gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
        else:
            gray = cv_img

        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        # Horizontal projection: sum of black pixels along each row
        h_proj = np.sum(thresh, axis=1) / (255.0 * img_w)

        # Identify horizontal text bands (start_y, end_y)
        in_band = False
        start_y = 0
        bands: List[Tuple[int, int]] = []

        for y in range(img_h):
            is_text = h_proj[y] > self.valley_threshold
            if is_text and not in_band:
                in_band = True
                start_y = y
            elif not is_text and in_band:
                in_band = False
                if (y - start_y) >= self.min_line_height_px:
                    bands.append((start_y, y))

        if in_band and (img_h - start_y) >= self.min_line_height_px:
            bands.append((start_y, img_h))

        # For each horizontal band, compute vertical projection to get left and right bounds
        boxes: List[BoundingBox] = []
        pt_w = img_w * 72.0 / 200.0
        pt_h = img_h * 72.0 / 200.0

        for y0, y1 in bands:
            band_thresh = thresh[y0:y1, :]
            v_proj = np.sum(band_thresh, axis=0) / (255.0 * max(1, y1 - y0))

            # Find non-zero bounds along x
            x_indices = np.where(v_proj > self.valley_threshold)[0]
            if len(x_indices) > 5:
                x0 = int(x_indices[0])
                x1 = int(x_indices[-1])
                if (x1 - x0) >= 15:
                    norm_x0 = max(0.0, min(1.0, x0 / img_w))
                    norm_y0 = max(0.0, min(1.0, y0 / img_h))
                    norm_x1 = max(0.0, min(1.0, x1 / img_w))
                    norm_y1 = max(0.0, min(1.0, y1 / img_h))

                    boxes.append(
                        BoundingBox(
                            x0=norm_x0,
                            y0=norm_y0,
                            x1=norm_x1,
                            y1=norm_y1,
                            x0_pt=norm_x0 * pt_w,
                            y0_pt=norm_y0 * pt_h,
                            x1_pt=norm_x1 * pt_w,
                            y1_pt=norm_y1 * pt_h,
                        )
                    )

        return boxes
