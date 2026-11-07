"use client";

import React, { useState } from "react";
import { X, Check, Calculator, ShieldAlert } from "lucide-react";
import { ExtractedLineItem } from "@/lib/api-client";
import { formatCurrency } from "@/lib/tokens";

interface CellCorrectionModalProps {
  isOpen: boolean;
  lineItem: ExtractedLineItem | null;
  onClose: () => void;
  onSaveCorrection: (updated: ExtractedLineItem) => void;
}

export function CellCorrectionModal({
  isOpen,
  lineItem,
  onClose,
  onSaveCorrection,
}: CellCorrectionModalProps) {
  if (!isOpen || !lineItem) return null;

  const [description, setDescription] = useState(lineItem.description);
  const [quantity, setQuantity] = useState(lineItem.quantity);
  const [unitPrice, setUnitPrice] = useState(lineItem.unit_price);

  // Pure real-time recalculation
  const calculatedLineNet = quantity * unitPrice;
  const calculatedTax = calculatedLineNet * 0.1; // standard 10%
  const calculatedTotal = calculatedLineNet + calculatedTax;

  const handleSave = () => {
    onSaveCorrection({
      ...lineItem,
      description,
      quantity,
      unit_price: unitPrice,
      line_net: calculatedLineNet,
      tax_amount: calculatedTax,
      line_total: calculatedTotal,
    });
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
              <Calculator className="w-3.5 h-3.5 text-brand-light" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink-primary">
                Human Reviewer Cell Correction
              </h3>
              <p className="text-[10px] text-ink-muted">
                Line #{lineItem.line_number} • Real-time Decimal recalculator
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
              Item Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-surface-card border border-hairline text-ink-primary focus:border-brand-light focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-ink-secondary font-medium mb-1">
                Quantity
              </label>
              <input
                type="number"
                step="1"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 rounded-lg bg-surface-card border border-hairline text-ink-primary font-mono tabular-nums focus:border-brand-light focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-ink-secondary font-medium mb-1">
                Unit Price ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={unitPrice}
                onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 rounded-lg bg-surface-card border border-hairline text-ink-primary font-mono tabular-nums focus:border-brand-light focus:outline-none"
              />
            </div>
          </div>

          {/* Real-time Math Recalculation Summary */}
          <div className="p-3 rounded-lg bg-surface-subtle border border-hairline space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between text-ink-muted">
              <span>Recalculated Line Net:</span>
              <span className="text-ink-primary font-semibold tabular-nums">
                {formatCurrency(calculatedLineNet)}
              </span>
            </div>
            <div className="flex justify-between text-ink-muted">
              <span>Estimated Tax (10%):</span>
              <span className="text-ink-secondary tabular-nums">
                {formatCurrency(calculatedTax)}
              </span>
            </div>
            <div className="flex justify-between text-brand-light font-bold pt-1 border-t border-hairline">
              <span>New Line Total:</span>
              <span className="tabular-nums">{formatCurrency(calculatedTotal)}</span>
            </div>
          </div>

          {/* SoD Warning Notice */}
          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>Dual-Custody Notice (AUTH_SOD_002):</strong> Modifying this line item will record your reviewer ID in the audit trail. You will be disqualified from approving this document.
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
            <span>Save & Recalculate Invariants</span>
          </button>
        </div>
      </div>
    </div>
  );
}
