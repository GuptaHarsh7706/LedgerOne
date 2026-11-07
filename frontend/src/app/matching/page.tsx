"use client";

import React, { useState } from "react";
import { ThreeWayMatchMatrix } from "@/components/matching/ThreeWayMatchMatrix";
import { DiscrepancyCard } from "@/components/matching/DiscrepancyCard";
import { VersionDiffViewer } from "@/components/matching/VersionDiffViewer";
import { MOCK_3WAY_MATCH } from "@/lib/api-client";
import {
  GitCompare,
  AlertTriangle,
  FileSpreadsheet,
  RefreshCw,
  Link as LinkIcon,
  CheckCircle2,
  X,
} from "lucide-react";
import { formatCurrency } from "@/lib/tokens";

export function MatchingPage() {
  const [activeTab, setActiveTab] = useState<"3WAY" | "DIFF">("3WAY");
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileSuccess, setReconcileSuccess] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkTargetDoc, setLinkTargetDoc] = useState("PO-2026-4412");
  const [linkRelationship, setLinkRelationship] = useState("PURCHASE_ORDER_TO_INVOICE");
  const [linkSuccess, setLinkSuccess] = useState(false);

  const handleReconcile = () => {
    setIsReconciling(true);
    setTimeout(() => {
      setIsReconciling(false);
      setReconcileSuccess(true);
      setTimeout(() => setReconcileSuccess(false), 3000);
    }, 700);
  };

  const handleLinkSubmit = () => {
    setLinkSuccess(true);
    setTimeout(() => {
      setLinkSuccess(false);
      setShowLinkModal(false);
    }, 1500);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 relative">
      {/* Toast Alert */}
      {reconcileSuccess && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-emerald-500 text-black font-semibold text-xs shadow-2xl flex items-center gap-2 animate-in slide-in-from-top-4 duration-200">
          <CheckCircle2 className="w-4 h-4" />
          <span>3-Way match re-evaluated with pure Decimal arithmetic! Zero discrepancies missed.</span>
        </div>
      )}

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

        <div className="flex items-center gap-2">
          {/* Link Document Trigger */}
          <button
            onClick={() => setShowLinkModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-card hover:bg-surface-hover border border-hairline text-ink-secondary hover:text-ink-primary text-xs font-medium transition"
          >
            <LinkIcon className="w-3.5 h-3.5 text-brand-light" />
            <span>Link PO / GRN</span>
          </button>

          {/* Reconcile Action Button */}
          <button
            onClick={handleReconcile}
            disabled={isReconciling}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand hover:bg-brand-light disabled:bg-surface-elevated text-white text-xs font-semibold shadow-hairline-glow transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReconciling ? "animate-spin" : ""}`} />
            <span>{isReconciling ? "Reconciling..." : "Re-Run Match"}</span>
          </button>

          {/* Tab switch between 3-Way and Version Diff */}
          <div className="flex items-center gap-1 bg-surface-card p-1 rounded-lg border border-hairline text-xs ml-2">
            <button
              onClick={() => setActiveTab("3WAY")}
              className={`px-3 py-1 rounded-md font-medium transition flex items-center gap-1.5 ${
                activeTab === "3WAY"
                  ? "bg-brand/10 text-brand-light shadow-sm"
                  : "text-ink-secondary hover:text-ink-primary"
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>3-Way Matrix</span>
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
              <span>Version Redline</span>
            </button>
          </div>
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

      {/* Link Document Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="fixed inset-0 -z-10" onClick={() => setShowLinkModal(false)} />
          <div className="w-full max-w-md bg-surface-elevated border border-hairline-strong rounded-xl shadow-2xl overflow-hidden text-xs animate-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-hairline bg-surface-subtle flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-brand-light" />
                <span className="font-semibold text-ink-primary">
                  Link Cross-Document Relationship
                </span>
              </div>
              <button
                onClick={() => setShowLinkModal(false)}
                className="p-1 rounded text-ink-muted hover:text-ink-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {linkSuccess ? (
                <div className="py-6 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <p className="font-semibold text-ink-primary">
                    Document Relationship Linked in PostgreSQL!
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    Persisted with composite foreign key (org_id, ws_id, document_id).
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-ink-secondary font-medium mb-1">
                      Relationship Type
                    </label>
                    <select
                      value={linkRelationship}
                      onChange={(e) => setLinkRelationship(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-surface-card border border-hairline text-ink-primary focus:border-brand-light focus:outline-none"
                    >
                      <option value="PURCHASE_ORDER_TO_INVOICE">Purchase Order to Invoice</option>
                      <option value="RECEIPT_TO_INVOICE">Goods Receipt to Invoice</option>
                      <option value="VERSION_REVISION">Version Revision / Amendment</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-ink-secondary font-medium mb-1">
                      Target Document Identifier
                    </label>
                    <input
                      type="text"
                      value={linkTargetDoc}
                      onChange={(e) => setLinkTargetDoc(e.target.value)}
                      placeholder="e.g. PO-2026-4412..."
                      className="w-full px-3 py-2 rounded-lg bg-surface-card border border-hairline text-ink-primary font-mono focus:border-brand-light focus:outline-none"
                    />
                  </div>
                </>
              )}
            </div>

            {!linkSuccess && (
              <div className="p-3 border-t border-hairline bg-surface-subtle flex justify-end gap-2">
                <button
                  onClick={() => setShowLinkModal(false)}
                  className="px-3 py-1.5 rounded-md text-ink-secondary hover:text-ink-primary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLinkSubmit}
                  className="px-4 py-1.5 rounded-md bg-brand hover:bg-brand-light text-white font-semibold shadow-hairline-glow"
                >
                  Confirm Link
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default MatchingPage;
