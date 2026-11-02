"""
LedgerOne Document Intelligence Package.

Core components:
- PDF Rendering Engine: Configurable DPI profiles (scale = DPI / 72.0), streaming rasterization, pixel limits.
- Digital PDF Extraction: Character/word geometry, confidence-based page classification, XY-cut reading order.
- Tabular Extraction: XLSX dual-pass formula vs cached value extraction, Polars CSV extraction.
"""
from src.intelligence.models import (
    BoundingBox,
    CharElement,
    CsvExtractionResult,
    DocumentExtractionResult,
    ExtractedPage,
    PageClassification,
    PageClassificationResult,
    SpreadsheetCell,
    SpreadsheetExtractionResult,
    SpreadsheetSheet,
    TextBlock,
    WordElement,
)
from src.intelligence.pdf_extractor import (
    classify_page,
    extract_digital_page,
    extract_pdf_document,
)
from src.intelligence.rendering import (
    DPIProfile,
    PDFRenderer,
    RenderedPage,
    benchmark_concurrent_rendering,
    benchmark_cpu_memory_rendering,
    calculate_scale,
)
from src.intelligence.spreadsheet_extractor import SpreadsheetExtractor
from src.intelligence.xy_cut import recursive_xy_cut, sort_text_blocks_reading_order

__all__ = [
    "BoundingBox",
    "CharElement",
    "CsvExtractionResult",
    "DPIProfile",
    "DocumentExtractionResult",
    "ExtractedPage",
    "PDFRenderer",
    "PageClassification",
    "PageClassificationResult",
    "RenderedPage",
    "SpreadsheetCell",
    "SpreadsheetExtractionResult",
    "SpreadsheetExtractor",
    "SpreadsheetSheet",
    "TextBlock",
    "WordElement",
    "benchmark_concurrent_rendering",
    "benchmark_cpu_memory_rendering",
    "calculate_scale",
    "classify_page",
    "extract_digital_page",
    "extract_pdf_document",
    "recursive_xy_cut",
    "sort_text_blocks_reading_order",
]
