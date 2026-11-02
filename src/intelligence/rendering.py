"""
PDF Page Rendering Engine with Memory-Aware Streaming and High-DPI Safety.

Enforces deterministic scale formula:
    scale = DPI / 72.0
Configurable profiles:
    - 150 DPI (Draft / Thumbnail: scale = 2.0833)
    - 200 DPI (Standard OCR / Extraction: scale = 2.7778)
    - 250 DPI (High-Quality Financial Forms: scale = 3.4722)
    - 300 DPI (Archival / Dense Print: scale = 4.1667)
"""
from __future__ import annotations

import io
import math
import time
import tracemalloc
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from enum import IntEnum
from pathlib import Path
from typing import Generator, List, Optional, Tuple, Union

import PIL.Image
import pypdfium2 as pdfium


class DPIProfile(IntEnum):
    """Standardized DPI profiles for PDF rendering."""
    DRAFT = 150
    STANDARD = 200
    HIGH_QUALITY = 250
    ARCHIVAL = 300


DEFAULT_MAX_PAGE_PIXELS = 16_000_000  # 4000 x 4000 max pixels safety cap
DEFAULT_DPI = DPIProfile.STANDARD


def calculate_scale(dpi: Union[int, float, DPIProfile]) -> float:
    """
    Compute PDF rasterization scale factor adhering strictly to:
        scale = DPI / 72.0
    Standard PDF coordinate units are 72 points per inch.
    """
    dpi_val = float(dpi)
    if dpi_val <= 0:
        raise ValueError(f"DPI must be positive, got {dpi_val}")
    return dpi_val / 72.0


@dataclass
class RenderedPage:
    """Container for a rasterized PDF page with memory metadata."""
    page_index: int
    image: PIL.Image.Image
    width_px: int
    height_px: int
    dpi: int
    original_scale: float
    effective_scale: float
    is_oversized: bool
    page_width_pt: float
    page_height_pt: float

    def close(self) -> None:
        """Release underlying PIL image memory."""
        if hasattr(self.image, "close"):
            self.image.close()

    def __enter__(self) -> RenderedPage:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()


class PDFRenderer:
    """
    Production-grade PDF renderer with memory-aware streaming,
    oversized page downsampling, and concurrency benchmarks.
    """

    def __init__(
        self,
        default_dpi: Union[int, DPIProfile] = DEFAULT_DPI,
        max_page_pixels: int = DEFAULT_MAX_PAGE_PIXELS,
    ):
        self.default_dpi = int(default_dpi)
        self.max_page_pixels = max_page_pixels

    def compute_render_dimensions(
        self,
        page_width_pt: float,
        page_height_pt: float,
        dpi: Union[int, DPIProfile],
    ) -> Tuple[float, float, bool, int, int]:
        """
        Calculate target scale and pixel dimensions, clamping if page exceeds max_page_pixels.
        
        Returns:
            (target_scale, effective_scale, is_oversized, target_w_px, target_h_px)
        """
        target_scale = calculate_scale(dpi)
        raw_w = page_width_pt * target_scale
        raw_h = page_height_pt * target_scale
        total_pixels = raw_w * raw_h

        if total_pixels > self.max_page_pixels:
            is_oversized = True
            # Proportional downscale factor to fit within max_page_pixels
            downscale_ratio = math.sqrt(self.max_page_pixels / total_pixels)
            effective_scale = target_scale * downscale_ratio
            effective_w_px = max(1, int(round(page_width_pt * effective_scale)))
            effective_h_px = max(1, int(round(page_height_pt * effective_scale)))
        else:
            is_oversized = False
            effective_scale = target_scale
            effective_w_px = max(1, int(round(raw_w)))
            effective_h_px = max(1, int(round(raw_h)))

        return target_scale, effective_scale, is_oversized, effective_w_px, effective_h_px

    def render_single_page(
        self,
        page: pdfium.PdfPage,
        page_index: int,
        dpi: Optional[Union[int, DPIProfile]] = None,
    ) -> RenderedPage:
        """
        Rasterize a single PdfPage into a PIL.Image with strict scale and pixel boundaries.
        """
        chosen_dpi = int(dpi) if dpi is not None else self.default_dpi
        page_width_pt, page_height_pt = page.get_size()

        (
            target_scale,
            effective_scale,
            is_oversized,
            target_w_px,
            target_h_px,
        ) = self.compute_render_dimensions(page_width_pt, page_height_pt, chosen_dpi)

        # Render native bitmap with effective scale
        bitmap = page.render(scale=effective_scale)
        try:
            pil_image = bitmap.to_pil()
            # Ensure independent copy if required, or direct PIL image
        finally:
            bitmap.close()

        return RenderedPage(
            page_index=page_index,
            image=pil_image,
            width_px=target_w_px,
            height_px=target_h_px,
            dpi=chosen_dpi,
            original_scale=target_scale,
            effective_scale=effective_scale,
            is_oversized=is_oversized,
            page_width_pt=page_width_pt,
            page_height_pt=page_height_pt,
        )

    def render_pages_streaming(
        self,
        pdf_source: Union[str, Path, bytes, io.BytesIO],
        dpi: Optional[Union[int, DPIProfile]] = None,
        page_indices: Optional[List[int]] = None,
        max_pages: Optional[int] = None,
    ) -> Generator[RenderedPage, None, None]:
        """
        Stream rendered pages one by one as a generator.
        Releases each PdfPage from memory immediately after rasterization
        to ensure flat memory usage across 100+ page documents.
        """
        doc = pdfium.PdfDocument(pdf_source)
        try:
            total_pages = len(doc)
            target_indices = page_indices if page_indices is not None else list(range(total_pages))
            if max_pages is not None:
                target_indices = target_indices[:max_pages]

            for idx in target_indices:
                if idx < 0 or idx >= total_pages:
                    continue
                page = doc.get_page(idx)
                try:
                    rendered = self.render_single_page(page, page_index=idx, dpi=dpi)
                    yield rendered
                finally:
                    page.close()
        finally:
            doc.close()


