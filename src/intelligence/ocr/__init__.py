"""
OCR Pipeline Package for Scanned and Hybrid Document Intelligence.

Components:
- Preprocessing: Deskewing, Binarization, Contrast Normalization
- Detectors: MorphologicalLineDetector, ProjectionProfileDetector
- Recognizers: TrOCRRecognizer (microsoft/trocr-small-printed), BaselinePatternRecognizer
- Metrics: CER, WER, Detection IoU, Reading Order Concordance
- Pipeline: OCRPipeline with dual-stream ExtractedPage integration
"""
from src.intelligence.ocr.detectors import (
    BaseTextDetector,
    MorphologicalLineDetector,
    ProjectionProfileDetector,
)
from src.intelligence.ocr.metrics import (
    calculate_box_iou,
    calculate_cer,
    calculate_reading_order_accuracy,
    calculate_wer,
    evaluate_detection_precision_recall,
    levenshtein_distance,
)
from src.intelligence.ocr.models import OCRExtractionResult, RecognizedLine
from src.intelligence.ocr.pipeline import OCRPipeline
from src.intelligence.ocr.preprocessing import ImagePreprocessor
from src.intelligence.ocr.recognizers import (
    BaseTextRecognizer,
    BaselinePatternRecognizer,
    TrOCRRecognizer,
)

__all__ = [
    "BaseTextDetector",
    "BaseTextRecognizer",
    "BaselinePatternRecognizer",
    "ImagePreprocessor",
    "MorphologicalLineDetector",
    "OCRExtractionResult",
    "OCRPipeline",
    "ProjectionProfileDetector",
    "RecognizedLine",
    "TrOCRRecognizer",
    "calculate_box_iou",
    "calculate_cer",
    "calculate_reading_order_accuracy",
    "calculate_wer",
    "evaluate_detection_precision_recall",
    "levenshtein_distance",
]
