"""
Digital PDF Text Extraction and Scanned-Page Classification Engine.

Implements:
1. Confidence-based page classification (DIGITAL_TEXT, SCANNED_IMAGE, HYBRID).
2. Character-, word-, and block-level bounding box geometry with normalized coordinates.
3. XY-cut reading order reconstruction for multi-column documents.
4. Dual-stream representation preserving both native digital text and OCR stream outputs.
"""
from __future__ import annotations

import io
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple, Union

import pypdfium2 as pdfium

from src.intelligence.models import (
    BoundingBox,
    CharElement,
    DocumentExtractionResult,
    ExtractedPage,
    PageClassification,
    PageClassificationResult,
    TextBlock,
    WordElement,
)
from src.intelligence.xy_cut import sort_text_blocks_reading_order


def _convert_pdf_coords_to_normalized_bbox(
    left_pt: float,
    bottom_pt: float,
    right_pt: float,
    top_pt: float,
    page_width_pt: float,
    page_height_pt: float,
) -> BoundingBox:
    """
    Convert native PDF points coordinates (origin at bottom-left)
    to standardized top-down coordinates:
        x0_pt = left_pt
        y0_pt = page_height_pt - top_pt
        x1_pt = right_pt
        y1_pt = page_height_pt - bottom_pt
    Normalized coordinates [0.0, 1.0] are scaled relative to page dimensions.
    """
    pw = max(1e-6, page_width_pt)
    ph = max(1e-6, page_height_pt)

    x0_pt = min(left_pt, right_pt)
    x1_pt = max(left_pt, right_pt)
    y0_pt = max(0.0, ph - max(top_pt, bottom_pt))
    y1_pt = min(ph, ph - min(top_pt, bottom_pt))

    x0 = max(0.0, min(1.0, x0_pt / pw))
    y0 = max(0.0, min(1.0, y0_pt / ph))
    x1 = max(0.0, min(1.0, x1_pt / pw))
    y1 = max(0.0, min(1.0, y1_pt / ph))

    return BoundingBox(
        x0=x0,
        y0=y0,
        x1=x1,
        y1=y1,
        x0_pt=x0_pt,
        y0_pt=y0_pt,
        x1_pt=x1_pt,
        y1_pt=y1_pt,
    )


def classify_page(
    page: pdfium.PdfPage,
    textpage: pdfium.PdfTextPage,
    page_index: int,
) -> PageClassificationResult:
    """
    Confidence-based multi-class page classifier:
    Categorizes page into DIGITAL_TEXT, SCANNED_IMAGE, or HYBRID.
    """
    page_width_pt, page_height_pt = page.get_size()
    page_area = max(1.0, page_width_pt * page_height_pt)

    # 1. Text statistics from TextPage
    char_count = textpage.count_chars()
    text_rect_count = textpage.count_rects()

    # 2. Object inspection (Images and Fonts)
    image_objects_count = 0
    total_image_area = 0.0
    fonts_detected: Set[str] = set()

    for obj in page.get_objects():
        if isinstance(obj, pdfium.PdfImage):
            image_objects_count += 1
            bounds = obj.get_bounds()
            # bounds: (left, bottom, right, top)
            w = max(0.0, bounds[2] - bounds[0])
            h = max(0.0, bounds[3] - bounds[1])
            total_image_area += w * h
        elif isinstance(obj, pdfium.PdfTextObj):
            try:
                font = obj.get_font()
                if font:
                    base_name = font.get_base_name() or font.get_family_name()
                    if base_name:
                        fonts_detected.add(base_name)
            except Exception:
                pass

    image_area_ratio = min(1.0, total_image_area / page_area)
    font_count = len(fonts_detected)

    reasons: List[str] = []

    # 3. Confidence-based classification logic
    if char_count == 0:
        if image_objects_count > 0:
            classification = PageClassification.SCANNED_IMAGE
            confidence = 0.98 if image_area_ratio > 0.50 else 0.92
            reasons.append("Zero native digital characters detected")
            reasons.append(f"{image_objects_count} raster image object(s) occupying {image_area_ratio:.1%} page area")
        else:
            classification = PageClassification.SCANNED_IMAGE
            confidence = 0.85
            reasons.append("Zero native digital characters and no raster images (blank or vector graphics)")
    elif char_count >= 50:
        if image_area_ratio < 0.15:
            classification = PageClassification.DIGITAL_TEXT
            confidence = min(0.99, 0.82 + 0.05 * min(max(1, font_count), 3) + 0.10 * min(1.0, char_count / 300.0))
            reasons.append(f"Rich native text stream ({char_count} chars, {text_rect_count} rects)")
            reasons.append(f"{font_count} distinct embedded fonts identified")
            reasons.append(f"Low raster image coverage ({image_area_ratio:.1%})")
        elif image_area_ratio <= 0.80:
            classification = PageClassification.HYBRID
            confidence = 0.90
            reasons.append(f"Substantial native text stream ({char_count} chars)")
            reasons.append(f"Substantial raster image elements ({image_area_ratio:.1%} area, {image_objects_count} objects)")
        else:
            # Over 80% raster image coverage
            if char_count < 150:
                classification = PageClassification.SCANNED_IMAGE
                confidence = 0.85
                reasons.append(f"Dominant full-page raster coverage ({image_area_ratio:.1%}) with minimal OCR text ({char_count} chars)")
            else:
                classification = PageClassification.HYBRID
                confidence = 0.88
                reasons.append(f"Full-page raster image ({image_area_ratio:.1%}) with embedded text stream ({char_count} chars)")
    else:
        # Sparse text: 1 to 49 chars
        if image_area_ratio >= 0.30:
            classification = PageClassification.SCANNED_IMAGE
            confidence = 0.88
            reasons.append(f"Sparse native characters ({char_count}) overshadowed by raster image ({image_area_ratio:.1%})")
        else:
            classification = PageClassification.DIGITAL_TEXT
            confidence = 0.72
            reasons.append(f"Sparse digital text ({char_count} chars) with minimal image area ({image_area_ratio:.1%})")

    return PageClassificationResult(
        page_index=page_index,
        classification=classification,
        confidence=round(confidence, 4),
        char_count=char_count,
        text_rect_count=text_rect_count,
        font_count=font_count,
        image_objects_count=image_objects_count,
        image_area_ratio=round(image_area_ratio, 4),
        reasons=reasons,
    )


