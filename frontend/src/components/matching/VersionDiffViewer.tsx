"use client";

import React from "react";
import { GitCompare, Plus, Minus, RefreshCw, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/tokens";

export function VersionDiffViewer() {
  const diffData = {
    doc_a: "INV-2026-9041-v1.pdf (Original Ingestion)",
    doc_b: "INV-2026-9041-v2.pdf (Supplier Revision)",
    net_variance: 50.0,
    has_differences: true,
    scalar_diffs: [
      {
        field: "subtotal",
        doc_a_val: "$10,200.00",
        doc_b_val: "$10,250.00",
        delta: "+$50.00",
        type: "MODIFIED",
      },
      {
        field: "total_amount",
        doc_a_val: "$11,220.00",
        doc_b_val: "$11,275.00",
        delta: "+$55.00",
        type: "MODIFIED",
      },
      {
        field: "payment_terms",
        doc_a_val: "Net 30 Days",
        doc_b_val: "Net 45 Days",
        delta: "Terms Extended",
        type: "MODIFIED",
      },
    ],
    line_diffs: [
      {
        item: "High-Capacity SAN Storage Node Tier 1",
        change: "Unit price increased from $3,600.00 to $3,625.00 (+$50.00 total impact)",
        type: "MODIFIED",
      },
    ],
  };

  return (
    <div className="p-4 rounded-xl bg-surface-card border border-hairline shadow-subtle-card space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-hairline">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
            <GitCompare className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink-primary">
              Document Version Diffing & Redline Audit
            </h3>
            <p className="text-[11px] text-ink-muted">
              Compares amended contract or revised invoice versions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-ink-muted">Net Financial Variance:</span>
          <span className="text-amber-400 font-bold">
            +{formatCurrency(diffData.net_variance)}
          </span>
        </div>
      </div>

      {/* Version Headers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="p-3 rounded-lg bg-surface-subtle border border-hairline flex items-center gap-2.5">
          <FileText className="w-4 h-4 text-ink-muted" />
          <div>
            <span className="text-[10px] uppercase font-mono text-ink-muted block">
              Version A (Baseline)
            </span>
            <span className="font-semibold text-ink-primary truncate">
              {diffData.doc_a}
            </span>
          </div>
        </div>
        <div className="p-3 rounded-lg bg-surface-subtle border border-hairline flex items-center gap-2.5">
          <FileText className="w-4 h-4 text-brand-light" />
          <div>
            <span className="text-[10px] uppercase font-mono text-brand-light block">
              Version B (Revision)
            </span>
            <span className="font-semibold text-ink-primary truncate">
              {diffData.doc_b}
            </span>
          </div>
        </div>
      </div>

      {/* Scalar Differences */}
      <div className="space-y-2">
        <span className="text-[11px] font-mono uppercase text-ink-muted font-semibold block">
          Detected Field Variances
        </span>
        <div className="space-y-1.5">
          {diffData.scalar_diffs.map((sd) => (
            <div
              key={sd.field}
              className="p-2.5 rounded-lg bg-surface-subtle border border-hairline flex items-center justify-between text-xs font-mono"
            >
              <div className="flex items-center gap-2">
                <RefreshCw className="w-3 h-3 text-amber-400" />
                <span className="font-semibold text-ink-primary uppercase text-[11px]">
                  {sd.field}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-ink-muted">{sd.doc_a_val}</span>
                <span className="text-ink-disabled">→</span>
                <span className="text-ink-primary font-bold">{sd.doc_b_val}</span>
                <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 text-[10px]">
                  {sd.delta}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
