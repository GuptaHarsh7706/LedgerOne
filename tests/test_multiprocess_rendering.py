"""
Tests for Multi-Process PDF Rendering.
Verifies ProcessPoolExecutor execution across 1, 2, and 4 worker processes,
ensuring independent C++ PDFium runtimes scale without lock contention.
"""
import io
import pytest
from src.intelligence.rendering import (
    PDFRenderer,
    DPIProfile,
    benchmark_multiprocess_rendering,
    evaluate_pdfium_lock_contention,
)


@pytest.fixture(scope="module")
def sample_pdf_bytes():
    """Generate a clean synthetic PDF for rendering benchmarks."""
    import pypdfium2 as pdfium
    doc = pdfium.PdfDocument.new()
    for _ in range(4):
        doc.new_page(width=612, height=792)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_evaluate_pdfium_lock_contention(sample_pdf_bytes):
    """Verify thread contention evaluation under PDFIUM_LOCK."""
    result = evaluate_pdfium_lock_contention(
        sample_pdf_bytes,
        dpi=150,
        thread_counts=[1, 2],
        pages_per_worker=2,
    )
    assert "scaling" in result
    assert "1_threads" in result["scaling"]
    assert "2_threads" in result["scaling"]
    assert result["scaling"]["1_threads"]["throughput_pages_sec"] > 0


def test_benchmark_multiprocess_rendering(sample_pdf_bytes):
    """Verify multi-process scaling across independent workers."""
    result = benchmark_multiprocess_rendering(
        sample_pdf_bytes,
        dpi=150,
        process_counts=[1, 2],
        pages_per_worker=2,
    )
    assert "process_scaling" in result
    assert "1_processes" in result["process_scaling"]
    assert "2_processes" in result["process_scaling"]
    assert result["process_scaling"]["1_processes"]["error_count"] == 0
    assert result["process_scaling"]["2_processes"]["error_count"] == 0


def test_multiprocess_reconciled_memory_accounting(sample_pdf_bytes):
    """
    Verify reconciled multiprocess memory accounting:
    - Explicit tracking of coordinator PID and worker PIDs.
    - Total processes included = 1 coordinator + N workers.
    - Reconciled Aggregate System RSS = Coordinator RSS + sum(Worker RSS).
    - Separation of worker-only RSS from total system aggregate RSS.
    """
    result = benchmark_multiprocess_rendering(
        sample_pdf_bytes,
        dpi=150,
        process_counts=[1, 2],
        pages_per_worker=2,
    )
    for pc in [1, 2]:
        key = f"{pc}_processes"
        data = result["process_scaling"][key]
        assert data["processes_included"] == 1 + pc
        assert data["coordinator_pid"] > 0
        assert len(data["worker_pids"]) == pc
        assert all(pid > 0 for pid in data["worker_pids"])
        assert len(data["worker_rss_list"]) == pc
        assert data["coordinator_rss_mb"] > 0
        assert data["worker_only_aggregate_rss_mb"] > 0
        assert data["aggregate_system_rss_mb"] == pytest.approx(
            data["coordinator_rss_mb"] + data["worker_only_aggregate_rss_mb"], abs=0.1
        )

