"use client";

import React, { useState } from "react";
import { X, ShieldCheck, AlertTriangle } from "lucide-react";
import { InvariantResult } from "@/lib/api-client";

interface AuditorOverrideModalProps {
  isOpen: boolean;
  invariant: InvariantResult | null;
  onClose: () => void;
  onConfirmOverride: (invariantId: string, rationale: string) => void;
}

export function AuditorOverrideModal({
  isOpen,
  invariant,
  onClose,
  onConfirmOverride,
}: AuditorOverrideModalProps) {
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState("");

  if (!isOpen || !invariant) return null;

  const handleConfirm = () => {
    if (rationale.trim().length < 10) {
      setError("Documented auditor rationale must be at least 10 characters.");
      return;
    }
    onConfirmOverride(invariant.invariant_id, rationale);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="fixed inset-0 -z-10" onClick={onClose} />
      <div className="w-full max-w-md bg-surface-elevated border border-hairline-strong rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-hairline bg-surface-subtle">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink-primary">
                INV-010 Auditor Invariant Override
              </h3>
              <p className="text-[10px] text-ink-muted">
                Documented governance exemption with audit trail recording
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-ink-muted hover:text-ink-primary transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 text-xs">
          <div className="p-3 rounded-lg bg-surface-card border border-hairline space-y-1">
            <div className="font-semibold text-ink-primary">
              {invariant.invariant_id}: {invariant.name}
            </div>
            <div className="text-[11px] font-mono text-ink-muted">
              Expected: {invariant.expected_value} | Observed: {invariant.observed_value}
            </div>
          </div>

          <div>
            <label className="block text-ink-secondary font-medium mb-1">
              Documented Audit Exemption Rationale (Mandatory)
            </label>
            <textarea
              rows={3}
              value={rationale}
              onChange={(e) => {
                setRationale(e.target.value);
                if (error) setError("");
              }}
              placeholder="State the commercial or regulatory justification for overriding this variance (e.g., 'Vendor contracted round-down policy applied on foreign exchange rate')..."
              className="w-full px-3 py-2 rounded-lg bg-surface-card border border-hairline text-ink-primary placeholder-ink-muted focus:border-brand-light focus:outline-none"
            />
            {error && <p className="text-[10px] text-rose-400 mt-1">{error}</p>}
          </div>

          <div className="p-2.5 rounded-lg bg-surface-subtle border border-hairline text-[10px] text-ink-muted flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-brand-light shrink-0 mt-0.5" />
            <span>
              This override action will be permanently recorded in PostgreSQL audit logs and attached to the verified document export bundle.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-hairline bg-surface-subtle flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs text-ink-secondary hover:text-ink-primary transition"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-1.5 rounded-md bg-amber-500 hover:bg-amber-600 text-black text-xs font-semibold shadow-hairline-glow transition"
          >
            Authorize Exemption
          </button>
        </div>
      </div>
    </div>
  );
}
