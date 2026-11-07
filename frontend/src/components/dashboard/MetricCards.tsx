"use client";

import React from "react";
import Link from "next/link";
import {
  FileText,
  AlertTriangle,
  GitCompare,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import { formatCurrency } from "@/lib/tokens";

export function MetricCards() {
  const metrics = [
    {
      id: "metric-total",
      title: "Total Ingested Documents",
      value: "248",
      subtext: `${formatCurrency(241920)} active commitments`,
      icon: FileText,
      accent: "text-brand-light",
      bgAccent: "bg-brand/10 border-brand/20",
      href: "/documents",
      tag: "All Time",
    },
    {
      id: "metric-review",
      title: "Pending Human Review",
      value: "3",
      subtext: "Dual-custody verification required",
      icon: AlertTriangle,
      accent: "text-amber-400",
      bgAccent: "bg-amber-500/10 border-amber-500/20",
      href: "/review-queue",
      tag: "Action Required",
      pulsing: true,
    },
    {
      id: "metric-discrepancies",
      title: "3-Way Match Discrepancies",
      value: "2",
      subtext: `${formatCurrency(2200)} financial variance exposure`,
      icon: GitCompare,
      accent: "text-rose-400",
      bgAccent: "bg-rose-500/10 border-rose-500/20",
      href: "/matching",
      tag: "MATCH-002",
    },
    {
      id: "metric-invariants",
      title: "Accounting Invariant Pass Rate",
      value: "98.7%",
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
