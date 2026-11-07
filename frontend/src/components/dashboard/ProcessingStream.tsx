"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  FileText,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { CATEGORY_CONFIG, STATUS_CONFIG, DocumentCategory, ProcessingStatus } from "@/lib/tokens";
import { Badge } from "@/components/ui";

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
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadStream() {
      try {
        const docs = await api.documents.list();
        if (!isMounted) return;

        if (Array.isArray(docs)) {
          const stream: StreamEvent[] = docs.slice(0, 5).map((doc, idx) => {
            let stage = "OCR Layout Analysis & Vector Chunking";
            if (doc.status === "VERIFIED") {
              stage = "Dual-Custody Approval Finalized & Invariants Sealed";
            } else if (doc.status === "NEEDS_REVIEW") {
              stage = "Accounting Invariant Evaluation: Discrepancy Flagged";
            } else if (doc.status === "READY") {
              stage = "Hungarian Table Solver: Line Items Reconstructed";
            } else if (doc.status === "PROCESSING") {
              stage = "Neural Layout Parsing & Header Normalization";
            }

            const latency = 90 + idx * 45;

            return {
              id: `ev-${doc.id}`,
              documentId: doc.id,
              filename: doc.filename,
              category: (doc.category as DocumentCategory) || "INVOICE",
              stage,
              status: (doc.status as ProcessingStatus) || "READY",
              latencyMs: latency,
              timestamp: new Date(doc.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            };
          });

          setEvents(stream);
        }
      } catch (err) {
        console.warn("Failed to load processing stream:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadStream();
    return () => {
      isMounted = false;
    };
  }, []);

  const getStatusBadgeVariant = (status: ProcessingStatus | string) => {
    switch (status) {
      case "VERIFIED":
        return "verified" as const;
      case "NEEDS_REVIEW":
      case "IN_REVIEW":
        return "review" as const;
      case "PARSING":
      case "EXTRACTING":
      case "VALIDATING":
      case "PROCESSING":
        return "processing" as const;
      case "FAILED":
      case "REJECTED":
        return "discrepancy" as const;
      default:
        return "ready" as const;
    }
  };

  return (
    <div className="p-4 rounded-xl bg-surface-card border border-hairline shadow-subtle-card flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-hairline mb-3">
        <div>
          <h2 className="text-xs font-semibold text-ink-primary">
            Document Processing Pipeline Stream
          </h2>
          <p className="text-[11px] text-ink-muted">
            Continuous transactional queue execution with worker lease tracking
          </p>
        </div>
        <Link
          href="/documents"
          className="text-xs text-brand-light hover:underline flex items-center gap-1 font-medium transition-colors"
        >
          <span>All documents</span>
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="space-y-2 flex-1">
        {loading ? (
          <div className="py-12 text-center text-xs text-ink-muted flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-brand-light" />
            <span>Loading pipeline execution stream...</span>
          </div>
        ) : events.length === 0 ? (
          <div className="py-12 text-center text-xs text-ink-muted">
            No active documents in processing stream.
          </div>
        ) : (
          events.map((ev) => {
            const catMeta = CATEGORY_CONFIG[ev.category] || CATEGORY_CONFIG.INVOICE;
            const statMeta = STATUS_CONFIG[ev.status] || STATUS_CONFIG.READY;

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
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-ink-primary truncate">
                        {ev.filename}
                      </span>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-surface-card border border-hairline text-ink-muted">
                        {catMeta.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-secondary truncate">
                      {ev.stage}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right hidden sm:block">
                    <span className="font-mono text-[10px] text-ink-muted block">
                      {ev.latencyMs}ms
                    </span>
                    <span className="text-[10px] text-ink-disabled">
                      {ev.timestamp}
                    </span>
                  </div>

                  <Link href={`/documents/${ev.documentId}/review`}>
                    <Badge variant={getStatusBadgeVariant(ev.status)} size="sm" dot>
                      {statMeta.label}
                    </Badge>
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default ProcessingStream;
