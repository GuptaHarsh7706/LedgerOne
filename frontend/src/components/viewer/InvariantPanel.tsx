"use client";

import React from "react";
import { CheckCircle2, AlertTriangle, ShieldCheck, Lock } from "lucide-react";
import { InvariantResult } from "@/lib/api-client";

interface InvariantPanelProps {
  invariants: InvariantResult[];
  onOpenOverrideModal?: (inv: InvariantResult) => void;
}

export function InvariantPanel({
  invariants,
  onOpenOverrideModal,
}: InvariantPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-ink-primary">
          Mathematical Invariant Validation
        </span>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          Pure Decimal Precision
        </span>
      </div>

      <div className="space-y-2">
        {invariants.map((inv) => (
          <div
            key={inv.invariant_id}
            className={`p-2.5 rounded-lg border text-xs transition ${
              inv.is_valid
                ? "bg-surface-card border-hairline"
                : "bg-amber-500/5 border-amber-500/30"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                {inv.is_valid ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                )}
                <span className="font-semibold text-ink-primary">
                  {inv.invariant_id}: {inv.name}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {inv.hard_stop && (
                  <span
                    className="flex items-center gap-0.5 text-[9px] font-mono text-ink-muted bg-surface-elevated px-1.5 py-0.2 rounded border border-hairline"
                    title="Hard-Stop Invariant: Cannot be overridden"
                  >
                    <Lock className="w-2.5 h-2.5" /> Hard Stop
                  </span>
                )}
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                    inv.is_valid
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  }`}
                >
                  {inv.is_valid ? "VALID" : "FLAGGED"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[10px] font-mono bg-surface-subtle p-1.5 rounded border border-hairline">
              <div>
                <span className="text-ink-muted block text-[9px]">EXPECTED</span>
                <span className="text-ink-secondary">{inv.expected_value}</span>
              </div>
              <div>
                <span className="text-ink-muted block text-[9px]">OBSERVED</span>
                <span className="text-ink-primary font-medium">{inv.observed_value}</span>
              </div>
              <div className="text-right">
                <span className="text-ink-muted block text-[9px]">DELTA</span>
                <span className={inv.delta === "0.00" ? "text-emerald-400" : "text-amber-400 font-semibold"}>
                  {inv.delta}
                </span>
              </div>
            </div>

            {!inv.is_valid && !inv.hard_stop && onOpenOverrideModal && (
              <div className="mt-2 pt-2 border-t border-hairline flex items-center justify-between">
                <span className="text-[10px] text-ink-muted">
                  Requires auditor justification to override
                </span>
                <button
                  onClick={() => onOpenOverrideModal(inv)}
                  className="px-2 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 text-[10px] font-medium transition"
                >
                  Override Invariant
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
