"""
Unit and integration tests for PDF rendering, DPI scaling profiles,
oversized page protection, streaming generators, and memory benchmarks.
"""
import io
import math
import pytest
import PIL.Image
import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c
import ctypes

from src.intelligence.rendering import (
    DPIProfile,
    PDFRenderer,
    RenderedPage,
    benchmark_concurrent_rendering,
    benchmark_cpu_memory_rendering,
    benchmark_long_document_streaming,
    benchmark_repeated_rendering,
    calculate_scale,
)


def _generate_test_pdf(
    page_count: int = 1,
    page_width: float = 612.0,
    page_height: float = 792.0,
) -> bytes:
    """Helper to synthesize an in-memory PDF with specified dimensions."""
    doc = pdfium.PdfDocument.new()
    font = pdfium.PdfFont.load_standard(doc, "Helvetica")

    for i in range(page_count):
        page = doc.new_page(page_width, page_height)
        raw_obj = pdfium_c.FPDFPageObj_CreateTextObj(doc.raw, font.raw, 14.0)
        tb = pdfium.PdfTextObj(raw_obj, None, doc)
        text = f"LedgerOne Render Test - Page {i + 1}"
        u16 = (ctypes.c_ushort * (len(text) + 1))(*[ord(c) for c in text], 0)
        pdfium_c.FPDFText_SetText(raw_obj, u16)
        tb.transform(pdfium.PdfMatrix(1, 0, 0, 1, 72.0, page_height - 72.0))
        page.insert_obj(tb)
        page.gen_content()

    bio = io.BytesIO()
    doc.save(bio)
    doc.close()
    return bio.getvalue()


