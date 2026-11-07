"use client";

import React, { useState } from "react";
import { ThreeWayMatchMatrix } from "@/components/matching/ThreeWayMatchMatrix";
import { DiscrepancyCard } from "@/components/matching/DiscrepancyCard";
import { VersionDiffViewer } from "@/components/matching/VersionDiffViewer";
import { MOCK_3WAY_MATCH } from "@/lib/api-client";
import { GitCompare, AlertTriangle, ShieldCheck, FileSpreadsheet } from "lucide-react";
import { formatCurrency } from "@/lib/tokens";

export function MatchingPage() {
  const [activeTab, setActiveTab] = useState<"3WAY" | "DIFF">("3WAY");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold tracking-tight text-ink-primary">
              Autonomous 3-Way Matching & Discrepancy Engine
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
              DISCREPANCY DETECTED
            </span>
          </div>
          <p className="text-xs text-ink-muted">
            PO ↔ Goods Receipt ↔ Invoice line reconciliation with zero-drift Decimal arithmetic
          </p>
        </div>

        {/* Tab switch between 3-Way and Version Diff */}
        <div className="flex items-center gap-1 bg-surface-card p-1 rounded-lg border border-hairline self-start sm:self-auto text-xs">
          <button
            onClick={() => setActiveTab("3WAY")}
            className={`px-3 py-1 rounded-md font-medium transition flex items-center gap-1.5 ${
              activeTab === "3WAY"
                ? "bg-brand/10 text-brand-light shadow-sm"
                : "text-ink-secondary hover:text-ink-primary"
            }`}
          >
            <GitCompare className="w-3.5 h-3.5" />
            <span>3-Way Match Matrix</span>
          </button>
          <button
            onClick={() => setActiveTab("DIFF")}
            className={`px-3 py-1 rounded-md font-medium transition flex items-center gap-1.5 ${
              activeTab === "DIFF"
                ? "bg-brand/10 text-brand-light shadow-sm"
                : "text-ink-secondary hover:text-ink-primary"
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Version Redline Diff</span>
          </button>
        </div>
      </div>

      {activeTab === "3WAY" ? (
        <div className="space-y-6">
          {/* Main 3-Way Matrix */}
          <ThreeWayMatchMatrix matchResult={MOCK_3WAY_MATCH} />

          {/* Detected Discrepancies Details */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-primary">
                Identified Discrepancies ({MOCK_3WAY_MATCH.discrepancies.length})
              </span>
              <span className="font-mono text-xs text-rose-400 font-bold">
                Total Financial Exposure: {formatCurrency(MOCK_3WAY_MATCH.total_discrepancy_amount)}
              </span>
            </div>

            <div className="space-y-3">
              {MOCK_3WAY_MATCH.discrepancies.map((d, idx) => (
                <DiscrepancyCard key={idx} discrepancy={d} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <VersionDiffViewer />
      )}
    </div>
  );
}

export default MatchingPage;
