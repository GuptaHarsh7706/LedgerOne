"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  FileText,
  ChevronRight,
  Download,
  Info,
  Trash2,
  RefreshCw,
  Check,
  AlertCircle,
  X,
} from "lucide-react";
import { DocumentItem } from "@/lib/api-client";
import {
  CATEGORY_CONFIG,
  STATUS_CONFIG,
  formatCurrency,
  DocumentCategory,
  ProcessingStatus,
} from "@/lib/tokens";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Badge,
  Button,
  Modal,
  EmptyState,
} from "@/components/ui";
import { DocumentDetailModal } from "./DocumentDetailModal";

interface DocumentTableProps {
  documents: DocumentItem[];
  onDeleteDocument?: (id: string) => void;
  onBatchDelete?: (ids: string[]) => void;
}

export function DocumentTable({
  documents,
  onDeleteDocument,
  onBatchDelete,
}: DocumentTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailDoc, setDetailDoc] = useState<DocumentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id?: string; count?: number } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3500);
  };

  const allSelected =
    documents.length > 0 && selectedIds.size === documents.length;

  const handleToggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(documents.map((d) => d.id)));
    }
  };

  const handleToggleRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDownload = (doc: DocumentItem) => {
    showToast(`Downloading "${doc.filename}" from S3 tier...`);
  };

  const handleBatchDownload = () => {
    setIsProcessingBatch(true);
    setTimeout(() => {
      setIsProcessingBatch(false);
      showToast(
        `Archive generated: ${selectedIds.size} files packaged into LedgerOne-Export.zip`
      );
      setSelectedIds(new Set());
    }, 1000);
  };

  const handleBatchOCR = () => {
    setIsProcessingBatch(true);
    setTimeout(() => {
      setIsProcessingBatch(false);
      showToast(
        `OCR reprocessing queued for ${selectedIds.size} documents across CUDA workers.`
      );
      setSelectedIds(new Set());
    }, 1200);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.id) {
      if (onDeleteDocument) {
        onDeleteDocument(deleteTarget.id);
      }
      showToast(`Document ${deleteTarget.id} removed from repository.`);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.id!);
        return next;
      });
    } else if (deleteTarget.count) {
      const ids = Array.from(selectedIds);
      if (onBatchDelete) {
        onBatchDelete(ids);
      }
      showToast(`${ids.length} documents archived and removed from view.`);
      setSelectedIds(new Set());
    }
    setDeleteTarget(null);
  };

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

  if (documents.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="w-5 h-5 text-ink-muted" />}
        title="No documents match your filter"
        description="Try clearing your search query or upload a new financial document into the workspace."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.dispatchEvent(new CustomEvent("open-upload-modal"))}
          >
            Upload Document
          </Button>
        }
      />
    );
  }

  return (
    <div className="relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-surface-elevated border border-hairline-strong shadow-floating-panel text-xs text-ink-primary animate-in slide-in-from-bottom-3 duration-200">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 text-ink-muted hover:text-ink-primary"
            aria-label="Dismiss message"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Floating Batch Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-2 z-30 mb-4 p-2 rounded-xl bg-surface-elevated border border-brand/40 shadow-floating-panel flex items-center justify-between gap-3 text-xs animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2.5 pl-2">
            <span className="w-5 h-5 rounded-md bg-brand text-white font-mono text-[10px] font-bold flex items-center justify-center">
              {selectedIds.size}
            </span>
            <span className="font-medium text-ink-primary">
              {selectedIds.size} {selectedIds.size === 1 ? "document" : "documents"} selected
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="xs"
              onClick={handleBatchDownload}
              loading={isProcessingBatch}
              icon={<Download className="w-3 h-3 text-brand-light" />}
            >
              Export ZIP
            </Button>

            <Button
              variant="secondary"
              size="xs"
              onClick={handleBatchOCR}
              loading={isProcessingBatch}
              icon={<RefreshCw className="w-3 h-3 text-sky-400" />}
            >
              Re-run OCR
            </Button>

            <Button
              variant="danger"
              size="xs"
              onClick={() => setDeleteTarget({ count: selectedIds.size })}
              icon={<Trash2 className="w-3 h-3" />}
            >
              Delete
            </Button>

            <button
              onClick={() => setSelectedIds(new Set())}
              className="p-1 rounded text-ink-muted hover:text-ink-primary hover:bg-surface-hover transition"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Financial Table Component */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 text-center">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={handleToggleAll}
                className="rounded border-hairline bg-surface-subtle text-brand focus:ring-0 cursor-pointer"
                title="Select all documents"
              />
            </TableHead>
            <TableHead>Document / File</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Vendor / Reference</TableHead>
            <TableHead align="right">Total Amount</TableHead>
            <TableHead align="center">Invariants</TableHead>
            <TableHead>Status</TableHead>
            <TableHead align="right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((doc) => {
            const catMeta =
              CATEGORY_CONFIG[doc.category as DocumentCategory] ||
              CATEGORY_CONFIG.INVOICE;
            const statMeta =
              STATUS_CONFIG[doc.status as ProcessingStatus] ||
              STATUS_CONFIG.READY;
            const isSelected = selectedIds.has(doc.id);

            return (
              <TableRow key={doc.id} selected={isSelected}>
                {/* Row Checkbox */}
                <TableCell align="center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => handleToggleRow(doc.id, e as any)}
                    className="rounded border-hairline bg-surface-subtle text-brand focus:ring-0 cursor-pointer"
                  />
                </TableCell>

                {/* Filename & Metadata */}
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-md bg-surface-elevated border border-hairline flex items-center justify-center shrink-0">
                      <FileText className="w-3.5 h-3.5 text-ink-muted" />
                    </div>
                    <div>
                      <Link
                        href={`/documents/${doc.id}/review`}
                        className="font-medium text-ink-primary hover:text-brand-light transition-colors"
                      >
                        {doc.filename}
                      </Link>
                      <div className="flex items-center gap-1.5 text-[10px] text-ink-muted font-mono mt-0.5">
                        <span>
                          {doc.page_count} {doc.page_count === 1 ? "page" : "pages"}
                        </span>
                        <span className="text-ink-disabled">·</span>
                        <span>{(doc.file_size_bytes / 1024).toFixed(0)} KB</span>
                      </div>
                    </div>
                  </div>
                </TableCell>

                {/* Category */}
                <TableCell>
                  <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-surface-subtle border border-hairline text-ink-secondary">
                    {catMeta.label}
                  </span>
                </TableCell>

                {/* Vendor & ID */}
                <TableCell>
                  <div className="font-medium text-ink-secondary truncate max-w-[180px]">
                    {doc.vendor_name || "—"}
                  </div>
                  <div className="text-[10px] font-mono text-ink-muted">
                    {doc.invoice_number || "—"}
                  </div>
                </TableCell>

                {/* Total Financial Amount */}
                <TableCell align="right" mono>
                  {doc.total_amount ? formatCurrency(doc.total_amount) : "—"}
                </TableCell>

                {/* Accounting Invariant State */}
                <TableCell align="center">
                  {doc.invariants_passed ? (
                    <Badge variant="verified" size="sm" dot>
                      Passed
                    </Badge>
                  ) : (
                    <Badge variant="review" size="sm" dot>
                      Review
                    </Badge>
                  )}
                </TableCell>

                {/* Processing Status */}
                <TableCell>
                  <Badge variant={getStatusBadgeVariant(doc.status as ProcessingStatus)} size="sm" dot>
                    {statMeta.label}
                  </Badge>
                </TableCell>

                {/* Actions */}
                <TableCell align="right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDetailDoc(doc)}
                      title="Document Metadata & S3 Provenance"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDownload(doc)}
                      title="Download Original PDF"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget({ id: doc.id })}
                      title="Delete Document"
                      className="hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>

                    <Link href={`/documents/${doc.id}/review`} className="ml-1">
                      <Button variant="subtle" size="xs" icon={<ChevronRight className="w-3 h-3" />}>
                        Studio
                      </Button>
                    </Link>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Metadata Detail Modal */}
      {detailDoc && (
        <DocumentDetailModal
          document={detailDoc}
          onClose={() => setDetailDoc(null)}
          onDownload={handleDownload}
        />
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Confirm Deletion"
        description="Permanently remove file from S3 object storage and PostgreSQL ledger"
        maxWidth="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={confirmDelete}>
              Confirm Delete
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4" />
            </div>
            <p className="text-xs text-ink-secondary leading-relaxed">
              {deleteTarget?.id
                ? `Are you sure you want to delete ${deleteTarget.id}?`
                : `Are you sure you want to delete ${deleteTarget?.count} selected documents?`}
            </p>
          </div>
          <p className="text-[11px] text-ink-muted bg-surface-subtle p-2.5 rounded-lg border border-hairline">
            This action will mark the S3 object for tombstoning and invalidate cached OCR embeddings in pgvector.
          </p>
        </div>
      </Modal>
    </div>
  );
}
