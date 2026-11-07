"use client";

import React, { useState } from "react";
import {
  FileText,
  Package,
  Receipt,
  AlertTriangle,
  CheckCircle2,
  GitCompare,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { formatCurrency } from "@/lib/tokens";

interface FlowNode {
  id: string;
  type: "PO" | "GRN" | "INVOICE";
  label: string;
  ref: string;
  amount: string;
  status: "AUTHORIZED" | "RECEIVED" | "VARIANCE";
  color: string;
}

export function ReconciliationFlowGraph() {
  const [selectedFlow, setSelectedFlow] = useState<string>("MATCH-002");

  const nodes: FlowNode[] = [
    {
      id: "node-po",
      type: "PO",
      label: "Purchase Order Baseline",
      ref: "PO-2026-4412",
      amount: "$10,000.00",
      status: "AUTHORIZED",
      color: "border-indigo-500/40 text-indigo-400 bg-indigo-500/10",
    },
    {
      id: "node-grn",
      type: "GRN",
      label: "Warehouse Receipt Note",
      ref: "GRN-2026-1109",
      amount: "6 Units Physical",
      status: "RECEIVED",
      color: "border-emerald-500/40 text-emerald-400 bg-emerald-500/10",
    },
    {
      id: "node-inv",
      type: "INVOICE",
      label: "Billed Supplier Invoice",
      ref: "INV-2026-9041",
      amount: "$11,220.00",
      status: "VARIANCE",
      color: "border-rose-500/50 text-rose-400 bg-rose-500/10",
    },
  ];

  return (
    <div className="relative w-full p-5 rounded-2xl bg-gradient-to-b from-surface-card to-surface-subtle border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-hairline mb-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-brand/20 border border-brand/30 flex items-center justify-center">
            <GitCompare className="w-3.5 h-3.5 text-brand-light" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-ink-primary">
              Autonomous 3-Way Reconciliation Stream Topology
            </h3>
            <p className="text-[11px] text-ink-muted">
              Continuous vector alignment & Decimal invariant verification pipeline
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="flex items-center gap-1 text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            MATCH-001 (Qty Aligned)
          </span>
          <span className="flex items-center gap-1 text-rose-400 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 animate-pulse">
            <AlertTriangle className="w-3 h-3" />
            MATCH-002 (+$1,200.00 Rate Variance)
          </span>
        </div>
      </div>

      {/* SVG Animated Flow Canvas */}
      <div className="relative h-44 flex items-center justify-between px-6">
        {/* Animated Background Connection Splines */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="flowGradientGreen" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
            </linearGradient>
            <linearGradient id="flowGradientRed" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.8" />
            </linearGradient>
          </defs>

          {/* PO -> GRN Spline */}
          <path
            d="M 170 85 C 260 30, 320 30, 420 85"
            fill="none"
            stroke="url(#flowGradientGreen)"
            strokeWidth="2.5"
            strokeDasharray="6 4"
            className="animate-[dash_12s_linear_infinite]"
          />

          {/* GRN -> Invoice Spline */}
          <path
            d="M 460 85 C 550 140, 620 140, 710 85"
            fill="none"
            stroke="url(#flowGradientGreen)"
            strokeWidth="2.5"
            strokeDasharray="6 4"
          />

          {/* PO -> Invoice Direct Variance Spline */}
          <path
            d="M 170 95 C 320 165, 560 165, 710 95"
            fill="none"
            stroke="url(#flowGradientRed)"
            strokeWidth="3"
            strokeDasharray="8 6"
          />
        </svg>

        {/* Node 1: Purchase Order */}
        <div className="relative z-10 w-56 p-3 rounded-xl bg-surface-elevated/90 backdrop-blur-md border border-indigo-500/30 shadow-lg space-y-1.5 hover:border-indigo-500/60 transition group cursor-pointer">
          <div className="flex items-center justify-between text-[10px] font-mono text-ink-muted">
            <span className="flex items-center gap-1 font-semibold text-indigo-400">
              <FileText className="w-3.5 h-3.5" />
              1. PURCHASE ORDER
            </span>
            <span className="px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
              Contracted
            </span>
          </div>
          <div className="font-semibold text-xs text-ink-primary">
            PO-2026-4412
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-ink-muted">Authorized:</span>
            <span className="font-semibold text-ink-primary">$10,000.00</span>
          </div>
        </div>

        {/* Middle Pulse Indicator */}
        <div className="relative z-10 flex flex-col items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shadow-hairline-glow animate-pulse">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="text-[9px] font-mono text-emerald-400 mt-1 uppercase tracking-tight">
            Qty Match (6/6)
          </span>
        </div>

        {/* Node 2: Goods Receipt */}
        <div className="relative z-10 w-56 p-3 rounded-xl bg-surface-elevated/90 backdrop-blur-md border border-emerald-500/30 shadow-lg space-y-1.5 hover:border-emerald-500/60 transition group cursor-pointer">
          <div className="flex items-center justify-between text-[10px] font-mono text-ink-muted">
            <span className="flex items-center gap-1 font-semibold text-emerald-400">
              <Package className="w-3.5 h-3.5" />
              2. GOODS RECEIPT
            </span>
            <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
              Delivered
            </span>
          </div>
          <div className="font-semibold text-xs text-ink-primary">
            GRN-2026-1109
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-ink-muted">Physical Qty:</span>
            <span className="font-semibold text-ink-primary">6 Units Verified</span>
          </div>
        </div>

        {/* Variance Collision Indicator */}
        <div className="relative z-10 flex flex-col items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shadow-hairline-glow animate-bounce">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <span className="text-[9px] font-mono text-rose-400 mt-1 uppercase tracking-tight font-bold">
            +$600/unit Rate
          </span>
        </div>

        {/* Node 3: Supplier Invoice */}
        <div className="relative z-10 w-56 p-3 rounded-xl bg-surface-elevated/90 backdrop-blur-md border border-rose-500/40 shadow-lg space-y-1.5 hover:border-rose-500/70 transition group cursor-pointer">
          <div className="flex items-center justify-between text-[10px] font-mono text-ink-muted">
            <span className="flex items-center gap-1 font-semibold text-rose-400">
              <Receipt className="w-3.5 h-3.5" />
              3. SUPPLIER INVOICE
            </span>
            <span className="px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20">
              Variance
            </span>
          </div>
          <div className="font-semibold text-xs text-ink-primary">
            INV-2026-9041
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-ink-muted">Billed Amount:</span>
            <span className="font-semibold text-rose-400 tabular-nums">$11,220.00</span>
          </div>
        </div>
      </div>

      {/* Forensic Collision Callout */}
      <div className="mt-3 p-3 rounded-xl bg-rose-500/5 border border-rose-500/20 text-xs flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
          <p className="text-[11px] text-ink-secondary leading-relaxed">
            <strong className="text-ink-primary">Line 1 Price Variance Detected:</strong> Billed at{" "}
            <span className="font-mono text-rose-400 font-semibold">$3,600.00</span> vs approved PO rate{" "}
            <span className="font-mono text-indigo-400 font-semibold">$3,000.00</span> (+20.0% variance / +$1,200.00 total exposure).
          </p>
        </div>
        <span className="font-mono text-[10px] text-ink-muted shrink-0 bg-surface-card px-2 py-1 rounded border border-hairline">
          MATCH-002 ENFORCED
        </span>
      </div>
    </div>
  );
}

export default ReconciliationFlowGraph;
