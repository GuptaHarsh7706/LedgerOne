import React from "react";
import { ArrowRight, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { Badge } from "../ui";

export const ReconciliationFlowGraph: React.FC = () => {
  return (
    <div className="relative w-full rounded-2xl bg-surface-primary border border-hairline p-5 shadow-subtle-card space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-hairline">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-brand animate-ping" />
          <h3 className="text-xs font-semibold tracking-tight text-ink-primary">
            Autonomous 3-Way Match Flow Topology
          </h3>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-ink-muted">
          <span>Tolerance: ±0.00%</span>
          <span className="w-1 h-1 rounded-full bg-hairline-strong" />
          <span className="text-status-danger font-semibold">Variance Detected</span>
        </div>
      </div>

      {/* SVG Interactive Flow Canvas */}
      <div className="relative w-full overflow-hidden py-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
          {/* Node 1: Purchase Order */}
          <div className="p-3.5 rounded-xl bg-surface-elevated border border-hairline hover:border-hairline-strong transition-all space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-[10px] text-ink-muted uppercase">Commitment</span>
              <Badge variant="verified" size="sm" dot>PO-2026-4412</Badge>
            </div>
            <div className="font-semibold text-xs text-ink-primary">Apex DataCore Nodes</div>
            <div className="flex items-baseline justify-between font-mono text-[11px] pt-1">
              <span className="text-ink-muted">Authorized Rate:</span>
              <span className="text-emerald-400 font-bold">$3,000.00 / ea</span>
            </div>
            <div className="flex items-baseline justify-between font-mono text-[11px]">
              <span className="text-ink-muted">Total Commitment:</span>
              <span className="text-ink-primary font-bold">$11,220.00</span>
            </div>
          </div>

          {/* Node 2: Goods Receipt */}
          <div className="p-3.5 rounded-xl bg-surface-elevated border border-hairline hover:border-hairline-strong transition-all space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-[10px] text-ink-muted uppercase">Fulfillment</span>
              <Badge variant="ready" size="sm" dot>GRN-2026-1109</Badge>
            </div>
            <div className="font-semibold text-xs text-ink-primary">Dock Intake Verified</div>
            <div className="flex items-baseline justify-between font-mono text-[11px] pt-1">
              <span className="text-ink-muted">Physical Delivered:</span>
              <span className="text-emerald-400 font-bold">3.00 Units</span>
            </div>
            <div className="flex items-baseline justify-between font-mono text-[11px]">
              <span className="text-ink-muted">Warehouse Status:</span>
              <span className="text-ink-primary font-bold">ACCEPTED (Clean)</span>
            </div>
          </div>

          {/* Node 3: Invoice */}
          <div className="p-3.5 rounded-xl bg-status-danger/10 border border-status-danger/30 hover:border-status-danger/50 transition-all space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-[10px] text-status-danger uppercase font-semibold">
                Billed Claim
              </span>
              <Badge variant="discrepancy" size="sm" dot>INV-2026-9041</Badge>
            </div>
            <div className="font-semibold text-xs text-ink-primary">DataCore Enterprise Inc.</div>
            <div className="flex items-baseline justify-between font-mono text-[11px] pt-1">
              <span className="text-ink-muted">Invoiced Unit Price:</span>
              <span className="text-status-danger font-bold">$3,600.00 / ea</span>
            </div>
            <div className="flex items-baseline justify-between font-mono text-[11px]">
              <span className="text-ink-muted">Total Billed:</span>
              <span className="text-ink-primary font-bold">$11,220.00</span>
            </div>
          </div>
        </div>

        {/* Animated Connector Splines (Between Nodes) */}
        <div className="hidden md:flex items-center justify-around px-8 pt-4">
          <div className="flex items-center gap-2 text-ink-muted text-xs font-mono">
            <span>PO Line 1</span>
            <div className="w-16 h-0.5 bg-gradient-to-r from-emerald-500 to-sky-500 animate-pulse" />
            <ArrowRight className="w-3.5 h-3.5 text-sky-400" />
            <span>GRN Inspection</span>
          </div>

          <div className="flex items-center gap-2 text-ink-muted text-xs font-mono">
            <span>GRN Intake</span>
            <div className="w-16 h-0.5 bg-gradient-to-r from-sky-500 to-rose-500 animate-pulse" />
            <ArrowRight className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-status-danger font-bold">Invoice MATCH-002 Variance</span>
          </div>
        </div>
      </div>

      {/* Discrepancy Forensic Callout */}
      <div className="flex items-start gap-3 p-3.5 rounded-xl bg-status-danger/10 border border-status-danger/25 text-xs">
        <ShieldAlert className="w-4 h-4 text-status-danger shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-status-danger">
              MATCH-002: HARD-STOP PRICE INFLATION DETECTED
            </span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-status-danger/20 text-status-danger">
              +$600.00 / unit (+20.0%)
            </span>
          </div>
          <p className="text-[11px] text-ink-secondary leading-relaxed">
            Invoice billed 3 SAN Storage Nodes at $3,600.00/unit while Purchase Order PO-2026-4412 legally authorizes $3,000.00/unit. Total net unapproved price variance across the order: <strong className="text-status-danger font-mono font-semibold">$1,800.00</strong>. Disbursement payment holds active.
          </p>
        </div>
      </div>
    </div>
  );
};
