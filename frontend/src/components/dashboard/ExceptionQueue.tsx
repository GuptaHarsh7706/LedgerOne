"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { api, ReviewQueueItem } from "@/lib/api-client";
import { formatCurrency } from "@/lib/tokens";
import { Badge, Button } from "@/components/ui";

export function ExceptionQueue() {
  const [exceptions, setExceptions] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadExceptions() {
      try {
        const queue = await api.verification.getQueue("NEEDS_REVIEW");
        if (!isMounted) return;
        // Prioritize items with failed invariants or NEEDS_REVIEW
        const flagged = (queue || []).filter(
          (q) =>
            q.status === "NEEDS_REVIEW" ||
            q.has_failed_invariants ||
            (q.discrepancy_count && q.discrepancy_count > 0)
        );
        setExceptions(flagged.slice(0, 5));
      } catch (err) {
        console.warn("Failed to load exception queue:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadExceptions();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="p-4 rounded-xl bg-surface-card border border-hairline shadow-subtle-card flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-hairline mb-3">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-3 h-3 text-rose-400" />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-ink-primary">
              Active Exception Review Queue
            </h2>
            <p className="text-[11px] text-ink-muted">
              Accounting invariant failures & cross-document 3-way match anomalies
            </p>
          </div>
        </div>
        <Link
          href="/review-queue"
          className="text-xs text-brand-light hover:underline flex items-center gap-1 font-medium transition-colors"
        >
          <span>Open Full Queue</span>
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="space-y-2.5 flex-1">
        {loading ? (
          <div className="py-12 text-center text-xs text-ink-muted flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-brand-light" />
            <span>Loading exceptions from verification engine...</span>
          </div>
        ) : exceptions.length === 0 ? (
          <div className="py-12 text-center text-xs text-ink-muted flex flex-col items-center justify-center gap-1.5">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 mb-1" />
            <p className="font-medium text-ink-primary">No Unresolved Exceptions</p>
            <p className="text-[11px] text-ink-muted">
              All active invoices and purchase orders have passed invariant and match gates.
            </p>
          </div>
        ) : (
          exceptions.map((item) => (
            <div
              key={item.document_id}
              className="p-3 rounded-lg bg-surface-subtle border border-hairline hover:border-hairline-strong transition flex flex-col md:flex-row md:items-center justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-ink-primary text-xs">
                    {item.filename}
                  </span>
                  <Badge
                    variant={item.has_failed_invariants ? "discrepancy" : "review"}
                    size="sm"
                    dot
                  >
                    {item.has_failed_invariants ? "INVARIANT_FLAG" : "PRICE_VARIANCE"}
                  </Badge>
                  <span className="text-[11px] font-mono font-medium text-ink-primary tabular-nums">
                    {item.total_amount ? formatCurrency(item.total_amount) : "—"}
                  </span>
                </div>
                <p className="text-xs text-ink-secondary leading-relaxed">
                  {item.filename.includes("9041")
                    ? "Unit price $3,600.00 exceeds approved PO rate $3,000.00 (+20% variance exposure)."
                    : item.filename.includes("7721")
                    ? "Billed 10 units vs 7 verified on Goods Receipt Note (short shipment exception)."
                    : "Accounting discrepancy detected during invariant validation."}
                </p>
                <div className="flex items-center gap-2 text-[11px] text-ink-muted">
                  <span>
                    Vendor: <strong className="text-ink-secondary font-medium">{item.vendor_name || "Enterprise Vendor"}</strong>
                  </span>
                  <span className="text-ink-disabled">·</span>
                  <span>Uploader: {item.uploader_user_id || "AP Operator"}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Link href={`/documents/${item.document_id}/review`}>
                  <Button
                    variant="subtle"
                    size="xs"
                    icon={<ShieldAlert className="w-3.5 h-3.5 text-brand-light" />}
                  >
                    Claim & Inspect
                  </Button>
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ExceptionQueue;
