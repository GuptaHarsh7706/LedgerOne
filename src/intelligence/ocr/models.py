"""
OCR Pipeline Data Models and Interfaces.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from src.intelligence.models import BoundingBox, TextBlock


class RecognizedLine(BaseModel):
    """Recognized line of text from an OCR engine."""
    line_index: int
    reading_order_index: int = 0
    text: str
    bbox: BoundingBox
    confidence: float = Field(..., ge=0.0, le=1.0, description="Heuristic or model confidence score")
    char_count: int = 0
    word_count: int = 0
    abstained: bool = False
    source: str = "ocr"
    model_provenance: str = ""
    metadata: Dict[str, Any] = Field(default_factory=dict)


class OCRExtractionResult(BaseModel):
    """End-to-end OCR extraction result for a document page."""
    page_index: int
    full_text: str
    lines: List[RecognizedLine] = Field(default_factory=list)
    blocks: List[TextBlock] = Field(default_factory=list)
    detector_used: str
    recognizer_used: str
    device_used: str = "cpu"
    detection_latency_ms: float = 0.0
    recognition_latency_ms: float = 0.0
    total_latency_ms: float = 0.0
    peak_process_rss_mb: float = 0.0
    peak_gpu_vram_mb: Optional[float] = None
    abstained_lines_count: int = 0
    metadata: Dict[str, Any] = Field(default_factory=dict)
