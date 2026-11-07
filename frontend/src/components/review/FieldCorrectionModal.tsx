"use client";

import React, { useState } from "react";
import { X, Check, Edit3, ShieldAlert } from "lucide-react";
import { ExtractedField } from "@/lib/api-client";

interface FieldCorrectionModalProps {
  isOpen: boolean;
  field: ExtractedField | null;
  onClose: () => void;
  onSaveField: (fieldName: string, newValue: string) => void;
}

export function FieldCorrectionModal({
  isOpen,
  field,
  onClose,
  onSaveField,
}: FieldCorrectionModalProps) {
  if (!isOpen || !field) return null;

  const [val, setVal] = useState(field.value);

  const handleSave = () => {
    onSaveField(field.name, val);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="fixed inset-0 -z-10" onClick={onClose} />
      <div className="w-full max-w-md bg-surface-elevated border border-hairline-strong rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-hairline bg-surface-subtle">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-brand/10 border border-brand/20 flex items-center justify-center">
              <Edit3 className="w-3.5 h-3.5 text-brand-light" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink-primary">
                Correct Extracted Field
              </h3>
              <p className="text-[10px] text-ink-muted">
                {field.label} • Page {field.page_number}
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

        {/* Form Body */}
        <div className="p-4 space-y-4 text-xs">
          <div>
            <label className="block text-ink-secondary font-medium mb-1">
              Corrected Normalized Value
            </label>
            <input
              type="text"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-card border border-hairline text-ink-primary font-mono text-sm focus:border-brand-light focus:outline-none"
              autoFocus
            />
            <p className="text-[10px] text-ink-muted mt-1 font-mono">
              Raw OCR reading was: &quot;{field.raw_value}&quot;
            </p>
          </div>

          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>Dual-Custody Notice (AUTH_SOD_002):</strong> Modifying this field records reviewer provenance in the immutable audit trail.
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
            onClick={handleSave}
            className="px-4 py-1.5 rounded-md bg-brand hover:bg-brand-light text-white text-xs font-semibold shadow-hairline-glow transition flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Apply Correction</span>
          </button>
        </div>
      </div>
    </div>
  );
}
