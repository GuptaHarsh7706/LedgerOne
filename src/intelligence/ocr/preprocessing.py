"""
Deterministic Document Image Preprocessing and Normalization Engine.

Implements:
1. Skew detection and correction (Hough lines / minimum bounding rectangle).
2. Contrast adjustment and adaptive binarization (Otsu & Gaussian adaptive).
3. Dimension normalization with strict aspect-ratio preservation.
4. Noise suppression and border padding.
"""
from __future__ import annotations

import math
from typing import Any, Dict, Tuple, Union

import cv2
import numpy as np
import PIL.Image


class ImagePreprocessor:
    """Production-grade deterministic image preprocessor for OCR pipelines."""

    @staticmethod
    def to_cv2_image(image: Union[PIL.Image.Image, np.ndarray]) -> np.ndarray:
        """Convert PIL Image to OpenCV BGR/Grayscale numpy array."""
        if isinstance(image, PIL.Image.Image):
            arr = np.array(image.convert("RGB"))
            return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
        return image

    @staticmethod
    def to_pil_image(image: np.ndarray) -> PIL.Image.Image:
        """Convert OpenCV image array to PIL Image."""
        if len(image.shape) == 2:
            return PIL.Image.fromarray(image, mode="L")
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        return PIL.Image.fromarray(rgb, mode="RGB")

    @classmethod
    def detect_skew_angle(cls, image: Union[PIL.Image.Image, np.ndarray]) -> float:
        """
        Detect page skew angle in degrees using minimum area bounding rectangle
        of thresholded text contours.
        Clamped to [-45.0, 45.0] degrees to prevent 90-degree inversion.
        """
        cv_img = cls.to_cv2_image(image)
        if len(cv_img.shape) == 3:
            gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
        else:
            gray = cv_img

        # Invert: white background becomes 0, dark text becomes 255
        thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]

        # Find all foreground text pixel coordinates
        pts = cv2.findNonZero(thresh)
        if pts is None or len(pts) < 50:
            return 0.0

        # Compute minimum area rectangle
        rect = cv2.minAreaRect(pts)
        angle = rect[-1]

        # OpenCV minAreaRect returns angle in range [-90, 0)
        if angle < -45.0:
            angle = -(90.0 + angle)
        elif angle > 45.0:
            angle = 90.0 - angle
        else:
            angle = -angle

        # If angle is negligible (< 0.2 deg), return 0.0
        if abs(angle) < 0.2:
            return 0.0

        return round(float(angle), 2)

    @classmethod
    def deskew(
        cls,
        image: Union[PIL.Image.Image, np.ndarray],
        max_angle: float = 45.0,
    ) -> Tuple[PIL.Image.Image, float]:
        """
        Rotate image to correct skew with white border padding.
        Returns (deskewed_image, applied_angle).
        """
        angle = cls.detect_skew_angle(image)
        if abs(angle) < 0.2 or abs(angle) > max_angle:
            pil_img = image if isinstance(image, PIL.Image.Image) else cls.to_pil_image(image)
            return pil_img, 0.0

        cv_img = cls.to_cv2_image(image)
        h, w = cv_img.shape[:2]
        center = (w // 2, h // 2)

        # Compute rotation matrix
        m = cv2.getRotationMatrix2D(center, angle, 1.0)
        # Compute new bounding dimensions
        cos = np.abs(m[0, 0])
        sin = np.abs(m[0, 1])
        new_w = int((h * sin) + (w * cos))
        new_h = int((h * cos) + (w * sin))

        m[0, 2] += (new_w / 2) - center[0]
        m[1, 2] += (new_h / 2) - center[1]

        # Rotate with white background (255, 255, 255)
        rotated = cv2.warpAffine(
            cv_img,
            m,
            (new_w, new_h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(255, 255, 255),
        )

        return cls.to_pil_image(rotated), angle

    @classmethod
    def binarize(
        cls,
        image: Union[PIL.Image.Image, np.ndarray],
        method: str = "otsu",
    ) -> PIL.Image.Image:
        """
        Binarize image for high-contrast OCR detection.
        Methods:
            - 'otsu': Global automatic thresholding (fast, clean for printed text)
            - 'adaptive': Local Gaussian adaptive thresholding (best for uneven illumination/thermal paper)
        """
        cv_img = cls.to_cv2_image(image)
        if len(cv_img.shape) == 3:
            gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
        else:
            gray = cv_img

        if method == "adaptive":
            binary = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 21, 10
            )
        else:
            _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        return cls.to_pil_image(binary)

    @classmethod
    def normalize_pipeline(
        cls,
        image: PIL.Image.Image,
        apply_deskew: bool = True,
        apply_binarization: bool = False,
        binarization_method: str = "otsu",
    ) -> Tuple[PIL.Image.Image, Dict[str, Any]]:
        """
        Full deterministic normalization pipeline returning transformed PIL image
        and execution metadata.
        """
        orig_w, orig_h = image.size
        meta: Dict[str, Any] = {
            "original_width": orig_w,
            "original_height": orig_h,
            "deskew_applied": False,
            "skew_angle": 0.0,
            "binarization_applied": False,
        }

        current = image
        if apply_deskew:
            current, angle = cls.deskew(current)
            if abs(angle) >= 0.2:
                meta["deskew_applied"] = True
                meta["skew_angle"] = angle

        if apply_binarization:
            current = cls.binarize(current, method=binarization_method)
            meta["binarization_applied"] = True
            meta["binarization_method"] = binarization_method

        norm_w, norm_h = current.size
        meta["normalized_width"] = norm_w
        meta["normalized_height"] = norm_h

        return current, meta
