"use client";

import React from "react";
import { AlertTriangle, ArrowRight, ShieldCheck, HelpCircle } from "lucide-react";
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
  const isCritical = discrepancy.severity === "CRITICAL";

  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        isCritical
          ? "bg-rose-500/5 border-rose-500/30"
          : "bg-amber-500/5 border-amber-500/30"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className={`w-6 h-6 rounded flex items-center justify-center ${
              isCritical
                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
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

        <span
          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
            isCritical
              ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
          }`}
        >
          {discrepancy.severity}
        </span>
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

      {/* Master Spec Policy Disclaimer */}
      <div className="mt-2.5 flex items-center justify-between text-[10px] text-ink-muted">
        <span className="flex items-center gap-1">
          <HelpCircle className="w-3 h-3 text-brand-light" />
          <strong>Master Spec Non-Assumption Rule:</strong> Neither document is presumed correct without human sign-off.
        </span>
        <span className="font-mono text-brand-light font-medium">
          Evidence Logged
        </span>
      </div>
    </div>
  );
}
