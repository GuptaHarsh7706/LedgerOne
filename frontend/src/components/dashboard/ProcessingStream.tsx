"use client";

import React from "react";
import Link from "next/link";
import {
  FileText,
  Clock,
  ArrowRight,
} from "lucide-react";
import { CATEGORY_CONFIG, STATUS_CONFIG, DocumentCategory, ProcessingStatus } from "@/lib/tokens";

interface StreamEvent {
  id: string;
  documentId: string;
  filename: string;
  category: DocumentCategory;
  stage: string;
  status: ProcessingStatus;
  latencyMs: number;
  timestamp: string;
}

export function ProcessingStream() {
  const events: StreamEvent[] = [
    {
      id: "ev-1",
      documentId: "doc-inv-9041",
      filename: "INV-2026-9041_DataCore.pdf",
      category: "INVOICE",
      stage: "Accounting Invariant Evaluation: Discrepancy Flagged",
      status: "NEEDS_REVIEW",
      latencyMs: 142,
      timestamp: "2 mins ago",
    },
    {
      id: "ev-2",
      documentId: "doc-inv-5582",
      filename: "INV-2026-5582_NetLink.pdf",
      category: "INVOICE",
      stage: "Hungarian Table Solver: 8 Line Items Reconstructed",
      status: "READY",
      latencyMs: 310,
      timestamp: "12 mins ago",
    },
    {
      id: "ev-3",
      documentId: "doc-po-4412",
      filename: "PO-2026-4412_DataCore.pdf",
      category: "PURCHASE_ORDER",
      stage: "Dual-Custody Approval Finalized",
      status: "VERIFIED",
      latencyMs: 88,
      timestamp: "1 hour ago",
    },
    {
      id: "ev-4",
      documentId: "doc-grn-1109",
      filename: "GRN-2026-1109_Receipt.pdf",
      category: "RECEIPT",
      stage: "3-Way Match Verification Complete",
      status: "VERIFIED",
      latencyMs: 95,
      timestamp: "3 hours ago",
    },
  ];

  return (
    <div className="p-4 rounded-xl bg-surface-card border border-hairline shadow-subtle-card">
      <div className="flex items-center justify-between pb-3 border-b border-hairline mb-3">
        <div>
          <h2 className="text-sm font-semibold text-ink-primary">
            Document Processing Pipeline Stream
          </h2>
          <p className="text-[11px] text-ink-muted">
            Continuous transactional queue execution with worker lease tracking
          </p>
        </div>
        <Link
          href="/documents"
          className="text-xs text-brand-light hover:underline flex items-center gap-1"
        >
          <span>All documents</span>
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="space-y-2">
        {events.map((ev) => {
          const catMeta = CATEGORY_CONFIG[ev.category];
          const statMeta = STATUS_CONFIG[ev.status];

          return (
            <div
              key={ev.id}
              className="p-2.5 rounded-lg bg-surface-subtle border border-hairline hover:border-hairline-strong transition flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-7 h-7 rounded-md bg-surface-elevated border border-hairline flex items-center justify-center shrink-0">
                  <FileText className="w-3.5 h-3.5 text-ink-muted" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/documents/${ev.documentId}/review`}
                      className="font-medium text-ink-primary hover:text-brand-light transition truncate"
                    >
                      {ev.filename}
                    </Link>
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.2 rounded ${catMeta.badgeClass}`}
                    >
                      {catMeta.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-muted truncate">
                    {ev.stage}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1.5 ${statMeta.badgeClass}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${statMeta.dotClass}`} />
                  {statMeta.label}
                </span>

                <div className="hidden sm:flex items-center gap-1 text-[10px] font-mono text-ink-disabled">
                  <Clock className="w-3 h-3" />
                  <span>{ev.latencyMs}ms</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
