"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ThreeWayMatchMatrix } from "@/components/matching/ThreeWayMatchMatrix";
import { DiscrepancyCard } from "@/components/matching/DiscrepancyCard";
import { VersionDiffViewer } from "@/components/matching/VersionDiffViewer";
import { ReconciliationFlowGraph } from "@/components/3d/ReconciliationFlowGraph";
import { api, ThreeWayMatchResult, MOCK_3WAY_MATCH } from "@/lib/api-client";
import {
  GitCompare,
  AlertTriangle,
  FileSpreadsheet,
  RefreshCw,
  Link as LinkIcon,
  CheckCircle2,
  Loader2,
  Layers,
} from "lucide-react";
import { formatCurrency } from "@/lib/tokens";
import { Button, Badge, Modal, Input, PageTransition, triggerApprovalConfetti } from "@/components/ui";

const DEFAULT_INVOICE_ID = "a1000000-0000-0000-0000-000000009041";
const DEFAULT_PO_ID = "a2000000-0000-0000-0000-000000004412";

export function MatchingPage() {
  const [activeTab, setActiveTab] = useState<"FLOW" | "3WAY" | "DIFF">("FLOW");
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
        triggerApprovalConfetti();
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
        triggerApprovalConfetti();
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
    <PageTransition className="p-6 max-w-7xl mx-auto space-y-6 relative">
      {/* Toast Alert */}
      {reconcileSuccess && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-emerald-500 text-black font-semibold text-xs shadow-floating-panel flex items-center gap-2 animate-in slide-in-from-top-4 duration-200">
          <CheckCircle2 className="w-4 h-4" />
          <span>3-Way match re-evaluated with pure Decimal arithmetic! Zero discrepancies missed.</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-lg font-semibold tracking-tight text-ink-primary">
              Autonomous 3-Way Matching Engine
            </h1>
            <Badge variant={isMatched ? "verified" : "discrepancy"} size="sm" dot>
              {matchResult.match_status.replace(/_/g, " ")}
            </Badge>
          </div>
          <p className="text-xs text-ink-muted">
            PO ↔ Goods Receipt ↔ Invoice line reconciliation with zero-drift Decimal arithmetic
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Link Document Trigger */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowLinkModal(true)}
            icon={<LinkIcon className="w-3.5 h-3.5 text-brand-light" />}
          >
            Link PO / GRN
          </Button>

          {/* Reconcile Action Button */}
          <Button
            variant="primary"
            size="sm"
            onClick={() => runMatch(true)}
            disabled={isReconciling || isLoading}
            loading={isReconciling}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Re-Run Match
          </Button>

          {/* Tab switch between Visual Flow, 3-Way Table, and Version Diff */}
          <div className="flex items-center gap-1 bg-surface-card p-1 rounded-lg border border-hairline text-xs ml-1">
            <button
              onClick={() => setActiveTab("FLOW")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
                activeTab === "FLOW"
                  ? "bg-brand/10 text-brand-light shadow-sm"
                  : "text-ink-secondary hover:text-ink-primary"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Flow Graph</span>
            </button>
            <button
              onClick={() => setActiveTab("3WAY")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
                activeTab === "3WAY"
                  ? "bg-brand/10 text-brand-light shadow-sm"
                  : "text-ink-secondary hover:text-ink-primary"
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>Matrix</span>
            </button>
            <button
              onClick={() => setActiveTab("DIFF")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
                activeTab === "DIFF"
                  ? "bg-brand/10 text-brand-light shadow-sm"
                  : "text-ink-secondary hover:text-ink-primary"
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Redline Diff</span>
            </button>
          </div>
        </div>
      </div>

      {reconcileError && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{reconcileError}</span>
        </div>
      )}

      {isLoading ? (
        <div className="py-24 text-center text-xs text-ink-muted flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-light" />
          <p className="font-medium text-ink-primary">Executing Autonomous 3-Way Reconciliation...</p>
          <p className="text-[11px] text-ink-muted">Querying Neon PostgreSQL line-item bounds and evaluating financial invariants.</p>
        </div>
      ) : activeTab === "FLOW" ? (
        <div className="space-y-6">
          {/* Interactive Flow Graph */}
          <ReconciliationFlowGraph />

          {/* Matrix & Discrepancies */}
          <ThreeWayMatchMatrix matchResult={matchResult} />

          {/* Detected Discrepancies Details */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-primary">
                Identified Discrepancies ({matchResult.discrepancies.length})
              </span>
              <span className="font-mono text-xs text-rose-400 font-semibold tabular-nums">
                Total Financial Exposure: {formatCurrency(matchResult.total_discrepancy_amount)}
              </span>
            </div>

            <div className="space-y-3">
              {matchResult.discrepancies.length === 0 ? (
                <div className="p-4 rounded-xl bg-surface-card border border-emerald-500/20 text-xs text-ink-secondary flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
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
      ) : activeTab === "3WAY" ? (
        <div className="space-y-6">
          <ThreeWayMatchMatrix matchResult={matchResult} />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-primary">
                Identified Discrepancies ({matchResult.discrepancies.length})
              </span>
              <span className="font-mono text-xs text-rose-400 font-semibold tabular-nums">
                Total Financial Exposure: {formatCurrency(matchResult.total_discrepancy_amount)}
              </span>
            </div>

            <div className="space-y-3">
              {matchResult.discrepancies.map((d, idx) => (
                <DiscrepancyCard key={idx} discrepancy={d} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <VersionDiffViewer />
      )}

      {/* Link Document Modal */}
      <Modal
        isOpen={showLinkModal}
        onClose={() => !isLinking && setShowLinkModal(false)}
        title="Link Cross-Document Relationship"
        description="Establish explicit multi-document graph edges in PostgreSQL"
        maxWidth="md"
        footer={
          !linkSuccess ? (
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowLinkModal(false)}
                disabled={isLinking}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleLinkSubmit}
                loading={isLinking}
              >
                Confirm Link
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-4 text-xs">
          {linkSuccess ? (
            <div className="py-6 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <p className="font-medium text-ink-primary">
                Document Relationship Linked in PostgreSQL!
              </p>
              <p className="text-[11px] text-ink-muted">
                Persisted with composite foreign key (org_id, ws_id, document_id).
              </p>
            </div>
          ) : (
            <>
              {linkError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">
                  {linkError}
                </div>
              )}

              <div>
                <label className="block text-ink-secondary font-medium mb-1.5">
                  Relationship Type
                </label>
                <select
                  value={linkRelationship}
                  onChange={(e) => setLinkRelationship(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-card border border-hairline text-ink-primary focus:border-brand-light focus:outline-none text-xs"
                >
                  <option value="PURCHASE_ORDER_TO_INVOICE">Purchase Order to Invoice</option>
                  <option value="RECEIPT_TO_INVOICE">Goods Receipt to Invoice</option>
                  <option value="VERSION_REVISION">Version Revision / Amendment</option>
                </select>
              </div>

              <div>
                <Input
                  label="Target Document UUID"
                  value={linkTargetDoc}
                  onChange={(e) => setLinkTargetDoc(e.target.value)}
                  placeholder="e.g. a2000000-0000-0000-0000-000000004412"
                  className="font-mono text-[11px]"
                />
              </div>
            </>
          )}
        </div>
      </Modal>
    </PageTransition>
  );
}

export default MatchingPage;
