"use client";

import React from "react";
import { X, FileText, CheckCircle2, XCircle, Database, Shield, Download, ExternalLink } from "lucide-react";
import Link from "next/link";
import { DocumentItem } from "@/lib/api-client";
import { formatCurrency, CATEGORY_CONFIG, STATUS_CONFIG, DocumentCategory, ProcessingStatus } from "@/lib/tokens";

interface DocumentDetailModalProps {
  document: DocumentItem | null;
  onClose: () => void;
  onDownload: (doc: DocumentItem) => void;
}

export function DocumentDetailModal({
  document: doc,
  onClose,
  onDownload,
}: DocumentDetailModalProps) {
  if (!doc) return null;

  const catMeta = CATEGORY_CONFIG[doc.category as DocumentCategory] || CATEGORY_CONFIG.INVOICE;
  const statMeta = STATUS_CONFIG[doc.status as ProcessingStatus] || STATUS_CONFIG.READY;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="fixed inset-0 -z-10" onClick={onClose} />
      <div className="w-full max-w-lg bg-surface-elevated border border-hairline-strong rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-hairline bg-surface-subtle">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center">
              <FileText className="w-4 h-4 text-brand-light" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ink-primary">
                Document Metadata & Provenance
              </h2>
              <p className="text-[10px] font-mono text-ink-muted">{doc.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-ink-muted hover:text-ink-primary hover:bg-surface-hover transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Details Body */}
        <div className="p-4 space-y-4 text-xs">
          {/* Main Info */}
          <div className="grid grid-cols-2 gap-3 bg-surface-card p-3 rounded-lg border border-hairline">
            <div>
              <span className="text-[10px] font-mono text-ink-muted uppercase block">Filename</span>
              <span className="font-semibold text-ink-primary truncate block">{doc.filename}</span>
            </div>
            <div>
              <span className="text-[10px] font-mono text-ink-muted uppercase block">Category</span>
              <span className={`inline-block text-[10px] font-mono px-2 py-0.5 rounded ${catMeta.badgeClass}`}>
                {catMeta.label}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-mono text-ink-muted uppercase block">Vendor</span>
              <span className="text-ink-secondary font-medium">{doc.vendor_name || "Unassigned"}</span>
            </div>
            <div>
              <span className="text-[10px] font-mono text-ink-muted uppercase block">Invoice / Reference</span>
              <span className="font-mono text-ink-primary">{doc.invoice_number || "—"}</span>
            </div>
            <div>
              <span className="text-[10px] font-mono text-ink-muted uppercase block">Total Amount</span>
              <span className="font-mono font-bold text-ink-primary tabular-nums">
                {doc.total_amount ? formatCurrency(doc.total_amount) : "—"}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-mono text-ink-muted uppercase block">Pipeline Status</span>
              <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full ${statMeta.badgeClass}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statMeta.dotClass}`} />
                {statMeta.label}
              </span>
            </div>
          </div>

          {/* Technical Specifications */}
          <div className="space-y-2">
            <h3 className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
              Cryptographic & Storage Ledger
            </h3>
            <div className="space-y-1.5 bg-surface-subtle p-3 rounded-lg border border-hairline font-mono text-[10px]">
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Page Count:</span>
                <span className="text-ink-primary">{doc.page_count} pages</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">File Size:</span>
                <span className="text-ink-primary">{(doc.file_size_bytes / 1024).toFixed(1)} KB</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">S3 Storage Tier:</span>
                <span className="text-emerald-400">s3://ledgerone-production/assets/{doc.id}.pdf</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">SHA-256 Hash:</span>
                <span className="text-ink-secondary truncate max-w-[200px]" title="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855">
                  e3b0c44298fc1c149afbf4...
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Invariants Audit:</span>
                {doc.invariants_passed ? (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> All Invariants Validated
                  </span>
                ) : (
                  <span className="text-amber-400 font-semibold flex items-center gap-1">
                    <XCircle className="w-3 h-3" /> Flagged for Human Review
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="p-4 border-t border-hairline bg-surface-subtle flex items-center justify-between gap-3">
          <button
            onClick={() => onDownload(doc)}
            className="px-3 py-1.5 rounded-md bg-surface-card hover:bg-surface-hover text-ink-primary border border-hairline text-xs font-medium transition flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-brand-light" />
            <span>Download PDF</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-ink-secondary hover:text-ink-primary hover:bg-surface-hover transition"
            >
              Close
            </button>
            <Link
              href={`/documents/${doc.id}/review`}
              className="px-3.5 py-1.5 rounded-md bg-brand hover:bg-brand-light text-white text-xs font-semibold shadow-hairline-glow transition flex items-center gap-1"
            >
              <span>Open in Studio</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
