"use client";

import React, { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { ExtractedField } from "@/lib/api-client";
import { Modal, Button, Input } from "@/components/ui";

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Correct Field"
      description={`${field.label} · Page ${field.page_number}`}
      maxWidth="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave}>
            Apply Correction
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        <div>
          <Input
            label="Corrected Normalized Value"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="font-mono text-sm"
            autoFocus
          />
          <p className="text-[10px] text-ink-muted mt-1 font-mono">
            Raw OCR reading: &quot;{field.raw_value}&quot;
          </p>
        </div>

        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span className="leading-relaxed">
            <strong>Dual-Custody Notice (AUTH_SOD_002):</strong> Modifying this field records reviewer provenance in the immutable audit trail.
          </span>
        </div>
      </div>
    </Modal>
  );
}