def extract_words_and_lines(
    textpage: pdfium.PdfTextPage,
    page_width_pt: float,
    page_height_pt: float,
) -> List[TextBlock]:
    """
    Extract characters, assemble into words, cluster into column-aware line segments,
    and group into spatial TextBlock objects.
    """
    total_chars = textpage.count_chars()
    if total_chars == 0:
        return []

    words: List[WordElement] = []
    current_word_chars: List[str] = []
    current_word_boxes: List[Tuple[float, float, float, float]] = []

    def _flush_word():
        nonlocal current_word_chars, current_word_boxes
        if not current_word_chars:
            return
        w_text = "".join(current_word_chars)
        min_l = min(b[0] for b in current_word_boxes)
        min_b = min(b[1] for b in current_word_boxes)
        max_r = max(b[2] for b in current_word_boxes)
        max_t = max(b[3] for b in current_word_boxes)

        bbox = _convert_pdf_coords_to_normalized_bbox(
            min_l, min_b, max_r, max_t, page_width_pt, page_height_pt
        )
        words.append(
            WordElement(
                text=w_text,
                bbox=bbox,
                confidence=1.0,
                char_count=len(w_text),
            )
        )
        current_word_chars = []
        current_word_boxes = []

    for i in range(total_chars):
        char_text = textpage.get_text_range(i, 1)
        if not char_text:
            continue

        if char_text in (" ", "\t", "\r", "\n", "\x00", "\uFFFD", "\xa0"):
            _flush_word()
        else:
            try:
                char_box = textpage.get_charbox(i)
                current_word_chars.append(char_text)
                current_word_boxes.append(char_box)
            except Exception:
                continue

    _flush_word()

    if not words:
        return []

    # Sort words by vertical band (grouping lines) then left-to-right (x0_pt)
    words_sorted = sorted(words, key=lambda w: (round(w.bbox.y0_pt / 6.0), w.bbox.x0_pt))

    # Cluster words into line segments.
    # Words on same vertical level with a large horizontal gap (> 20 pt or > 2.5x height)
    # belong to different columns and are kept as separate segments.
    line_segments: List[List[WordElement]] = []

    for word in words_sorted:
        placed = False
        for seg in reversed(line_segments):
            avg_seg_y0 = sum(w.bbox.y0_pt for w in seg) / len(seg)
            avg_seg_h = sum(w.bbox.height * page_height_pt for w in seg) / len(seg)
            y_tolerance = max(4.0, avg_seg_h * 0.5)

            if abs(word.bbox.y0_pt - avg_seg_y0) <= y_tolerance:
                last_word = seg[-1]
                h_gap = word.bbox.x0_pt - last_word.bbox.x1_pt
                max_h_gap = max(20.0, avg_seg_h * 2.5)

                if 0 <= h_gap <= max_h_gap:
                    seg.append(word)
                    placed = True
                    break
                elif h_gap < 0 and abs(h_gap) < 5.0:
                    seg.append(word)
                    placed = True
                    break
        if not placed:
            line_segments.append([word])

    # Sort words inside each line segment left-to-right
    for seg in line_segments:
        seg.sort(key=lambda w: w.bbox.x0_pt)

    def _seg_bbox(seg: List[WordElement]) -> BoundingBox:
        u = seg[0].bbox
        for w in seg[1:]:
            u = u.union(w.bbox)
        return u

    seg_with_boxes = [(seg, _seg_bbox(seg)) for seg in line_segments]

    # Cluster line segments into column-coherent TextBlocks based on spatial proximity
    block_clusters: List[List[Tuple[List[WordElement], BoundingBox]]] = []

    for seg, sbox in seg_with_boxes:
        matched_cluster = None
        for cluster in block_clusters:
            c_boxes = [b for _, b in cluster]
            cluster_min_x = min(b.x0_pt for b in c_boxes)
            cluster_max_x = max(b.x1_pt for b in c_boxes)
            cluster_max_y = max(b.y1_pt for b in c_boxes)
            avg_h = sum(b.height * page_height_pt for b in c_boxes) / len(c_boxes)

            v_gap = sbox.y0_pt - cluster_max_y
            h_overlap = not (sbox.x1_pt < cluster_min_x - 20.0 or sbox.x0_pt > cluster_max_x + 20.0)

            if -4.0 <= v_gap <= max(14.0, avg_h * 2.5) and h_overlap:
                matched_cluster = cluster
                break

        if matched_cluster is not None:
            matched_cluster.append((seg, sbox))
        else:
            block_clusters.append([(seg, sbox)])

    # Construct TextBlock for each cluster
    blocks: List[TextBlock] = []
    for b_idx, cluster in enumerate(block_clusters):
        all_words: List[WordElement] = []
        u_bbox = cluster[0][1]
        for seg, sbox in cluster:
            all_words.extend(seg)
            u_bbox = u_bbox.union(sbox)

        all_words.sort(key=lambda w: (round(w.bbox.y0_pt / 6.0), w.bbox.x0_pt))
        block_text = " ".join(w.text for w in all_words)

        blocks.append(
            TextBlock(
                block_index=b_idx,
                reading_order_index=b_idx,
                text=block_text,
                bbox=u_bbox,
                words=all_words,
                line_count=len(cluster),
                confidence=1.0,
                source="native",
            )
        )

    return blocks