def benchmark_cpu_memory_rendering(
    pdf_source: Union[str, Path, bytes, io.BytesIO],
    dpi: Union[int, DPIProfile] = DPIProfile.STANDARD,
    max_pages: Optional[int] = None,
) -> dict:
    """
    Measure CPU peak memory (tracemalloc) and throughput during streaming rasterization.
    """
    renderer = PDFRenderer(default_dpi=dpi)
    tracemalloc.start()
    start_time = time.perf_counter()

    pages_rendered = 0
    total_pixels = 0

    for rendered_page in renderer.render_pages_streaming(pdf_source, dpi=dpi, max_pages=max_pages):
        pages_rendered += 1
        total_pixels += rendered_page.width_px * rendered_page.height_px
        # Explicit disposal to simulate realistic pipeline consumption
        rendered_page.close()

    elapsed_seconds = max(1e-6, time.perf_counter() - start_time)
    current_mem, peak_mem = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    peak_mb = peak_mem / (1024 * 1024)
    pages_per_sec = pages_rendered / elapsed_seconds
    mpixels_per_sec = (total_pixels / 1_000_000) / elapsed_seconds

    return {
        "pages_rendered": pages_rendered,
        "elapsed_seconds": round(elapsed_seconds, 4),
        "pages_per_second": round(pages_per_sec, 2),
        "megapixels_per_second": round(mpixels_per_sec, 2),
        "peak_memory_mb": round(peak_mb, 2),
        "dpi": int(dpi),
        "scale": round(calculate_scale(dpi), 4),
    }


def benchmark_concurrent_rendering(
    pdf_source_bytes: bytes,
    dpi: Union[int, DPIProfile] = DPIProfile.STANDARD,
    concurrency: int = 4,
    pages_per_worker: int = 2,
) -> dict:
    """
    Benchmark multi-threaded rendering across concurrent workers.
    Each worker gets an independent PdfDocument handle from the byte buffer.
    """
    renderer = PDFRenderer(default_dpi=dpi)

    def _worker(worker_id: int) -> Tuple[int, int, float]:
        start = time.perf_counter()
        count = 0
        px = 0
        for page in renderer.render_pages_streaming(
            pdf_source_bytes, dpi=dpi, max_pages=pages_per_worker
        ):
            count += 1
            px += page.width_px * page.height_px
            page.close()
        duration = time.perf_counter() - start
        return worker_id, count, duration

    start_all = time.perf_counter()
    results = []

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [executor.submit(_worker, i) for i in range(concurrency)]
        for fut in as_completed(futures):
            results.append(fut.result())

    total_duration = time.perf_counter() - start_all
    total_pages = sum(r[1] for r in results)

    return {
        "concurrency": concurrency,
        "total_pages_rendered": total_pages,
        "total_duration_seconds": round(total_duration, 4),
        "effective_throughput_pages_per_sec": round(total_pages / max(1e-6, total_duration), 2),
        "worker_durations": [round(r[2], 4) for r in results],
    }
