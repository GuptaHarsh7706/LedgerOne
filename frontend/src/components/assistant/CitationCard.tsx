"use client";

import React from "react";
import Link from "next/link";
import { ExternalLink, FileText, MapPin } from "lucide-react";
import { BoundingBox } from "@/lib/api-client";

export interface Citation {
  citation_id: string;
  document_id: string;
  document_name: string;
  page_number: number;
  line_number?: number;
  bounding_box?: BoundingBox;
  quote: string;
}

interface CitationCardProps {
  citation: Citation;
  onClickCitation?: (c: Citation) => void;
}

export function CitationCard({ citation, onClickCitation }: CitationCardProps) {
  return (
    <div
      onClick={() => onClickCitation && onClickCitation(citation)}
      className="p-3 rounded-lg bg-surface-subtle border border-hairline hover:border-brand/40 hover:bg-surface-hover/80 transition-all text-xs cursor-pointer group"
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded bg-brand/10 border border-brand/20 text-brand-light font-mono text-[10px] font-bold flex items-center justify-center">
            {citation.citation_id}
          </span>
          <span className="font-semibold text-ink-primary truncate max-w-[200px]">
            {citation.document_name}
          </span>
        </div>
        <div className="flex items-center gap-1 font-mono text-[10px] text-ink-muted">
          <MapPin className="w-3 h-3 text-brand-light" />
          <span>Page {citation.page_number}</span>
          {citation.line_number && <span>:L{citation.line_number}</span>}
        </div>
      </div>

      <div className="p-2 rounded bg-surface-card border border-hairline text-[11px] font-mono text-ink-secondary italic border-l-2 border-l-brand-light">
        &ldquo;{citation.quote}&rdquo;
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-ink-muted">
        <span>Verified by pgvector HNSW & Lexical GIN</span>
        <span className="text-brand-light group-hover:underline flex items-center gap-0.5">
          <span>Jump to bounding box</span>
          <ExternalLink className="w-2.5 h-2.5" />
        </span>
      </div>
    </div>
  );
}
