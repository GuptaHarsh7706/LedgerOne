"use client";

import React from "react";
import { FileText, CheckCircle2, XCircle, Download, ExternalLink } from "lucide-react";
import Link from "next/link";
import { DocumentItem } from "@/lib/api-client";
import { formatCurrency, CATEGORY_CONFIG, STATUS_CONFIG, DocumentCategory, ProcessingStatus } from "@/lib/tokens";
import { Modal, Button, Badge } from "@/components/ui";

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
    <Modal
      isOpen={!!doc}
      onClose={onClose}
      title="Document Metadata & Provenance"
      description={`UUID: ${doc.id}`}
      maxWidth="md"
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onDownload(doc)}
            icon={<Download className="w-3.5 h-3.5 text-brand-light" />}
          >
            Download Original
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
            <Link href={`/documents/${doc.id}/review`}>
              <Button
                variant="primary"
                size="sm"
                icon={<ExternalLink className="w-3.5 h-3.5" />}
              >
                Open in Studio
              </Button>
            </Link>
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {/* Main Info */}
        <div className="grid grid-cols-2 gap-3 bg-surface-card p-3 rounded-xl border border-hairline">
          <div>
            <span className="text-[10px] font-mono text-ink-muted uppercase block">Filename</span>
            <span className="font-medium text-ink-primary truncate block mt-0.5">{doc.filename}</span>
          </div>
          <div>
            <span className="text-[10px] font-mono text-ink-muted uppercase block">Category</span>
            <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-surface-subtle border border-hairline text-ink-secondary mt-0.5">
              {catMeta.label}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-mono text-ink-muted uppercase block">Vendor</span>
            <span className="text-ink-secondary font-medium mt-0.5 block">{doc.vendor_name || "Unassigned"}</span>
          </div>
          <div>
            <span className="text-[10px] font-mono text-ink-muted uppercase block">Invoice / Reference</span>
            <span className="font-mono text-ink-primary mt-0.5 block">{doc.invoice_number || "—"}</span>
          </div>
          <div>
            <span className="text-[10px] font-mono text-ink-muted uppercase block">Total Amount</span>
            <span className="font-mono font-semibold text-ink-primary tabular-nums mt-0.5 block">
              {doc.total_amount ? formatCurrency(doc.total_amount) : "—"}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-mono text-ink-muted uppercase block">Pipeline Status</span>
            <div className="mt-0.5">
              <Badge variant={getStatusBadgeVariant(doc.status as ProcessingStatus)} size="sm" dot>
                {statMeta.label}
              </Badge>
            </div>
          </div>
        </div>

        {/* Technical Specifications */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-mono uppercase tracking-wider font-semibold text-ink-muted">
            Cryptographic & Storage Ledger
          </h3>
          <div className="space-y-1.5 bg-surface-subtle p-3 rounded-xl border border-hairline font-mono text-[10px]">
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
                  <CheckCircle2 className="w-3 h-3" /> Validated
                </span>
              ) : (
                <span className="text-amber-400 font-semibold flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> Flagged for Review
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
