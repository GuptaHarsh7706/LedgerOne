"use client";

import React, { useState } from "react";
import { Calculator } from "lucide-react";
import { ExtractedLineItem } from "@/lib/api-client";
import { formatCurrency } from "@/lib/tokens";
import { Modal, Button, Input } from "@/components/ui";

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cell Correction"
      description={`Line Item #${lineItem.line_number} · Real-time Decimal recalculator`}
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
        <Input
          label="Item Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Quantity"
            type="number"
            step="1"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
            className="font-mono tabular-nums"
          />

          <Input
            label="Unit Price ($)"
            type="number"
            step="0.01"
            min="0"
            value={unitPrice}
            onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0)}
            className="font-mono tabular-nums"
          />
        </div>

        {/* Real-time Recalculated Ledger Preview */}
        <div className="p-3 bg-surface-card rounded-xl border border-hairline space-y-1.5 font-mono text-[11px]">
          <div className="flex items-center justify-between text-ink-muted">
            <span>Calculated Net:</span>
            <span className="text-ink-primary font-medium">{formatCurrency(calculatedLineNet)}</span>
          </div>
          <div className="flex items-center justify-between text-ink-muted">
            <span>Estimated Tax (10%):</span>
            <span className="text-ink-primary">{formatCurrency(calculatedTax)}</span>
          </div>
          <div className="pt-1.5 border-t border-hairline flex items-center justify-between font-semibold">
            <span className="text-ink-primary">Recalculated Line Total:</span>
            <span className="text-brand-light tabular-nums">{formatCurrency(calculatedTotal)}</span>
          </div>
        </div>

        <p className="text-[10px] text-ink-muted leading-relaxed">
          Modifying this cell will immediately trigger re-evaluation of Invariant INV-001 (Line Item Summation) and update the total commitment.
        </p>
      </div>
    </Modal>
  );
}
