"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Upload,
  Cpu,
  ChevronRight,
  Bell,
  Sparkles,
} from "lucide-react";

export function Header() {
  const pathname = usePathname();

  // Generate clean breadcrumbs from path
  const segments = pathname?.split("/").filter(Boolean) || [];
  const breadcrumbMap: Record<string, string> = {
    dashboard: "Executive Dashboard",
    documents: "Document Library",
    "review-queue": "Human Review Queue",
    matching: "3-Way Matching Engine",
    assistant: "Grounded AI Assistant",
    analytics: "Financial Spend Analytics",
    settings: "Workspace Settings",
    review: "Document Intelligence Studio",
  };

  return (
    <header className="h-14 bg-surface-subtle border-b border-hairline flex items-center justify-between px-6 shrink-0 z-20">
      {/* Breadcrumb Path */}
      <div className="flex items-center gap-1.5 text-xs">
        <Link
          href="/dashboard"
          className="text-ink-muted hover:text-ink-secondary transition font-medium"
        >
          LedgerOne
        </Link>
        {segments.map((seg, idx) => (
          <React.Fragment key={seg}>
            <ChevronRight className="w-3 h-3 text-ink-disabled shrink-0" />
            <span
              className={
                idx === segments.length - 1
                  ? "text-ink-primary font-semibold"
                  : "text-ink-muted"
              }
            >
              {breadcrumbMap[seg] || seg}
            </span>
          </React.Fragment>
        ))}
      </div>

      {/* Right Controls & Telemetry */}
      <div className="flex items-center gap-3">
        {/* Hardware & Cloud Telemetry Pill */}
        <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-full bg-surface-card border border-hairline text-[11px] text-ink-muted">
          <div className="flex items-center gap-1 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-mono text-[10px] font-semibold">NEON CLOUD</span>
          </div>
          <span className="text-ink-disabled">|</span>
          <div className="flex items-center gap-1 text-ink-secondary">
            <Cpu className="w-3 h-3 text-brand-light" />
            <span className="font-mono text-[10px]">RTX 3050 CUDA</span>
          </div>
        </div>

        {/* Notifications Icon with active badge */}
        <button
          title="Discrepancy Notifications"
          className="relative p-2 rounded-md bg-surface-card border border-hairline text-ink-muted hover:text-ink-primary hover:border-hairline-strong transition"
        >
          <Bell className="w-3.5 h-3.5" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-400"></span>
        </button>

        {/* Upload Document Primary CTA */}
        <Link
          href="/documents?action=upload"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand hover:bg-brand-light text-white text-xs font-semibold shadow-hairline-glow transition"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Upload Document</span>
        </Link>
      </div>
    </header>
  );
}
