"use client";

import React from "react";
import { MetricCards } from "@/components/dashboard/MetricCards";
import { ExceptionQueue } from "@/components/dashboard/ExceptionQueue";
import { ProcessingStream } from "@/components/dashboard/ProcessingStream";
import { ShieldCheck, Database, Server } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner / Environment Context */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-hairline">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold tracking-tight text-ink-primary">
              Enterprise Document Intelligence Overview
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              AUDITED V7.1
            </span>
          </div>
          <p className="text-xs text-ink-muted">
            Workspace: <strong className="text-ink-secondary">Production Financial Core</strong> | Tenant: <strong className="text-ink-secondary">Apex Global Capital</strong>
          </p>
        </div>

        {/* System Capabilities Pill */}
        <div className="flex items-center gap-2 self-start md:self-auto text-xs text-ink-muted bg-surface-card px-3 py-1.5 rounded-lg border border-hairline">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            <span className="font-medium text-[11px]">SoD Dual-Control Active</span>
          </div>
          <span className="text-ink-disabled">•</span>
          <div className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-brand-light" />
            <span className="text-[11px]">Row-Level Security</span>
          </div>
          <span className="text-ink-disabled">•</span>
          <div className="flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[11px]">pgvector HNSW</span>
          </div>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <section aria-label="Key Performance Indicators">
        <MetricCards />
      </section>

      {/* Main Split Grid: High-Priority Exceptions & Live Pipeline Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section aria-label="Exception Queue">
          <ExceptionQueue />
        </section>
        <section aria-label="Processing Stream">
          <ProcessingStream />
        </section>
      </div>
    </div>
  );
}
