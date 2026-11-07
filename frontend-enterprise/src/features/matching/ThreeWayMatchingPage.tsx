import React, { useState, useEffect } from "react";
import {
  GitCompare,
  Link as LinkIcon,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import {
  Button,
  Badge,
  Tabs,
  Modal,
  Input,
  PageTransition,
  triggerApprovalConfetti,
} from "../../components/ui";
import { ReconciliationFlowGraph } from "../../components/3d/ReconciliationFlowGraph";
import { api } from "../../services/api";
import { ThreeWayMatchResult } from "../../services/types";
import { useActiveRole } from "../../services/permissions";

export const ThreeWayMatchingPage: React.FC = () => {
  const { can, role } = useActiveRole();
  const [matchResult, setMatchResult] = useState<ThreeWayMatchResult | null>(null);
  const [activeTab, setActiveTab] = useState("flow");
  const [isLinkingOpen, setIsLinkingOpen] = useState(false);
  const [targetPoId, setTargetPoId] = useState("a2000000-0000-0000-0000-000000004412");
  const [isLoading, setIsLoading] = useState(false);

  const invoiceDocId = "a1000000-0000-0000-0000-000000009041";

  const runMatch = async () => {
    setIsLoading(true);
    try {
      const res = await api.match3Way(invoiceDocId);
      setMatchResult(res);
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    runMatch();
  }, []);

  const handleLinkDocuments = async () => {
    try {
      await api.linkDocuments(invoiceDocId, targetPoId, "RECONCILES_WITH_PO");
      setIsLinkingOpen(false);
      await runMatch();
    } catch (err: any) {
      alert(err.message || "Failed to link documents");
    }
  };

  return (
    <PageTransition className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink-primary">
            Autonomous 3-Way Match Reconciliation
          </h1>
          <p className="text-xs text-ink-muted">
            Cross-document invariant alignment: Purchase Order → Goods Receipt → Invoice
          </p>
        </div>

        <div className="flex items-center gap-2">
          {can("matching.create") ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsLinkingOpen(true)}
                icon={<LinkIcon className="w-3.5 h-3.5" />}
              >
                Link PO / Receipt
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={runMatch}
                isLoading={isLoading}
                icon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Execute Invariant Match
              </Button>
            </>
          ) : (
            <div className="px-3 py-1.5 rounded-lg border border-hairline bg-surface-subtle text-[11px] font-mono text-ink-muted">
              Matching Execution Restricted ({role})
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between">
        <Tabs
          tabs={[
            { id: "flow", label: "Reconciliation Topology" },
            { id: "matrix", label: "3-Way Comparison Matrix" },
            { id: "discrepancies", label: "Discrepancy Audit Log", badge: "1 Variance" },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="text-ink-muted">Match State:</span>
          <Badge variant="discrepancy" size="sm" dot>
            DISCREPANCY_DETECTED
          </Badge>
        </div>
      </div>

      {/* Tab 1: Reconciliation Flow Graph */}
      {activeTab === "flow" && <ReconciliationFlowGraph />}

      {/* Tab 2: 3-Way Comparison Matrix */}
      {activeTab === "matrix" && (
        <div className="rounded-2xl bg-surface-primary border border-hairline p-5 shadow-subtle-card space-y-4">
          <div className="text-xs font-semibold text-ink-primary">
            Cross-Document Line Item Alignment
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-hairline bg-surface-subtle/80 font-mono text-[10px] uppercase text-ink-muted">
                  <th className="p-3">Matched Item</th>
                  <th className="p-3">PO-4412 Authorized</th>
                  <th className="p-3">GRN-1109 Delivered</th>
                  <th className="p-3">INV-9041 Billed</th>
                  <th className="p-3 text-right">Variance Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                <tr className="h-10 hover:bg-surface-elevated/40">
                  <td className="p-3 font-semibold text-ink-primary">
                    DataCore SAN Node 24TB
                  </td>
                  <td className="p-3 font-mono text-emerald-400">
                    3 units @ $3,000.00
                  </td>
                  <td className="p-3 font-mono text-emerald-400">
                    3.00 units (Accepted)
                  </td>
                  <td className="p-3 font-mono text-status-danger font-bold">
                    3 units @ $3,600.00
                  </td>
                  <td className="p-3 text-right">
                    <Badge variant="discrepancy" size="sm">
                      +$600/ea Inflation
                    </Badge>
                  </td>
                </tr>
                <tr className="h-10 hover:bg-surface-elevated/40">
                  <td className="p-3 font-semibold text-ink-primary">
                    Enterprise Support SLA
                  </td>
                  <td className="p-3 font-mono text-emerald-400">
                    1 year @ $420.00
                  </td>
                  <td className="p-3 font-mono text-ink-muted">
                    SLA (Service)
                  </td>
                  <td className="p-3 font-mono text-emerald-400">
                    1 year @ $420.00
                  </td>
                  <td className="p-3 text-right">
                    <Badge variant="verified" size="sm">
                      MATCHED
                    </Badge>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Discrepancy Audit Log */}
      {activeTab === "discrepancies" && (
        <div className="rounded-2xl bg-surface-primary border border-hairline p-5 shadow-subtle-card space-y-3">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-status-danger/10 border border-status-danger/25 text-xs">
            <ShieldAlert className="w-5 h-5 text-status-danger shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-status-danger">
                  DISCREPANCY_MATCH_002: Hard-Stop Pricing Variance
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-status-danger/20 text-status-danger font-semibold">
                  Severity: CRITICAL
                </span>
              </div>
              <p className="text-xs text-ink-secondary leading-relaxed">
                The invoiced unit price for <strong>DataCore SAN Storage Node 24TB</strong> is $3,600.00 USD, exceeding the legal purchase order rate ($3,000.00 USD) by 20.0%. Total unapproved price inflation: <strong>$1,800.00 USD</strong>.
              </p>
              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant="primary"
                  size="xs"
                  onClick={() => triggerApprovalConfetti()}
                >
                  Request Vendor Credit Note
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Link Document Modal */}
      <Modal
        isOpen={isLinkingOpen}
        onClose={() => setIsLinkingOpen(false)}
        title="Link Purchase Order or Goods Receipt"
        description="Persists compound foreign key relation in Neon PostgreSQL"
        maxWidth="md"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsLinkingOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleLinkDocuments}>
              Save Document Link
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-xs">
          <Input
            label="Target Purchase Order Document UUID"
            value={targetPoId}
            onChange={(e) => setTargetPoId(e.target.value)}
          />
        </div>
      </Modal>
    </PageTransition>
  );
};
