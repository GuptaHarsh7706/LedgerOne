"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  AlertTriangle,
  ArrowRight,
  Filter,
  CheckCircle2,
  Lock,
  Search,
  Check,
} from "lucide-react";
import { ReviewQueueItem } from "@/lib/api-client";
import { formatCurrency } from "@/lib/tokens";

export function ReviewQueuePage() {
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [claimFilter, setClaimFilter] = useState("ALL"); // ALL, UNCLAIMED, IN_REVIEW
  const [searchQuery, setSearchQuery] = useState("");
  const [claimedIds, setClaimedIds] = useState<Record<string, string>>({
    "doc-po-8812": "user-rev-sarah",
  });

  const [queueItems, setQueueItems] = useState<ReviewQueueItem[]>([
    {
      document_id: "doc-inv-9041",
      filename: "INV-2026-9041_DataCore.pdf",
      category: "INVOICE",
      status: "NEEDS_REVIEW",
      created_at: "2026-11-07T02:15:00Z",
      uploader_user_id: "Alex Morgan (AP Operator)",
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
      uploader_user_id: "Chris Evans (Logistics)",
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
      uploader_user_id: "Alex Morgan (AP Operator)",
      claimed_by_user_id: "Sarah Jenkins (Reviewer)",
      vendor_name: "StorageNet Systems",
      invoice_number: "PO-2026-8812",
      total_amount: "28000.00",
      currency: "USD",
      min_confidence: 0.79,
      invariants_status: "FLAGGED",
      discrepancy_count: 1,
    },
  ]);

  const handleClaim = (docId: string) => {
    setClaimedIds((prev) => ({
      ...prev,
      [docId]: "Senior Reviewer (You)",
    }));
  };

  const filteredItems = useMemo(() => {
    return queueItems.filter((item) => {
      const matchCat = selectedCategory === "ALL" || item.category === selectedCategory;
      const isClaimed = !!claimedIds[item.document_id];
      const matchClaim =
        claimFilter === "ALL" ||
        (claimFilter === "UNCLAIMED" && !isClaimed) ||
        (claimFilter === "IN_REVIEW" && isClaimed);
      const matchQuery =
        !searchQuery ||
        item.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.vendor_name && item.vendor_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.invoice_number && item.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCat && matchClaim && matchQuery;
    });
  }, [queueItems, selectedCategory, claimFilter, searchQuery, claimedIds]);

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
              {filteredItems.length} PENDING
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

      {/* Filter and Control Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pb-2 border-b border-hairline">
        {/* Category & Claim Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 md:pb-0">
          {[
            { id: "ALL", label: "All Items" },
            { id: "INVOICE", label: "Invoices" },
            { id: "PURCHASE_ORDER", label: "Purchase Orders" },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                selectedCategory === cat.id
                  ? "bg-brand/10 text-brand-light border border-brand/20 shadow-sm"
                  : "bg-surface-subtle text-ink-secondary hover:text-ink-primary hover:bg-surface-hover border border-hairline"
              }`}
            >
              {cat.label}
            </button>
          ))}

          <div className="w-px h-4 bg-hairline mx-1" />

          {/* Claim filter toggle */}
          {[
            { id: "ALL", label: "All States" },
            { id: "UNCLAIMED", label: "Unclaimed" },
            { id: "IN_REVIEW", label: "In Review" },
          ].map((cf) => (
            <button
              key={cf.id}
              onClick={() => setClaimFilter(cf.id)}
              className={`px-2.5 py-1 rounded text-[11px] font-mono transition ${
                claimFilter === cf.id
                  ? "bg-surface-elevated text-ink-primary border border-hairline-strong font-semibold"
                  : "text-ink-muted hover:text-ink-secondary"
              }`}
            >
              {cf.label}
            </button>
          ))}
        </div>

        {/* Search Query */}
        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search queue by vendor or ID..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-subtle border border-hairline text-xs text-ink-primary placeholder-ink-muted focus:border-brand-light focus:outline-none"
          />
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
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-xs text-ink-muted">
                  No pending documents match your filter criteria.
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const claimedBy = claimedIds[item.document_id];

                return (
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
                      {claimedBy ? (
                        <span className="text-[11px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 flex items-center gap-1 w-fit">
                          <Check className="w-3 h-3" />
                          <span>{claimedBy}</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleClaim(item.document_id)}
                          className="text-[11px] font-mono text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1"
                        >
                          <span>Claim Document</span>
                        </button>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/documents/${item.document_id}/review`}
                        className="px-3 py-1.5 rounded-md bg-brand hover:bg-brand-light text-white font-semibold text-xs transition inline-flex items-center gap-1 shadow-hairline-glow"
                      >
                        <span>Open Studio</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ReviewQueuePage;
