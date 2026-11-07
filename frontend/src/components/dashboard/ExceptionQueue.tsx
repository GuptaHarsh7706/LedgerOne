"use client";

import React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { formatCurrency } from "@/lib/tokens";

export function ExceptionQueue() {
  const exceptions = [
    {
      id: "doc-inv-9041",
      filename: "INV-2026-9041_DataCore.pdf",
      vendor: "DataCore Enterprise Inc",
      amount: 11220.0,
      discrepancyType: "PRICE_VARIANCE (MATCH-002)",
      severity: "CRITICAL",
      description: "Unit price $3,600.00 exceeds approved PO rate $3,000.00 by +$600.00/unit.",
      invariantsFailed: ["INV-002", "MATCH-002"],
      uploader: "Alex Morgan (AP Operator)",
    },
    {
      id: "doc-inv-7721",
      filename: "INV-2026-7721_ApexCompute.pdf",
      vendor: "Apex Compute LLC",
      amount: 4500.0,
      discrepancyType: "QUANTITY_OVERBILLING (MATCH-001)",
      severity: "CRITICAL",
      description: "Billed 10 units vs 7 verified on Goods Receipt Note (short shipment of 3 units).",
      invariantsFailed: ["MATCH-001"],
      uploader: "Chris Evans (Logistics)",
    },
  ];

  return (
    <div className="p-4 rounded-xl bg-surface-card border border-hairline shadow-subtle-card">
      <div className="flex items-center justify-between pb-3 border-b border-hairline mb-3">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <AlertTriangle className="w-3 h-3 text-rose-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink-primary">
              Active Exception Review Queue
            </h2>
            <p className="text-[11px] text-ink-muted">
              Accounting invariant failures & cross-document 3-way match anomalies
            </p>
          </div>
        </div>
        <Link
          href="/review-queue"
          className="text-xs text-brand-light hover:underline flex items-center gap-1 font-medium"
        >
          <span>Open Full Queue</span>
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="space-y-3">
        {exceptions.map((item) => (
          <div
            key={item.id}
            className="p-3 rounded-lg bg-surface-subtle border border-rose-500/20 hover:border-rose-500/40 transition flex flex-col md:flex-row md:items-center justify-between gap-3"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-ink-primary text-xs">
                  {item.filename}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  {item.discrepancyType}
                </span>
                <span className="text-[11px] font-mono font-medium text-ink-primary tabular-nums">
                  {formatCurrency(item.amount)}
                </span>
              </div>
              <p className="text-xs text-ink-secondary">{item.description}</p>
              <div className="flex items-center gap-2 text-[11px] text-ink-muted">
                <span>Vendor: <strong className="text-ink-secondary">{item.vendor}</strong></span>
                <span>•</span>
                <span>Uploader: {item.uploader}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Link
                href={`/documents/${item.id}/review`}
                className="px-3 py-1.5 rounded-md bg-brand hover:bg-brand-light text-white text-xs font-semibold shadow-hairline-glow transition flex items-center gap-1.5"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Claim & Inspect</span>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
