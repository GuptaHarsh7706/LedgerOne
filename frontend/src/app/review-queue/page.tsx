"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  AlertTriangle,
  ArrowRight,
  Filter,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { ReviewQueueItem } from "@/lib/api-client";
import { formatCurrency } from "@/lib/tokens";

export function ReviewQueuePage() {
  const [filterCategory, setFilterCategory] = useState("ALL");

  const queueItems: ReviewQueueItem[] = [
    {
      document_id: "doc-inv-9041",
      filename: "INV-2026-9041_DataCore.pdf",
      category: "INVOICE",
      status: "NEEDS_REVIEW",
      created_at: "2026-11-07T02:15:00Z",
      uploader_user_id: "user-op-alex",
      vendor_name: "DataCore Enterprise Inc",
      invoice_number: "INV-2026-9041",
      total_amount: "11220.00",
      currency: "USD",
      min_confidence: 0.92,
      invariants_status: "FLAGGED",
      discrepancy_count: 1,
    },
    {
      document_id: "doc-inv-7721",
      filename: "INV-2026-7721_ApexCompute.pdf",
      category: "INVOICE",
      status: "NEEDS_REVIEW",
      created_at: "2026-11-06T20:10:00Z",
      uploader_user_id: "user-op-chris",
      vendor_name: "Apex Compute LLC",
      invoice_number: "INV-2026-7721",
      total_amount: "4500.00",
      currency: "USD",
      min_confidence: 0.88,
      invariants_status: "FLAGGED",
      discrepancy_count: 1,
    },
    {
      document_id: "doc-po-8812",
      filename: "PO-2026-8812_StorageNet.pdf",
      category: "PURCHASE_ORDER",
      status: "IN_REVIEW",
      created_at: "2026-11-06T15:45:00Z",
      uploader_user_id: "user-op-alex",
      claimed_by_user_id: "user-rev-sarah",
      vendor_name: "StorageNet Systems",
      invoice_number: "PO-2026-8812",
      total_amount: "28000.00",
      currency: "USD",
      min_confidence: 0.79,
      invariants_status: "FLAGGED",
      discrepancy_count: 1,
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold tracking-tight text-ink-primary">
              Human-in-the-Loop Verification Queue
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              3 PENDING
            </span>
          </div>
          <p className="text-xs text-ink-muted">
            Dual-custody verification required prior to financial settlement commit
          </p>
        </div>

        {/* Dual-Custody Info Banner */}
        <div className="flex items-center gap-2 text-xs bg-surface-card px-3 py-2 rounded-lg border border-hairline text-ink-secondary">
          <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong>Segregation of Duties (SoD):</strong> Uploader & corrector are barred from approval.
          </span>
        </div>
      </div>

      {/* Queue Table */}
      <div className="overflow-x-auto rounded-xl border border-hairline bg-surface-card shadow-subtle-card">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-hairline bg-surface-subtle text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
              <th className="py-3 px-4">Document / File</th>
              <th className="py-3 px-3">Vendor</th>
              <th className="py-3 px-3 text-right">Total Amount</th>
              <th className="py-3 px-3 text-center">Confidence</th>
              <th className="py-3 px-3">Discrepancy Flag</th>
              <th className="py-3 px-3">Claim Status</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {queueItems.map((item) => (
              <tr
                key={item.document_id}
                className="hover:bg-surface-hover/80 transition group"
              >
                <td className="py-3 px-4">
                  <div className="font-semibold text-ink-primary">
                    {item.filename}
                  </div>
                  <div className="text-[10px] font-mono text-ink-muted">
                    ID: {item.document_id} • Uploader: {item.uploader_user_id}
                  </div>
                </td>

                <td className="py-3 px-3 text-ink-secondary">
                  {item.vendor_name}
                </td>

                <td className="py-3 px-3 text-right font-mono font-semibold text-ink-primary tabular-nums">
                  {formatCurrency(item.total_amount)}
                </td>

                <td className="py-3 px-3 text-center">
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-surface-elevated text-amber-400 border border-hairline">
                    {(item.min_confidence * 100).toFixed(0)}% min
                  </span>
                </td>

                <td className="py-3 px-3">
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                    <AlertTriangle className="w-3 h-3" />
                    {item.discrepancy_count} Discrepancy
                  </span>
                </td>

                <td className="py-3 px-3">
                  {item.claimed_by_user_id ? (
                    <span className="text-[11px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                      In Review by {item.claimed_by_user_id}
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono text-amber-400">
                      Unclaimed
                    </span>
                  )}
                </td>

                <td className="py-3 px-4 text-right">
                  <Link
                    href={`/documents/${item.document_id}/review`}
                    className="px-3 py-1.5 rounded-md bg-brand hover:bg-brand-light text-white font-semibold text-xs transition inline-flex items-center gap-1 shadow-hairline-glow"
                  >
                    <span>Claim & Inspect</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ReviewQueuePage;
