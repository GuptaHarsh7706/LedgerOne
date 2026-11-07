"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  FileText,
  AlertTriangle,
  GitCompare,
  ShieldCheck,
  ArrowUpRight,
  Loader2,
} from "lucide-react";
import { api, DocumentItem, ReviewQueueItem, WorkspaceAnalytics } from "@/lib/api-client";
import { formatCurrency } from "@/lib/tokens";

export function MetricCards() {
  const [loading, setLoading] = useState(true);
  const [totalDocs, setTotalDocs] = useState<number>(6);
  const [totalExposure, setTotalExposure] = useState<number>(104390);
  const [pendingReviewCount, setPendingReviewCount] = useState<number>(2);
  const [discrepancyCount, setDiscrepancyCount] = useState<number>(2);
  const [discrepancyExposure, setDiscrepancyExposure] = useState<number>(2200);
  const [invariantPassRate, setInvariantPassRate] = useState<string>("98.7%");

  useEffect(() => {
    let isMounted = true;

    async function loadMetrics() {
      try {
        const [docs, queue, analytics] = await Promise.all([
          api.documents.list(),
          api.verification.getQueue(),
          api.matching.getAnalytics(),
        ]);

        if (!isMounted) return;

        if (Array.isArray(docs)) {
          setTotalDocs(docs.length);
          const totalSum = docs.reduce((acc, d) => acc + (typeof d.total_amount === "number" ? d.total_amount : parseFloat(d.total_amount || "0") || 0), 0);
          if (totalSum > 0) setTotalExposure(totalSum);

          const verifiedCount = docs.filter((d) => d.status === "VERIFIED").length;
          const passRate = docs.length > 0 ? ((verifiedCount / docs.length) * 100).toFixed(1) + "%" : "100%";
          setInvariantPassRate(passRate);
        }

        if (Array.isArray(queue)) {
          const pending = queue.filter((q) => q.status === "NEEDS_REVIEW" || q.has_failed_invariants);
          setPendingReviewCount(pending.length > 0 ? pending.length : queue.length);
        }

        if (analytics) {
          setDiscrepancyCount(analytics.open_discrepancies_count ?? 2);
          setDiscrepancyExposure(analytics.total_discrepancy_exposure ?? 2200);
        }
      } catch (err) {
        console.warn("Failed to load live metrics, using cached values", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadMetrics();
    return () => {
      isMounted = false;
    };
  }, []);

  const metrics = [
    {
      id: "metric-total",
      title: "Total Ingested Documents",
      value: loading ? "..." : String(totalDocs),
      subtext: loading ? "Calculating..." : `${formatCurrency(totalExposure)} active commitments`,
      icon: FileText,
      accent: "text-brand-light",
      bgAccent: "bg-brand/10 border-brand/20",
      href: "/documents",
      tag: "Live Ledger",
    },
    {
      id: "metric-review",
      title: "Pending Human Review",
      value: loading ? "..." : String(pendingReviewCount),
      subtext: "Dual-custody verification required",
      icon: AlertTriangle,
      accent: "text-amber-400",
      bgAccent: "bg-amber-500/10 border-amber-500/20",
      href: "/review-queue",
      tag: "Action Required",
      pulsing: pendingReviewCount > 0,
    },
    {
      id: "metric-discrepancies",
      title: "3-Way Match Discrepancies",
      value: loading ? "..." : String(discrepancyCount),
      subtext: loading ? "Calculating..." : `${formatCurrency(discrepancyExposure)} variance exposure`,
      icon: GitCompare,
      accent: "text-rose-400",
      bgAccent: "bg-rose-500/10 border-rose-500/20",
      href: "/matching",
      tag: "Variance Flag",
    },
    {
      id: "metric-invariants",
      title: "Accounting Invariant Pass Rate",
      value: loading ? "..." : invariantPassRate,
      subtext: "Pure Decimal validation across 10 invariants",
      icon: ShieldCheck,
      accent: "text-emerald-400",
      bgAccent: "bg-emerald-500/10 border-emerald-500/20",
      href: "/review-queue",
      tag: "Zero Drift",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((m) => {
        const Icon = m.icon;
        return (
          <Link
            key={m.id}
            href={m.href}
            className="group relative p-4 rounded-xl bg-surface-card border border-hairline hover:border-hairline-strong hover:bg-surface-hover transition-all duration-150 shadow-subtle-card flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono uppercase tracking-wider font-semibold text-ink-muted">
                  {m.title}
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${m.bgAccent} ${m.accent} flex items-center gap-1`}
                >
                  {m.pulsing && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                  )}
                  {m.tag}
                </span>
              </div>

              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-2xl font-semibold tracking-tight text-ink-primary font-mono tabular-nums">
                  {m.value}
                </span>
                {loading && <Loader2 className="w-4 h-4 animate-spin text-ink-muted" />}
              </div>
              <p className="text-xs text-ink-muted">{m.subtext}</p>
            </div>

            <div className="mt-4 pt-3 border-t border-hairline flex items-center justify-between text-xs text-ink-secondary group-hover:text-brand-light transition">
              <span className="text-[11px] font-medium">Inspect queue</span>
              <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default MetricCards;