class TestPDFRendering:
    """Test suite for PDF rendering engine."""

    def test_dpi_scale_formula(self):
        """Verify scale = DPI / 72.0 across all configured profiles."""
        assert math.isclose(calculate_scale(150), 150.0 / 72.0, rel_tol=1e-5)
        assert math.isclose(calculate_scale(DPIProfile.DRAFT), 150.0 / 72.0, rel_tol=1e-5)

        assert math.isclose(calculate_scale(200), 200.0 / 72.0, rel_tol=1e-5)
        assert math.isclose(calculate_scale(DPIProfile.STANDARD), 200.0 / 72.0, rel_tol=1e-5)

        assert math.isclose(calculate_scale(250), 250.0 / 72.0, rel_tol=1e-5)
        assert math.isclose(calculate_scale(DPIProfile.HIGH_QUALITY), 250.0 / 72.0, rel_tol=1e-5)

        assert math.isclose(calculate_scale(300), 300.0 / 72.0, rel_tol=1e-5)
        assert math.isclose(calculate_scale(DPIProfile.ARCHIVAL), 300.0 / 72.0, rel_tol=1e-5)

        # Non-standard DPI
        assert math.isclose(calculate_scale(72), 1.0, rel_tol=1e-5)
        assert math.isclose(calculate_scale(144), 2.0, rel_tol=1e-5)

        # Invalid DPI rejection
        with pytest.raises(ValueError, match="DPI must be positive"):
            calculate_scale(0)
        with pytest.raises(ValueError, match="DPI must be positive"):
            calculate_scale(-50)

    def test_render_single_page_standard_dimensions(self):
        """Verify single page rasterization dimensions at 200 DPI."""
        pdf_bytes = _generate_test_pdf(page_count=1, page_width=612.0, page_height=792.0)
        renderer = PDFRenderer(default_dpi=DPIProfile.STANDARD)

        pages = list(renderer.render_pages_streaming(pdf_bytes, dpi=200))
        assert len(pages) == 1

        page = pages[0]
        assert page.page_index == 0
        assert page.dpi == 200
        assert not page.is_oversized

        # Expected dimensions at scale = 200 / 72 = 2.777777...
        # 612 * (200 / 72) = 1700 px
        # 792 * (200 / 72) = 2200 px
        assert page.width_px == 1700
        assert page.height_px == 2200
        assert page.image.size == (1700, 2200)
        assert page.image.mode == "RGB"

        page.close()

    def test_oversized_page_downscaling_protection(self):
        """Verify downscale protection prevents memory exhaustion on massive blueprint pages."""
        # Massive page: 3000 x 4000 pt at 300 DPI would raw be 12500 x 16667 px (> 208 Mpx)
        max_pixels_cap = 4_000_000  # Cap at 4 Megapixels (e.g. 2000x2000)
        pdf_bytes = _generate_test_pdf(page_count=1, page_width=3000.0, page_height=4000.0)

        renderer = PDFRenderer(default_dpi=300, max_page_pixels=max_pixels_cap)
        pages = list(renderer.render_pages_streaming(pdf_bytes, dpi=300))
        assert len(pages) == 1

        page = pages[0]
        assert page.is_oversized is True
        total_px = page.width_px * page.height_px
        assert total_px <= max_pixels_cap

        # Verify aspect ratio preserved (3000 / 4000 = 0.75)
        rendered_ratio = page.width_px / page.height_px
        assert math.isclose(rendered_ratio, 0.75, rel_tol=0.01)
        assert page.effective_scale < page.original_scale

        page.close()

    def test_streaming_pages_generator(self):
        """Verify multi-page PDF streams pages sequentially with independent context management."""
        page_count = 3
        pdf_bytes = _generate_test_pdf(page_count=page_count, page_width=612.0, page_height=792.0)
        renderer = PDFRenderer(default_dpi=150)

        stream = renderer.render_pages_streaming(pdf_bytes, dpi=150)
        received_indices = []

        for p in stream:
            with p:
                received_indices.append(p.page_index)
                assert p.width_px == int(round(612.0 * (150.0 / 72.0)))  # 1275 px
                assert p.height_px == int(round(792.0 * (150.0 / 72.0)))  # 1650 px

        assert received_indices == [0, 1, 2]

    def test_cpu_memory_and_throughput_benchmark(self):
        """Verify CPU memory tracking (tracemalloc + psutil process RSS) and throughput benchmark."""
        pdf_bytes = _generate_test_pdf(page_count=3, page_width=612.0, page_height=792.0)
        metrics = benchmark_cpu_memory_rendering(pdf_bytes, dpi=DPIProfile.DRAFT)

        assert metrics["pages_rendered"] == 3
        assert metrics["elapsed_seconds"] > 0
        assert metrics["pages_per_second"] > 0
        assert metrics["megapixels_per_second"] > 0
        assert metrics["peak_memory_mb"] > 0
        assert metrics["dpi"] == 150
        # Validate psutil process-level RSS tracking
        assert "initial_rss_mb" in metrics and metrics["initial_rss_mb"] > 0
        assert "peak_rss_mb" in metrics and metrics["peak_rss_mb"] >= metrics["initial_rss_mb"]
        assert "rss_delta_mb" in metrics

    def test_concurrent_rendering_benchmark(self):
        """Verify multi-threaded concurrent rasterization benchmark across worker threads."""
        pdf_bytes = _generate_test_pdf(page_count=2, page_width=612.0, page_height=792.0)
        concurrency = 2
        results = benchmark_concurrent_rendering(
            pdf_bytes,
            dpi=DPIProfile.DRAFT,
            concurrency=concurrency,
            pages_per_worker=1,
        )

        assert results["concurrency"] == concurrency
        assert results["total_pages_rendered"] == concurrency
        assert results["total_duration_seconds"] > 0
        assert results["effective_throughput_pages_per_sec"] > 0
        assert len(results["worker_durations"]) == concurrency

    def test_long_document_streaming_memory_stability(self):
        """Verify that streaming a multi-page document maintains flat O(1) memory footprint."""
        pdf_bytes = _generate_test_pdf(page_count=10, page_width=612.0, page_height=792.0)
        stability = benchmark_long_document_streaming(pdf_bytes, dpi=DPIProfile.DRAFT, page_chunk_size=5)

        assert stability["total_pages"] == 10
        assert stability["memory_stable"] is True
        assert stability["rss_growth_mb"] < 25.0

    def test_repeated_rendering_zero_leakage(self):
        """Verify that repeated rasterization runs dispose allocations cleanly with zero cumulative leak."""
        pdf_bytes = _generate_test_pdf(page_count=2, page_width=612.0, page_height=792.0)
        leak_res = benchmark_repeated_rendering(pdf_bytes, iterations=5, dpi=DPIProfile.DRAFT)

        assert leak_res["iterations"] == 5
        assert leak_res["leak_free"] is True
        assert leak_res["rss_growth_mb"] < 15.0

    def test_thread_isolation_object_lifecycle(self):
        """Verify PDFium object lifecycle and thread safety via process-level PDFIUM_LOCK synchronization."""
        from concurrent.futures import ThreadPoolExecutor

        pdf_bytes = _generate_test_pdf(page_count=2, page_width=612.0, page_height=792.0)
        renderer = PDFRenderer(default_dpi=DPIProfile.DRAFT)

        def _isolated_render(worker_id: int) -> int:
            # Each worker streams pages through PDFRenderer which guarantees PDFIUM_LOCK safety
            pages = list(renderer.render_pages_streaming(pdf_bytes, dpi=DPIProfile.DRAFT))
            assert len(pages) == 2
            for p in pages:
                p.close()
            return worker_id

        with ThreadPoolExecutor(max_workers=4) as ex:
            futs = [ex.submit(_isolated_render, i) for i in range(4)]
            results = [f.result() for f in futs]

        assert sorted(results) == [0, 1, 2, 3]
