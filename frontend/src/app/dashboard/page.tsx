"use client";

import React from "react";
import { MetricCards } from "@/components/dashboard/MetricCards";
import { ExceptionQueue } from "@/components/dashboard/ExceptionQueue";
import { ProcessingStream } from "@/components/dashboard/ProcessingStream";
import { DocumentVectorCore3D } from "@/components/3d/DocumentVectorCore3D";
import { ShieldCheck, Database, Server, Sparkles } from "lucide-react";
import { Badge, PageTransition } from "@/components/ui";

export default function DashboardPage() {
  return (
    <PageTransition className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner / Environment Context */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-hairline">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-lg font-semibold tracking-tight text-ink-primary">
              Enterprise Document Intelligence
            </h1>
            <Badge variant="verified" size="sm" dot>
              AUDITED V7.1
            </Badge>
          </div>
          <p className="text-xs text-ink-muted">
            Workspace: <strong className="text-ink-secondary font-medium">Production Financial Core</strong>
            <span className="mx-2 text-ink-disabled">·</span>
            Tenant: <strong className="text-ink-secondary font-medium">Apex Global Capital</strong>
          </p>
        </div>

        {/* System Capabilities Pill */}
        <div className="flex items-center gap-2 self-start md:self-auto text-xs text-ink-muted bg-surface-card px-3 py-1.5 rounded-lg border border-hairline shadow-subtle-card">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="font-medium text-[11px]">SoD Dual-Control</span>
          </div>
          <span className="text-ink-disabled">·</span>
          <div className="flex items-center gap-1.5 text-ink-secondary">
            <Database className="w-3.5 h-3.5 text-brand-light" />
            <span className="text-[11px]">Row-Level Security</span>
          </div>
          <span className="text-ink-disabled">·</span>
          <div className="flex items-center gap-1.5 text-ink-secondary">
            <Server className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[11px] font-mono">pgvector HNSW</span>
          </div>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <section aria-label="Key Performance Indicators">
        <MetricCards />
      </section>

      {/* Interactive 3D WebGL Vector Core Canvas */}
      <section aria-label="3D Vector Space Intelligence">
        <DocumentVectorCore3D />
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
    </PageTransition>
  );
}
