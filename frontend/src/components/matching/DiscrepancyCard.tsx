"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  HelpCircle,
  Check,
  CheckCircle2,
} from "lucide-react";
import { formatCurrency } from "@/lib/tokens";

interface DiscrepancyProps {
  discrepancy: {
    discrepancy_type: string;
    severity: string;
    field_name: string;
    expected_value: string;
    observed_value: string;
    delta: number;
    message: string;
  };
}

export function DiscrepancyCard({ discrepancy }: DiscrepancyProps) {
  const [status, setStatus] = useState<"OPEN" | "ACKNOWLEDGED" | "RESOLVED">("OPEN");

  const isCritical = discrepancy.severity === "CRITICAL" && status === "OPEN";

  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        status === "RESOLVED"
          ? "bg-emerald-500/5 border-emerald-500/30"
          : status === "ACKNOWLEDGED"
          ? "bg-amber-500/5 border-amber-500/30"
          : isCritical
          ? "bg-rose-500/5 border-rose-500/30"
          : "bg-amber-500/5 border-amber-500/30"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className={`w-6 h-6 rounded flex items-center justify-center ${
              status === "RESOLVED"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : isCritical
                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
            }`}
          >
            {status === "RESOLVED" ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5" />
            )}
          </div>
          <div>
            <span className="font-semibold text-ink-primary text-xs">
              {discrepancy.discrepancy_type}
            </span>
            <span className="text-[10px] text-ink-muted ml-2 font-mono">
              Field: {discrepancy.field_name}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
              status === "RESOLVED"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : status === "ACKNOWLEDGED"
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
            }`}
          >
            {status}
          </span>
        </div>
      </div>

      {/* Narrative Message */}
      <p className="text-xs text-ink-secondary mb-3 leading-relaxed">
        {discrepancy.message}
      </p>

      {/* Side-by-Side Non-Presumptive Evidence Matrix */}
      <div className="p-3 rounded-lg bg-surface-card border border-hairline grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
        <div>
          <span className="text-[9px] uppercase font-bold text-ink-muted block">
            Approved PO Baseline
          </span>
          <span className="text-ink-secondary text-sm font-semibold">
            ${discrepancy.expected_value}
          </span>
        </div>

        <div>
          <span className="text-[9px] uppercase font-bold text-ink-muted block">
            Billed Invoice Value
          </span>
          <span className="text-rose-400 text-sm font-semibold">
            ${discrepancy.observed_value}
          </span>
        </div>

        <div className="sm:text-right">
          <span className="text-[9px] uppercase font-bold text-ink-muted block">
            Variance Delta
          </span>
          <span className="text-rose-400 text-sm font-bold">
            +${discrepancy.delta.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Action Controls & Policy Bar */}
      <div className="mt-3 pt-3 border-t border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1 text-[10px] text-ink-muted">
          <HelpCircle className="w-3 h-3 text-brand-light" />
          <span>Master Spec Non-Assumption rule: source evidence preserved for human decision.</span>
        </span>

        <div className="flex items-center gap-2 shrink-0">
          {status === "OPEN" && (
            <>
              <button
                onClick={() => setStatus("ACKNOWLEDGED")}
                className="px-2.5 py-1 rounded bg-surface-elevated hover:bg-amber-500/10 hover:text-amber-300 text-ink-secondary border border-hairline text-[11px] font-medium transition"
              >
                Acknowledge Variance
              </button>
              <button
                onClick={() => setStatus("RESOLVED")}
                className="px-2.5 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 text-[11px] font-medium transition flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                <span>Resolve as Credit</span>
              </button>
            </>
          )}

          {status === "ACKNOWLEDGED" && (
            <button
              onClick={() => setStatus("RESOLVED")}
              className="px-2.5 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 text-[11px] font-medium transition flex items-center gap-1"
            >
              <Check className="w-3 h-3" />
              <span>Mark Resolved</span>
            </button>
          )}

          <Link
            href="/documents/doc-inv-9041/review"
            className="px-2.5 py-1 rounded bg-brand/10 hover:bg-brand/20 text-brand-light border border-brand/20 text-[11px] font-medium transition flex items-center gap-1"
          >
            <span>Review Studio</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
