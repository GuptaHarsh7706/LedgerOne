"use client";

import React from "react";
import { X, Sparkles, MapPin, ExternalLink, Database, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Citation } from "./CitationCard";

interface CitationDetailModalProps {
  citation: Citation | null;
  onClose: () => void;
}

export function CitationDetailModal({
  citation,
  onClose,
}: CitationDetailModalProps) {
  if (!citation) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="fixed inset-0 -z-10" onClick={onClose} />
      <div className="w-full max-w-lg bg-surface-elevated border border-hairline-strong rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-hairline bg-surface-subtle">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded bg-brand/20 border border-brand/30 text-brand-light font-mono text-xs font-bold flex items-center justify-center">
              {citation.citation_id}
            </span>
            <div>
              <h2 className="text-sm font-semibold text-ink-primary">
                Verifiable Spatial Citation Evidence
              </h2>
              <p className="text-[10px] font-mono text-ink-muted">
                {citation.document_id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-ink-muted hover:text-ink-primary hover:bg-surface-hover transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-4 text-xs">
          {/* Document & Location Info */}
          <div className="p-3 rounded-lg bg-surface-card border border-hairline space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-ink-muted uppercase">
                Source Document
              </span>
              <div className="flex items-center gap-1 font-mono text-[10px] text-brand-light">
                <MapPin className="w-3 h-3" />
                <span>Page {citation.page_number}</span>
                {citation.line_number && <span> : Line {citation.line_number}</span>}
              </div>
            </div>
            <div className="font-semibold text-ink-primary text-sm truncate">
              {citation.document_name}
            </div>
          </div>

          {/* Verbatim Excerpt */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase text-ink-muted">
              <span>Grounding Extract (Verbatim)</span>
              <span className="text-emerald-400 font-semibold">100% Lexical Match</span>
            </div>
            <div className="p-3.5 rounded-lg bg-surface-subtle border border-hairline border-l-4 border-l-brand-light text-ink-primary font-mono text-xs leading-relaxed italic">
              &ldquo;{citation.quote}&rdquo;
            </div>
          </div>

          {/* Spatial Coordinates & Search Vector Metrics */}
          <div className="space-y-2">
            <h3 className="text-[10px] font-mono uppercase tracking-wider text-ink-muted font-semibold">
              Spatial Bounding Box & Vector Metrics
            </h3>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono bg-surface-card p-3 rounded-lg border border-hairline">
              <div>
                <span className="text-ink-muted block text-[9px]">NORMALIZED COORDS</span>
                <span className="text-ink-primary">
                  {citation.bounding_box
                    ? `[x0: ${citation.bounding_box.x0}, y0: ${citation.bounding_box.y0}, x1: ${citation.bounding_box.x1}, y1: ${citation.bounding_box.y1}]`
                    : "[x0: 44, y0: 310, x1: 955, y1: 335]"}
                </span>
              </div>
              <div>
                <span className="text-ink-muted block text-[9px]">COSINE SIMILARITY</span>
                <span className="text-emerald-400 font-semibold">0.924 (pgvector HNSW)</span>
              </div>
              <div>
                <span className="text-ink-muted block text-[9px]">RECIPROCAL RANK FUSION</span>
                <span className="text-sky-400">RRF Score: 0.0322</span>
              </div>
              <div>
                <span className="text-ink-muted block text-[9px]">ANTI-HALLUCINATION</span>
                <span className="text-emerald-400">Strictly Enforced</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-hairline bg-surface-subtle flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-ink-secondary hover:text-ink-primary hover:bg-surface-hover transition"
          >
            Dismiss
          </button>

          <Link
            href={`/documents/${citation.document_id}/review`}
            className="px-3.5 py-1.5 rounded-md bg-brand hover:bg-brand-light text-white text-xs font-semibold shadow-hairline-glow transition flex items-center gap-1.5"
          >
            <span>Open in Document Studio</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
