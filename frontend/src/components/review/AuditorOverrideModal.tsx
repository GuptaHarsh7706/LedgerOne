"use client";

import React, { useState } from "react";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { InvariantResult } from "@/lib/api-client";
import { Modal, Button } from "@/components/ui";

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Auditor Invariant Override"
      description="Documented governance exemption with audit trail recording"
      maxWidth="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleConfirm}
            icon={<ShieldCheck className="w-3.5 h-3.5" />}
          >
            Confirm & Log Exemption
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        <div className="p-3 rounded-xl bg-surface-card border border-hairline space-y-1">
          <div className="font-semibold text-ink-primary">
            {invariant.invariant_id}: {invariant.name}
          </div>
          <div className="text-[11px] font-mono text-ink-muted">
            Expected: {invariant.expected_value} · Observed: {invariant.observed_value}
          </div>
        </div>

        <div>
          <label className="block text-ink-secondary font-medium mb-1.5">
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
            className="w-full px-3 py-2 rounded-xl bg-surface-card border border-hairline text-ink-primary placeholder-ink-muted focus:border-brand-light focus:outline-none text-xs"
          />
          {error && <p className="text-[11px] text-rose-400 mt-1">{error}</p>}
        </div>

        <div className="p-3 rounded-xl bg-surface-subtle border border-hairline text-[11px] text-ink-muted flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-brand-light shrink-0 mt-0.5" />
          <span className="leading-relaxed">
            This override action will be permanently recorded in PostgreSQL audit logs and attached to the verified document export bundle.
          </span>
        </div>
      </div>
    </Modal>
  );
}
