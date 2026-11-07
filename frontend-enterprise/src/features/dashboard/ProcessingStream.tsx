import React from "react";
import { Activity, CheckCircle2, Clock, Cpu, FileCheck } from "lucide-react";

export const ProcessingStream: React.FC = () => {
  const events = [
    {
      id: "EVT-8941",
      action: "Document Vector Ingestion & HNSW Embedding",
      target: "INV-2026-9041_DataCore.pdf",
      latency: "18.4ms",
      status: "COMPLETED",
      time: "Just now",
    },
    {
      id: "EVT-8940",
      action: "Cross-Document 3-Way Match Check (MATCH-002)",
      target: "PO-2026-4412 ──> INV-2026-9041",
      latency: "24.1ms",
      status: "EXCEPTION",
      time: "2m ago",
    },
    {
      id: "EVT-8939",
      action: "Autonomous Line Item Mathematical Recalculation",
      target: "DEV-01-CLEAN-INVOICE",
      latency: "12.8ms",
      status: "COMPLETED",
      time: "5m ago",
    },
    {
      id: "EVT-8938",
      action: "Compound Foreign Key Tenancy Check (Neon RLS)",
      target: "Apex Global Capital Core",
      latency: "4.2ms",
      status: "VERIFIED",
      time: "11m ago",
    },
  ];

  return (
    <div className="rounded-2xl bg-surface-primary border border-hairline p-4 shadow-subtle-card space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-hairline">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-brand-light" />
          <h3 className="text-xs font-semibold text-ink-primary">
            Document Processing Pipeline Stream
          </h3>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-ink-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Real-Time Stream Active</span>
        </div>
      </div>

      <div className="space-y-2">
        {events.map((evt) => (
          <div
            key={evt.id}
            className="p-2.5 rounded-xl bg-surface-subtle border border-hairline flex items-center justify-between text-xs"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-surface-elevated border border-hairline flex items-center justify-center text-ink-muted">
                {evt.status === "EXCEPTION" ? (
                  <span className="text-status-danger font-bold text-[10px]">!</span>
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                )}
              </div>
              <div>
                <div className="font-medium text-ink-primary text-xs">
                  {evt.action}
                </div>
                <div className="font-mono text-[10px] text-ink-muted">
                  {evt.target}
                </div>
              </div>
            </div>

            <div className="text-right font-mono text-[10px]">
              <div className="text-brand-light font-semibold">{evt.latency}</div>
              <div className="text-ink-muted">{evt.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
