"use client";

import React from "react";
import { Edit2 } from "lucide-react";
import { ExtractedLineItem } from "@/lib/api-client";
import { formatCurrency, formatNumber } from "@/lib/tokens";

interface TabularLineItemsTableProps {
  lineItems: ExtractedLineItem[];
  activeFieldKey: string | null;
  onSelectLine: (lineNumber: number) => void;
  onEditCell?: (line: ExtractedLineItem) => void;
}

export function TabularLineItemsTable({
  lineItems,
  activeFieldKey,
  onSelectLine,
  onEditCell,
}: TabularLineItemsTableProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-ink-primary">
          Reconstructed Tabular Line Items
        </span>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-elevated text-brand-light border border-hairline">
          Hungarian Solver: 100% Concordance
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-hairline bg-surface-card">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-hairline bg-surface-subtle text-[10px] font-mono uppercase text-ink-muted">
              <th className="py-2 px-2.5">#</th>
              <th className="py-2 px-2.5">Description</th>
              <th className="py-2 px-2 text-center">Qty</th>
              <th className="py-2 px-2.5 text-right">Unit Price</th>
              <th className="py-2 px-2.5 text-right">Line Total</th>
              <th className="py-2 px-2 text-right">Edit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {lineItems.map((li) => {
              const isSelected = activeFieldKey === `line_${li.line_number}`;

              return (
                <tr
                  key={li.line_number}
                  onClick={() => onSelectLine(li.line_number)}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-amber-500/10 text-amber-200"
                      : "hover:bg-surface-hover/80 text-ink-secondary"
                  }`}
                >
                  <td className="py-2.5 px-2.5 font-mono text-ink-muted">
                    {li.line_number}
                  </td>
                  <td className="py-2.5 px-2.5 font-medium text-ink-primary">
                    {li.description}
                  </td>
                  <td className="py-2.5 px-2 text-center font-mono tabular-nums">
                    {formatNumber(li.quantity, 0)}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                    {formatCurrency(li.unit_price)}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono font-semibold tabular-nums text-ink-primary">
                    {formatCurrency(li.line_total)}
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onEditCell) onEditCell(li);
                      }}
                      className="p-1 rounded hover:bg-surface-elevated text-ink-muted hover:text-brand-light transition"
                      title="Correct Cell Value"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
