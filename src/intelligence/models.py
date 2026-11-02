"""
Data models and schemas for Document Intelligence and Extraction Pipeline.
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class PageClassification(str, Enum):
    """Multi-class confidence-based page classification."""
    DIGITAL_TEXT = "DIGITAL_TEXT"
    SCANNED_IMAGE = "SCANNED_IMAGE"
    HYBRID = "HYBRID"


class BoundingBox(BaseModel):
    """
    Standardized bounding box representation.
    Normalized coordinates are in [0.0, 1.0] relative to page width and height,
    with origin at top-left (x0, y0) and bottom-right (x1, y1).
    Point coordinates represent unscaled PDF points (72 points/inch).
    """
    x0: float = Field(..., description="Normalized left coordinate [0.0, 1.0]")
    y0: float = Field(..., description="Normalized top coordinate [0.0, 1.0]")
    x1: float = Field(..., description="Normalized right coordinate [0.0, 1.0]")
    y1: float = Field(..., description="Normalized bottom coordinate [0.0, 1.0]")
    x0_pt: float = Field(..., description="Absolute PDF points left")
    y0_pt: float = Field(..., description="Absolute PDF points top (top-down origin)")
    x1_pt: float = Field(..., description="Absolute PDF points right")
    y1_pt: float = Field(..., description="Absolute PDF points bottom (top-down origin)")

    @property
    def width(self) -> float:
        return max(0.0, self.x1 - self.x0)

    @property
    def height(self) -> float:
        return max(0.0, self.y1 - self.y0)

    @property
    def area(self) -> float:
        return self.width * self.height

    def intersects(self, other: BoundingBox) -> bool:
        """Check if two bounding boxes overlap."""
        return not (
            self.x1 < other.x0 or
            self.x0 > other.x1 or
            self.y1 < other.y0 or
            self.y0 > other.y1
        )

    def union(self, other: BoundingBox) -> BoundingBox:
        """Calculate union bounding box encompassing both."""
        return BoundingBox(
            x0=min(self.x0, other.x0),
            y0=min(self.y0, other.y0),
            x1=max(self.x1, other.x1),
            y1=max(self.y1, other.y1),
            x0_pt=min(self.x0_pt, other.x0_pt),
            y0_pt=min(self.y0_pt, other.y0_pt),
            x1_pt=max(self.x1_pt, other.x1_pt),
            y1_pt=max(self.y1_pt, other.y1_pt),
        )


class CharElement(BaseModel):
    """Single character element with geometry."""
    char: str
    bbox: BoundingBox
    font_size: Optional[float] = None


class WordElement(BaseModel):
    """Word-level extracted text with bounding box and confidence."""
    text: str
    bbox: BoundingBox
    confidence: float = 1.0
    char_count: int = 1


class TextBlock(BaseModel):
    """
    Extracted text block (paragraph, heading, table cell, or column block)
    with reconstructed XY-cut reading order.
    """
    block_index: int
    reading_order_index: int = 0
    text: str
    bbox: BoundingBox
    words: List[WordElement] = Field(default_factory=list)
    line_count: int = 1
    confidence: float = 1.0
    source: str = "native"  # "native" (digital PDF stream) or "ocr" (vision OCR)


class PageClassificationResult(BaseModel):
    """Page classification diagnostic details and confidence score."""
    page_index: int
    classification: PageClassification
    confidence: float = Field(..., ge=0.0, le=1.0)
    char_count: int
    text_rect_count: int
    font_count: int
    image_objects_count: int
    image_area_ratio: float = Field(..., ge=0.0, le=1.0)
    reasons: List[str] = Field(default_factory=list)


class ExtractedPage(BaseModel):
    """
    Dual-stream extracted page preserving both native digital text
    and OCR stream outputs where hybrid.
    """
    page_index: int
    width_pt: float
    height_pt: float
    classification: PageClassification
    classification_confidence: float
    digital_text: str = ""
    digital_blocks: List[TextBlock] = Field(default_factory=list)
    ocr_text: Optional[str] = None
    ocr_blocks: List[TextBlock] = Field(default_factory=list)
    is_hybrid: bool = False
    metadata: Dict[str, Any] = Field(default_factory=dict)


class DocumentExtractionResult(BaseModel):
    """Document-level extraction output across all pages."""
    document_id: Optional[str] = None
    page_count: int
    pages: List[ExtractedPage] = Field(default_factory=list)
    overall_classification: PageClassification
    full_text: str = ""
    extraction_duration_seconds: float = 0.0
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SpreadsheetCell(BaseModel):
    """Spreadsheet cell preserving formulas and cached evaluated values separately."""
    coordinate: str
    row: int
    col: int
    raw_value: Any = None
    formatted_value: str = ""
    data_type: str = "s"
    is_formula: bool = False
    formula: Optional[str] = None
    cached_value: Optional[Any] = None
    formula_cached_value_missing: bool = False


class SpreadsheetSheet(BaseModel):
    """Extracted worksheet metadata and cell grid."""
    sheet_name: str
    max_row: int
    max_column: int
    cells: List[SpreadsheetCell] = Field(default_factory=list)
    tables: List[Dict[str, Any]] = Field(default_factory=list)
    summary: Dict[str, Any] = Field(default_factory=dict)


class SpreadsheetExtractionResult(BaseModel):
    """XLSX extraction result across all sheets."""
    sheets: List[SpreadsheetSheet] = Field(default_factory=list)
    total_cells: int = 0
    total_formulas: int = 0
    total_missing_cached_formulas: int = 0
    duration_seconds: float = 0.0


class CsvExtractionResult(BaseModel):
    """CSV extraction result parsed via Polars."""
    headers: List[str] = Field(default_factory=list)
    dtypes: Dict[str, str] = Field(default_factory=dict)
    row_count: int = 0
    column_count: int = 0
    null_counts: Dict[str, int] = Field(default_factory=dict)
    records: List[Dict[str, Any]] = Field(default_factory=list)
    markdown_table: str = ""
    duration_seconds: float = 0.0
