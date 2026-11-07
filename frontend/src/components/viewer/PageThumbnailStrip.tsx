"use client";

import React from "react";
import { FileText } from "lucide-react";

interface PageThumbnailStripProps {
  pageCount: number;
  currentPage: number;
  onSelectPage: (page: number) => void;
  pageConfidences?: number[];
}

export function PageThumbnailStrip({
  pageCount,
  currentPage,
  onSelectPage,
  pageConfidences = [0.96, 0.94],
}: PageThumbnailStripProps) {
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <div className="w-48 bg-surface-subtle border-r border-hairline flex flex-col h-full shrink-0 select-none">
      <div className="p-3 border-b border-hairline text-[11px] font-semibold text-ink-muted uppercase tracking-wider flex items-center justify-between">
        <span>Pages ({pageCount})</span>
        <span className="font-mono text-[10px] text-brand-light">200 DPI</span>
      </div>

      <div className="flex-1 p-3 space-y-3 overflow-y-auto">
        {pages.map((p) => {
          const isSelected = p === currentPage;
          const conf = pageConfidences[p - 1] ?? 0.95;

          return (
            <button
              key={p}
              onClick={() => onSelectPage(p)}
              className={`w-full group text-left transition rounded-lg overflow-hidden border ${
                isSelected
                  ? "border-brand-light ring-1 ring-brand-light bg-surface-card"
                  : "border-hairline hover:border-hairline-strong bg-surface-card/60"
              }`}
            >
              {/* Simulated Document Preview Page Canvas */}
              <div className="h-44 p-2 bg-white flex flex-col justify-between relative overflow-hidden select-none">
                <div className="space-y-1">
                  {/* Visual Skeleton representing document text blocks */}
                  <div className="h-2 w-16 bg-slate-300 rounded" />
                  <div className="h-1.5 w-24 bg-slate-200 rounded" />
                  <div className="h-1 w-20 bg-slate-200 rounded" />
                  <div className="pt-2 space-y-1">
                    <div className="h-1 w-full bg-slate-200 rounded" />
                    <div className="h-1 w-full bg-slate-200 rounded" />
                    <div className="h-1 w-3/4 bg-slate-200 rounded" />
                  </div>
                  {/* Visual Table Grid Representation */}
                  <div className="pt-2 border-t border-slate-200 mt-2">
                    <div className="h-1.5 w-full bg-slate-300 rounded mb-1" />
                    <div className="h-1 w-full bg-slate-200 rounded mb-0.5" />
                    <div className="h-1 w-full bg-slate-200 rounded mb-0.5" />
                    <div className="h-1 w-full bg-slate-200 rounded" />
                  </div>
                </div>

                {/* Bottom Total Block Representation */}
                <div className="flex justify-end pt-2 border-t border-slate-200">
                  <div className="h-2 w-12 bg-slate-400 rounded" />
                </div>

                {/* Page Number Badge */}
                <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-mono text-white">
                  P.{p}
                </div>
              </div>

              {/* Page Metadata Bar */}
              <div className="p-2 bg-surface-card flex items-center justify-between text-[11px]">
                <span className="font-medium text-ink-secondary">Page {p}</span>
                <span
                  className={`text-[10px] font-mono font-medium ${
                    conf >= 0.9 ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {(conf * 100).toFixed(0)}% OCR
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
