"use client";

import React from "react";
import {
  BarChart3,
  Building2,
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { formatCurrency } from "@/lib/tokens";

export function AnalyticsPage() {
  const analytics = {
    total_spend: 241920.0,
    open_discrepancies_count: 2,
    total_discrepancy_exposure: 2200.0,
    document_count_by_category: {
      INVOICE: 142,
      PURCHASE_ORDER: 68,
      RECEIPT: 30,
      CONTRACT: 8,
    },
    top_vendors: [
      { name: "CloudHost Global Services", spend: 150000.0, docCount: 8, discrepancyCount: 0 },
      { name: "NetLink Solutions LLC", spend: 34500.0, docCount: 14, discrepancyCount: 0 },
      { name: "StorageNet Systems", spend: 28000.0, docCount: 6, discrepancyCount: 1 },
      { name: "DataCore Enterprise Inc", spend: 21220.0, docCount: 4, discrepancyCount: 1 },
      { name: "Apex Compute LLC", spend: 8200.0, docCount: 3, discrepancyCount: 1 },
    ],
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink-primary">
            Workspace Spend & Exposure Analytics
          </h1>
          <p className="text-xs text-ink-muted">
            Aggregated commitments, vendor concentration, and discrepancy risk
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs bg-surface-card px-3 py-1.5 rounded-lg border border-hairline text-ink-muted">
          <span>Fiscal Period: Q4 2026</span>
        </div>
      </div>

      {/* Top 3 Metric Blocks */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-surface-card border border-hairline shadow-subtle-card">
          <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Total Workspace Spend</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-ink-primary tabular-nums">
            {formatCurrency(analytics.total_spend)}
          </div>
          <p className="text-[11px] text-ink-muted mt-1">Across 248 verified documents</p>
        </div>

        <div className="p-4 rounded-xl bg-surface-card border border-rose-500/30 shadow-subtle-card">
          <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
            <span className="font-semibold uppercase tracking-wider text-[10px] text-rose-400">Total Variance Exposure</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-rose-400 tabular-nums">
            {formatCurrency(analytics.total_discrepancy_exposure)}
          </div>
          <p className="text-[11px] text-ink-muted mt-1">{analytics.open_discrepancies_count} active 3-way discrepancies</p>
        </div>

        <div className="p-4 rounded-xl bg-surface-card border border-hairline shadow-subtle-card">
          <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Discrepancy Rate</span>
            <ShieldCheck className="w-4 h-4 text-brand-light" />
          </div>
          <div className="text-2xl font-mono font-bold text-brand-light tabular-nums">
            0.91%
          </div>
          <p className="text-[11px] text-ink-muted mt-1">Well below 2.5% audit threshold</p>
        </div>
      </div>

      {/* Top Vendors Table */}
      <div className="rounded-xl border border-hairline bg-surface-card shadow-subtle-card overflow-hidden">
        <div className="p-3.5 bg-surface-subtle border-b border-hairline flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-brand-light" />
            <span className="font-semibold text-ink-primary">
              Top Vendor Spend Concentration
            </span>
          </div>
          <span className="text-[11px] font-mono text-ink-muted">
            5 Primary Vendors
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-hairline bg-surface-subtle/50 text-[10px] font-mono uppercase text-ink-muted">
                <th className="py-2.5 px-4">Vendor Entity</th>
                <th className="py-2.5 px-3 text-center">Documents</th>
                <th className="py-2.5 px-4 text-right">Total Invoiced</th>
                <th className="py-2.5 px-4 text-center">Discrepancy Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {analytics.top_vendors.map((v) => (
                <tr key={v.name} className="hover:bg-surface-hover/80 transition">
                  <td className="py-3 px-4 font-semibold text-ink-primary">
                    {v.name}
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-ink-secondary">
                    {v.docCount}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-ink-primary tabular-nums">
                    {formatCurrency(v.spend)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {v.discrepancyCount === 0 ? (
                      <span className="inline-block text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        Zero Variances
                      </span>
                    ) : (
                      <span className="inline-block text-[10px] font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                        {v.discrepancyCount} Flagged
                      </span>
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

export default AnalyticsPage;
