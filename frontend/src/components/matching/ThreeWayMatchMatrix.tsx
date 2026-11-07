"use client";

import React from "react";
import Link from "next/link";
import {
  FileText,
  GitCompare,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { ThreeWayMatchResult } from "@/lib/api-client";
import { formatCurrency } from "@/lib/tokens";

interface ThreeWayMatchMatrixProps {
  matchResult: ThreeWayMatchResult;
}

export function ThreeWayMatchMatrix({ matchResult }: ThreeWayMatchMatrixProps) {
  const isMatched = matchResult.match_status === "PERFECT_MATCH";

  return (
    <div className="space-y-4">
      {/* 3-Way Graph Relationship Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Document 1: PO */}
        <Link
          href={`/documents/${matchResult.po_id || "a2000000-0000-0000-0000-000000004412"}/review`}
          className="p-3.5 rounded-xl bg-surface-card border border-hairline hover:border-indigo-500/40 hover:bg-surface-hover/80 transition shadow-subtle-card space-y-2 group block"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-[10px] uppercase font-mono font-semibold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
              1. Purchase Order
            </span>
            <span className="font-mono text-emerald-400 text-[10px]">Contracted</span>
          </div>
          <div>
            <div className="font-semibold text-ink-primary text-xs flex items-center justify-between">
              <span>PO-2026-4412</span>
              <ExternalLink className="w-3 h-3 text-ink-muted group-hover:text-indigo-400 transition" />
            </div>
            <div className="text-[11px] text-ink-muted">DataCore Enterprise Inc</div>
          </div>
          <div className="pt-2 border-t border-hairline flex justify-between font-mono text-xs">
            <span className="text-ink-muted">Authorized:</span>
            <span className="text-ink-primary font-semibold">$10,000.00</span>
          </div>
        </Link>

        {/* Document 2: GRN / Receipt */}
        <Link
          href={`/documents/${matchResult.grn_id || "a3000000-0000-0000-0000-000000001109"}/review`}
          className="p-3.5 rounded-xl bg-surface-card border border-hairline hover:border-emerald-500/40 hover:bg-surface-hover/80 transition shadow-subtle-card space-y-2 group block"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-[10px] uppercase font-mono font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              2. Goods Receipt (GRN)
            </span>
            <span className="font-mono text-emerald-400 text-[10px]">Verified Delivery</span>
          </div>
          <div>
            <div className="font-semibold text-ink-primary text-xs flex items-center justify-between">
              <span>GRN-2026-1109</span>
              <ExternalLink className="w-3 h-3 text-ink-muted group-hover:text-emerald-400 transition" />
            </div>
            <div className="text-[11px] text-ink-muted">Warehouse Bay #4</div>
          </div>
          <div className="pt-2 border-t border-hairline flex justify-between font-mono text-xs">
            <span className="text-ink-muted">Physical Qty:</span>
            <span className="text-ink-primary font-semibold">6 units total</span>
          </div>
        </Link>

        {/* Document 3: Invoice */}
        <Link
          href={`/documents/${matchResult.invoice_id || "a1000000-0000-0000-0000-000000009041"}/review`}
          className="p-3.5 rounded-xl bg-surface-card border border-rose-500/30 hover:border-rose-500/60 hover:bg-surface-hover/80 transition shadow-subtle-card space-y-2 group block"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-[10px] uppercase font-mono font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
              3. Supplier Invoice
            </span>
            <span className="font-mono text-rose-400 text-[10px]">Variance Found</span>
          </div>
          <div>
            <div className="font-semibold text-ink-primary text-xs flex items-center justify-between">
              <span>INV-2026-9041</span>
              <ExternalLink className="w-3 h-3 text-ink-muted group-hover:text-rose-400 transition" />
            </div>
            <div className="text-[11px] text-ink-muted">DataCore Enterprise Inc</div>
          </div>
          <div className="pt-2 border-t border-hairline flex justify-between font-mono text-xs">
            <span className="text-ink-muted">Billed Amount:</span>
            <span className="text-rose-400 font-semibold">$11,220.00</span>
          </div>
        </Link>
      </div>

      {/* Line Item Cross-Reconciliation Table */}
      <div className="rounded-xl border border-hairline bg-surface-card shadow-subtle-card overflow-hidden">
        <div className="p-3 bg-surface-subtle border-b border-hairline flex items-center justify-between text-xs">
          <span className="font-semibold text-ink-primary">
            Cross-Document Line Item Alignment Matrix
          </span>
          <span className="font-mono text-[10px] text-ink-muted">
            MATCH-001 (Qty) & MATCH-002 (Price)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-hairline bg-surface-subtle/40 text-[10px] font-mono uppercase text-ink-muted">
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-2 text-center">PO Qty</th>
                <th className="py-2.5 px-2 text-center">GRN Qty</th>
                <th className="py-2.5 px-2 text-center">Inv Qty</th>
                <th className="py-2.5 px-3 text-right">PO Rate</th>
                <th className="py-2.5 px-3 text-right">Inv Rate</th>
                <th className="py-2.5 px-3 text-center">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {matchResult.line_item_matches.map((li) => (
                <tr
                  key={li.line_number}
                  className={`hover:bg-surface-hover/80 transition ${
                    !li.is_matched ? "bg-rose-500/5" : ""
                  }`}
                >
                  <td className="py-2.5 px-3 font-mono text-ink-muted">
                    {li.line_number}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-ink-primary">
                    {li.description}
                  </td>
                  <td className="py-2.5 px-2 text-center font-mono">
                    {li.po_quantity ?? "—"}
                  </td>
                  <td className="py-2.5 px-2 text-center font-mono">
                    {li.grn_quantity ?? "—"}
                  </td>
                  <td className="py-2.5 px-2 text-center font-mono font-semibold">
                    {li.invoice_quantity}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-ink-secondary">
                    {li.po_unit_price ? formatCurrency(li.po_unit_price) : "—"}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-semibold text-rose-400">
                    {formatCurrency(li.invoice_unit_price)}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {li.is_matched ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" />
                        Aligned
                      </span>
                    ) : (
                      <Link
                        href={`/documents/${matchResult.invoice_id || "a1000000-0000-0000-0000-000000009041"}/review`}
                        className="inline-flex items-center gap-1 text-[10px] font-mono text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/20 hover:bg-rose-500/20 transition"
                      >
                        <AlertTriangle className="w-3 h-3" />
                        <span>Price Inflation (+$600/u)</span>
                        <ArrowRight className="w-2.5 h-2.5 ml-0.5" />
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
