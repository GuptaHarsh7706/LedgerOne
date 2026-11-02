"""
Auditable Multi-Process Rendering Memory & Throughput Benchmark.
Measures coordinator process + worker processes with explicit PIDs, RSS, and multi-trial statistics.
"""
import io
import os
import sys
import time
import json
import statistics
import concurrent.futures
from typing import Dict, List, Tuple, Any
import psutil
import pypdfium2

# Ensure LedgerOne root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.intelligence.rendering import PDFRenderer, DPIProfile


def _render_worker_task(args: Tuple[bytes, int, int]) -> Dict[str, Any]:
    pdf_bytes, dpi, num_pages = args
    proc = psutil.Process()
    worker_pid = proc.pid
    
    t0_init = time.perf_counter()
    renderer = PDFRenderer(default_dpi=dpi)
    t0_render = time.perf_counter()
    init_dur = t0_render - t0_init
    
    pages_rendered = 0
    for page in renderer.render_pages_streaming(pdf_bytes, dpi=dpi, max_pages=num_pages):
        pages_rendered += 1
        page.close()
        
    render_dur = max(1e-6, time.perf_counter() - t0_render)
    worker_rss_mb = proc.memory_info().rss / (1024 * 1024)
    
    return {
        "worker_pid": worker_pid,
        "pages_rendered": pages_rendered,
        "init_duration_sec": round(init_dur, 4),
        "render_duration_sec": round(render_dur, 4),
        "worker_rss_mb": round(worker_rss_mb, 2),
    }


def run_rendering_memory_audit(
    num_pages_total: int = 20,
    dpi: int = 200,
    worker_counts: List[int] = [1, 2, 4],
    trials: int = 5,
) -> Dict[str, Any]:
    # 1. Create 20-page test PDF
    doc = pypdfium2.PdfDocument.new()
    for _ in range(num_pages_total):
        doc.new_page(width=612, height=792)  # Standard 8.5x11 inches
    buf = io.BytesIO()
    doc.save(buf)
    pdf_bytes = buf.getvalue()
    
    coordinator_proc = psutil.Process()
    coordinator_pid = coordinator_proc.pid
    
    results_by_workers = {}
    
    for w in worker_counts:
        pages_per_worker = max(1, num_pages_total // w)
        trial_data = []
        
        for t in range(trials):
            coord_rss_before = coordinator_proc.memory_info().rss / (1024 * 1024)
            t_wall_start = time.perf_counter()
            
            tasks = [(pdf_bytes, dpi, pages_per_worker) for _ in range(w)]
            
            with concurrent.futures.ProcessPoolExecutor(max_workers=w) as executor:
                worker_results = list(executor.map(_render_worker_task, tasks))
                
            t_wall_dur = max(1e-6, time.perf_counter() - t_wall_start)
            coord_rss_after = coordinator_proc.memory_info().rss / (1024 * 1024)
            
            total_pages_rendered = sum(r["pages_rendered"] for r in worker_results)
            max_render_dur = max(r["render_duration_sec"] for r in worker_results)
            warm_throughput = round(total_pages_rendered / max_render_dur, 2)
            wall_throughput = round(total_pages_rendered / t_wall_dur, 2)
            
            worker_pids = [r["worker_pid"] for r in worker_results]
            worker_rss_list = [r["worker_rss_mb"] for r in worker_results]
            sum_worker_rss = sum(worker_rss_list)
            
            # Formally reconciled aggregate memory:
            # Aggregate RSS = Coordinator RSS + sum(Worker RSS)
            # Total processes = 1 (coordinator) + W (workers) = 1 + W
            aggregate_system_rss = round(coord_rss_after + sum_worker_rss, 2)
            worker_only_rss = round(sum_worker_rss, 2)
            
            trial_data.append({
                "trial": t + 1,
                "coordinator_pid": coordinator_pid,
                "coordinator_rss_mb": round(coord_rss_after, 2),
                "worker_pids": worker_pids,
                "worker_rss_list": worker_rss_list,
                "num_processes_total": 1 + len(worker_results),
                "num_worker_processes": len(worker_results),
                "worker_only_rss_mb": worker_only_rss,
                "aggregate_system_rss_mb": aggregate_system_rss,
                "total_pages_rendered": total_pages_rendered,
                "warm_render_duration_sec": max_render_dur,
                "wall_duration_sec": round(t_wall_dur, 4),
                "warm_throughput_pages_sec": warm_throughput,
                "wall_throughput_pages_sec": wall_throughput,
            })
            
        # Summary statistics across trials
        warm_tputs = [td["warm_throughput_pages_sec"] for td in trial_data]
        wall_tputs = [td["wall_throughput_pages_sec"] for td in trial_data]
        coord_rss_vals = [td["coordinator_rss_mb"] for td in trial_data]
        worker_sum_rss_vals = [td["worker_only_rss_mb"] for td in trial_data]
        agg_rss_vals = [td["aggregate_system_rss_mb"] for td in trial_data]
        
        results_by_workers[f"{w}_workers"] = {
            "worker_count": w,
            "processes_included": 1 + w,
            "trials_run": trials,
            "warm_throughput": {
                "mean": round(statistics.mean(warm_tputs), 2),
                "std": round(statistics.stdev(warm_tputs) if len(warm_tputs) > 1 else 0.0, 2),
                "min": min(warm_tputs),
                "max": max(warm_tputs),
            },
            "wall_throughput": {
                "mean": round(statistics.mean(wall_tputs), 2),
                "std": round(statistics.stdev(wall_tputs) if len(wall_tputs) > 1 else 0.0, 2),
                "min": min(wall_tputs),
                "max": max(wall_tputs),
            },
            "coordinator_rss_mb": {
                "mean": round(statistics.mean(coord_rss_vals), 2),
                "std": round(statistics.stdev(coord_rss_vals) if len(coord_rss_vals) > 1 else 0.0, 2),
            },
            "worker_only_aggregate_rss_mb": {
                "mean": round(statistics.mean(worker_sum_rss_vals), 2),
                "std": round(statistics.stdev(worker_sum_rss_vals) if len(worker_sum_rss_vals) > 1 else 0.0, 2),
            },
            "aggregate_system_rss_mb": {
                "mean": round(statistics.mean(agg_rss_vals), 2),
                "std": round(statistics.stdev(agg_rss_vals) if len(agg_rss_vals) > 1 else 0.0, 2),
                "min": min(agg_rss_vals),
                "max": max(agg_rss_vals),
            },
            "per_worker_mean_rss_mb": round(statistics.mean(worker_sum_rss_vals) / w, 2),
            "sample_trial_detail": trial_data[0],
            "all_trials": trial_data,
        }
        
    return {
        "benchmark_name": "Multi-Process PDFium Memory & Scaling Reconciliation",
        "workload": f"{num_pages_total} pages at {dpi} DPI (dimensions 1700x2200 pixels)",
        "dpi": dpi,
        "trials_per_configuration": trials,
        "results_by_workers": results_by_workers,
    }


if __name__ == "__main__":
    audit = run_rendering_memory_audit()
    output_path = os.path.join(os.path.dirname(__file__), "rendering_memory_audit_results.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(audit, f, indent=2)
    print("Rendering memory audit complete! Saved to:", output_path)