def extract_digital_page(
    page: pdfium.PdfPage,
    page_index: int,
) -> ExtractedPage:
    """
    Extract native digital text, bounding boxes, XY-cut reading order,
    and confidence-based classification for a single page.
    """
    page_width_pt, page_height_pt = page.get_size()
    textpage = page.get_textpage()
    try:
        # 1. Classification
        classification_res = classify_page(page, textpage, page_index)

        # 2. Extract words and lines
        raw_blocks = extract_words_and_lines(textpage, page_width_pt, page_height_pt)

        # 3. XY-cut reading order reconstruction
        ordered_blocks = sort_text_blocks_reading_order(raw_blocks)

        # 4. Assemble reconstructed digital text
        digital_text = "\n\n".join(b.text for b in ordered_blocks)

        return ExtractedPage(
            page_index=page_index,
            width_pt=page_width_pt,
            height_pt=page_height_pt,
            classification=classification_res.classification,
            classification_confidence=classification_res.confidence,
            digital_text=digital_text,
            digital_blocks=ordered_blocks,
            ocr_text=None,
            ocr_blocks=[],
            is_hybrid=(classification_res.classification == PageClassification.HYBRID),
            metadata={
                "char_count": classification_res.char_count,
                "text_rect_count": classification_res.text_rect_count,
                "font_count": classification_res.font_count,
                "image_objects_count": classification_res.image_objects_count,
                "image_area_ratio": classification_res.image_area_ratio,
                "classification_reasons": classification_res.reasons,
            },
        )
    finally:
        textpage.close()


def extract_pdf_document(
    pdf_source: Union[str, Path, bytes, io.BytesIO],
    document_id: Optional[str] = None,
    max_pages: Optional[int] = None,
) -> DocumentExtractionResult:
    """
    Process entire PDF document in streaming fashion.
    Preserves memory by closing each page immediately after extraction.
    """
    start_time = time.perf_counter()
    doc = pdfium.PdfDocument(pdf_source)

    pages: List[ExtractedPage] = []
    total_pages = 0
    try:
        total_pages = len(doc)
        limit = min(total_pages, max_pages) if max_pages is not None else total_pages

        for idx in range(limit):
            page = doc.get_page(idx)
            try:
                extracted = extract_digital_page(page, page_index=idx)
                pages.append(extracted)
            finally:
                page.close()
    finally:
        doc.close()

    duration = time.perf_counter() - start_time

    # Determine overall document classification
    classifications = [p.classification for p in pages]
    if all(c == PageClassification.DIGITAL_TEXT for c in classifications):
        overall_classification = PageClassification.DIGITAL_TEXT
    elif all(c == PageClassification.SCANNED_IMAGE for c in classifications):
        overall_classification = PageClassification.SCANNED_IMAGE
    else:
        overall_classification = PageClassification.HYBRID

    # Assemble full document text
    page_texts: List[str] = []
    for p in pages:
        header = f"--- Page {p.page_index + 1} ({p.classification.value}) ---"
        page_texts.append(f"{header}\n{p.digital_text}" if p.digital_text else header)
    full_text = "\n\n".join(page_texts)

    return DocumentExtractionResult(
        document_id=document_id,
        page_count=len(pages),
        pages=pages,
        overall_classification=overall_classification,
        full_text=full_text,
        extraction_duration_seconds=round(duration, 4),
        metadata={
            "total_pages_in_source": total_pages,
            "processed_pages_count": len(pages),
        },
    )
