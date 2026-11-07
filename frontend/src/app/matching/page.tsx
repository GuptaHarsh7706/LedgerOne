"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ThreeWayMatchMatrix } from "@/components/matching/ThreeWayMatchMatrix";
import { DiscrepancyCard } from "@/components/matching/DiscrepancyCard";
import { VersionDiffViewer } from "@/components/matching/VersionDiffViewer";
import { api, ThreeWayMatchResult, MOCK_3WAY_MATCH } from "@/lib/api-client";
import {
  GitCompare,
  AlertTriangle,
  FileSpreadsheet,
  RefreshCw,
  Link as LinkIcon,
  CheckCircle2,
  X,
  Loader2,
} from "lucide-react";
import { formatCurrency } from "@/lib/tokens";

const DEFAULT_INVOICE_ID = "a1000000-0000-0000-0000-000000009041";
const DEFAULT_PO_ID = "a2000000-0000-0000-0000-000000004412";
const DEFAULT_GRN_ID = "a3000000-0000-0000-0000-000000001109";

export function MatchingPage() {
  const [activeTab, setActiveTab] = useState<"3WAY" | "DIFF">("3WAY");
  const [matchResult, setMatchResult] = useState<ThreeWayMatchResult>(MOCK_3WAY_MATCH);
  const [isLoading, setIsLoading] = useState(true);
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileSuccess, setReconcileSuccess] = useState(false);
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkTargetDoc, setLinkTargetDoc] = useState(DEFAULT_PO_ID);
  const [linkRelationship, setLinkRelationship] = useState("PURCHASE_ORDER_TO_INVOICE");
  const [isLinking, setIsLinking] = useState(false);
  const [linkSuccess, setLinkSuccess] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const runMatch = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsReconciling(true);
    setReconcileError(null);

    try {
      const result = await api.matching.executeMatch(DEFAULT_INVOICE_ID);
      setMatchResult(result);
      if (isSilent) {
        setReconcileSuccess(true);
        setTimeout(() => setReconcileSuccess(false), 3500);
      }
    } catch (err: any) {
      console.error("Match reconciliation failed:", err);
      setReconcileError(err?.message || "Reconciliation failed.");
    } finally {
      setIsLoading(false);
      setIsReconciling(false);
    }
  }, []);

  useEffect(() => {
    runMatch();
  }, [runMatch]);

  const handleLinkSubmit = async () => {
    setIsLinking(true);
    setLinkError(null);

    try {
      const success = await api.matching.link(DEFAULT_INVOICE_ID, linkTargetDoc, linkRelationship);
      if (success) {
        setLinkSuccess(true);
        setTimeout(() => {
          setLinkSuccess(false);
          setShowLinkModal(false);
          runMatch(true);
        }, 1500);
      } else {
        setLinkError("Failed to link documents in PostgreSQL. Check document UUIDs.");
      }
    } catch (err: any) {
      setLinkError(err?.message || "Failed to link documents.");
    } finally {
      setIsLinking(false);
    }
  };

  const isMatched = matchResult.match_status === "PERFECT_MATCH";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 relative">
      {/* Toast Alert */}
      {reconcileSuccess && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-emerald-500 text-black font-semibold text-xs shadow-2xl flex items-center gap-2 animate-in slide-in-from-top-4 duration-200">
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
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                isMatched
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
              }`}
            >
              {matchResult.match_status.replace(/_/g, " ")}
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
            onClick={() => runMatch(true)}
            disabled={isReconciling || isLoading}
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

      {reconcileError && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{reconcileError}</span>
        </div>
      )}

      {isLoading ? (
        <div className="py-24 text-center text-xs text-ink-muted flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-light" />
          <p className="font-semibold text-ink-primary">Executing Autonomous 3-Way Reconciliation...</p>
          <p className="text-[11px] text-ink-muted">Querying Neon PostgreSQL line-item bounds and evaluating financial invariants.</p>
        </div>
      ) : activeTab === "3WAY" ? (
        <div className="space-y-6">
          {/* Main 3-Way Matrix */}
          <ThreeWayMatchMatrix matchResult={matchResult} />

          {/* Detected Discrepancies Details */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-primary">
                Identified Discrepancies ({matchResult.discrepancies.length})
              </span>
              <span className="font-mono text-xs text-rose-400 font-bold">
                Total Financial Exposure: {formatCurrency(matchResult.total_discrepancy_amount)}
              </span>
            </div>

            <div className="space-y-3">
              {matchResult.discrepancies.length === 0 ? (
                <div className="p-4 rounded-xl bg-surface-card border border-emerald-500/20 text-xs text-ink-secondary flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>No discrepancies detected across the PO, Goods Receipt, and Supplier Invoice lines.</span>
                </div>
              ) : (
                matchResult.discrepancies.map((d, idx) => (
                  <DiscrepancyCard key={idx} discrepancy={d} />
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <VersionDiffViewer />
      )}

      {/* Link Document Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="fixed inset-0 -z-10" onClick={() => !isLinking && setShowLinkModal(false)} />
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
                disabled={isLinking}
                className="p-1 rounded text-ink-muted hover:text-ink-primary disabled:opacity-50"
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
                  {linkError && (
                    <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded text-rose-400 text-xs">
                      {linkError}
                    </div>
                  )}

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
                      Target Document UUID
                    </label>
                    <input
                      type="text"
                      value={linkTargetDoc}
                      onChange={(e) => setLinkTargetDoc(e.target.value)}
                      placeholder="e.g. a2000000-0000-0000-0000-000000004412"
                      className="w-full px-3 py-2 rounded-lg bg-surface-card border border-hairline text-ink-primary font-mono focus:border-brand-light focus:outline-none text-[11px]"
                    />
                  </div>
                </>
              )}
            </div>

            {!linkSuccess && (
              <div className="p-3 border-t border-hairline bg-surface-subtle flex justify-end gap-2">
                <button
                  onClick={() => setShowLinkModal(false)}
                  disabled={isLinking}
                  className="px-3 py-1.5 rounded-md text-ink-secondary hover:text-ink-primary disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLinkSubmit}
                  disabled={isLinking}
                  className="px-4 py-1.5 rounded-md bg-brand hover:bg-brand-light disabled:bg-surface-elevated text-white font-semibold shadow-hairline-glow flex items-center gap-1.5"
                >
                  {isLinking && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isLinking ? "Linking..." : "Confirm Link"}</span>
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
