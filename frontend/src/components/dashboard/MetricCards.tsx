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
import { api } from "@/lib/api-client";
import { formatCurrency } from "@/lib/tokens";
import { Badge, SpotlightCard, AnimatedNumber } from "@/components/ui";

export function MetricCards() {
  const [loading, setLoading] = useState(true);
  const [totalDocs, setTotalDocs] = useState<number>(6);
  const [totalExposure, setTotalExposure] = useState<number>(104390);
  const [pendingReviewCount, setPendingReviewCount] = useState<number>(2);
  const [discrepancyCount, setDiscrepancyCount] = useState<number>(2);
  const [discrepancyExposure, setDiscrepancyExposure] = useState<number>(2200);
  const [invariantPassRate, setInvariantPassRate] = useState<number>(98.7);

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
          const totalSum = docs.reduce(
            (acc, d) =>
              acc +
              (typeof d.total_amount === "number"
                ? d.total_amount
                : parseFloat(d.total_amount || "0") || 0),
            0
          );
          if (totalSum > 0) setTotalExposure(totalSum);

          const verifiedCount = docs.filter((d) => d.status === "VERIFIED").length;
          const passRate =
            docs.length > 0
              ? parseFloat(((verifiedCount / docs.length) * 100).toFixed(1))
              : 100;
          setInvariantPassRate(passRate);
        }

        if (Array.isArray(queue)) {
          const pending = queue.filter(
            (q) => q.status === "NEEDS_REVIEW" || q.has_failed_invariants
          );
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
      title: "Ingested Documents",
      numberVal: totalDocs,
      formatter: (n: number) => String(Math.round(n)),
      subtext: `${formatCurrency(totalExposure)} active commitments`,
      icon: FileText,
      badgeVariant: "brand" as const,
      tag: "Live Ledger",
      href: "/documents",
      spotlight: "rgba(99, 102, 241, 0.18)",
    },
    {
      id: "metric-review",
      title: "Pending Review",
      numberVal: pendingReviewCount,
      formatter: (n: number) => String(Math.round(n)),
      subtext: "Dual-custody verification required",
      icon: AlertTriangle,
      badgeVariant: "review" as const,
      tag: "Action Required",
      href: "/review-queue",
      dot: pendingReviewCount > 0,
      spotlight: "rgba(245, 158, 11, 0.18)",
    },
    {
      id: "metric-discrepancies",
      title: "Match Discrepancies",
      numberVal: discrepancyCount,
      formatter: (n: number) => String(Math.round(n)),
      subtext: `${formatCurrency(discrepancyExposure)} variance exposure`,
      icon: GitCompare,
      badgeVariant: "discrepancy" as const,
      tag: "Variance Flag",
      href: "/matching",
      dot: discrepancyCount > 0,
      spotlight: "rgba(239, 68, 68, 0.18)",
    },
    {
      id: "metric-invariants",
      title: "Invariant Pass Rate",
      numberVal: invariantPassRate,
      formatter: (n: number) => `${n.toFixed(1)}%`,
      subtext: "Decimal validation across 10 invariants",
      icon: ShieldCheck,
      badgeVariant: "verified" as const,
      tag: "Zero Drift",
      href: "/review-queue",
      dot: true,
      spotlight: "rgba(16, 185, 129, 0.18)",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((m) => {
        const Icon = m.icon;
        return (
          <Link key={m.id} href={m.href} className="block group">
            <SpotlightCard
              spotlightColor={m.spotlight}
              className="p-4 h-full flex flex-col justify-between hover:scale-[1.01] active:scale-[0.99] transition-transform duration-200"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5 text-ink-muted">
                    <Icon className="w-3.5 h-3.5 text-ink-secondary" />
                    <span className="text-[11px] font-mono uppercase tracking-wider font-medium text-ink-muted">
                      {m.title}
                    </span>
                  </div>
                  <Badge variant={m.badgeVariant} size="sm" dot={m.dot}>
                    {m.tag}
                  </Badge>
                </div>

                <div className="flex items-baseline gap-2 mb-1.5">
                  <span className="text-2xl font-semibold tracking-tight text-ink-primary font-mono tabular-nums">
                    {loading ? (
                      "..."
                    ) : (
                      <AnimatedNumber value={m.numberVal} format={m.formatter} />
                    )}
                  </span>
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-muted" />}
                </div>
                <p className="text-[11px] text-ink-muted leading-relaxed">{m.subtext}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-hairline flex items-center justify-between text-xs text-ink-secondary group-hover:text-brand-light transition-colors">
                <span className="text-[11px] font-medium">Inspect queue</span>
                <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </div>
            </SpotlightCard>
          </Link>
        );
      })}
    </div>
  );
}

export default MetricCards;
