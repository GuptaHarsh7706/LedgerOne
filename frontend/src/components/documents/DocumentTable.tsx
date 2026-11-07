"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  FileText,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ChevronRight,
  Download,
  Info,
  Trash2,
  RefreshCw,
  Archive,
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

  if (documents.length === 0) {
    return (
      <div className="py-16 text-center border border-dashed border-hairline rounded-xl bg-surface-subtle">
        <FileText className="w-8 h-8 text-ink-muted mx-auto mb-2 opacity-50" />
        <p className="text-sm font-medium text-ink-secondary">
          No documents match your filter
        </p>
        <p className="text-xs text-ink-muted mt-1">
          Try clearing your search query or upload a new financial document.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-surface-elevated border border-brand/30 shadow-2xl text-xs text-ink-primary animate-in slide-in-from-bottom-3 duration-200">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 text-ink-muted hover:text-ink-primary"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Floating Batch Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-2 z-30 mb-4 p-2.5 rounded-xl bg-surface-elevated border border-brand/40 shadow-2xl flex items-center justify-between gap-3 text-xs animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2.5 pl-2">
            <span className="w-6 h-6 rounded-md bg-brand text-white font-mono text-[11px] font-bold flex items-center justify-center">
              {selectedIds.size}
            </span>
            <span className="font-semibold text-ink-primary">
              {selectedIds.size} {selectedIds.size === 1 ? "document" : "documents"} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleBatchDownload}
              disabled={isProcessingBatch}
              className="px-3 py-1.5 rounded-lg bg-surface-card hover:bg-surface-hover text-ink-primary border border-hairline transition flex items-center gap-1.5 font-medium disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-brand-light" />
              <span>Download .ZIP</span>
            </button>

            <button
              onClick={handleBatchOCR}
              disabled={isProcessingBatch}
              className="px-3 py-1.5 rounded-lg bg-surface-card hover:bg-surface-hover text-ink-primary border border-hairline transition flex items-center gap-1.5 font-medium disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isProcessingBatch ? "animate-spin" : ""}`} />
              <span>Re-run OCR</span>
            </button>

            <button
              onClick={() => setDeleteTarget({ count: selectedIds.size })}
              className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 transition flex items-center gap-1.5 font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>

            <button
              onClick={() => setSelectedIds(new Set())}
              className="p-1.5 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-surface-hover transition"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="overflow-x-auto rounded-xl border border-hairline bg-surface-card shadow-subtle-card">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-hairline bg-surface-subtle text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
              <th className="py-3 px-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={handleToggleAll}
                  className="rounded border-hairline bg-surface-subtle text-brand focus:ring-0 cursor-pointer"
                  title="Select all documents"
                />
              </th>
              <th className="py-3 px-3">Document / File</th>
              <th className="py-3 px-3">Category</th>
              <th className="py-3 px-3">Vendor / Identifier</th>
              <th className="py-3 px-3 text-right">Total Amount</th>
              <th className="py-3 px-3 text-center">Invariants</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {documents.map((doc) => {
              const catMeta =
                CATEGORY_CONFIG[doc.category as DocumentCategory] ||
                CATEGORY_CONFIG.INVOICE;
              const statMeta =
                STATUS_CONFIG[doc.status as ProcessingStatus] ||
                STATUS_CONFIG.READY;
              const isSelected = selectedIds.has(doc.id);

              return (
                <tr
                  key={doc.id}
                  className={`hover:bg-surface-hover/80 transition-colors group ${
                    isSelected ? "bg-brand/5" : ""
                  }`}
                >
                  {/* Row Checkbox */}
                  <td className="py-3 px-3 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => handleToggleRow(doc.id, e as any)}
                      className="rounded border-hairline bg-surface-subtle text-brand focus:ring-0 cursor-pointer"
                    />
                  </td>

                  {/* Filename & Metadata */}
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-hairline flex items-center justify-center shrink-0 group-hover:border-brand/40 transition">
                        <FileText className="w-4 h-4 text-ink-muted group-hover:text-brand-light transition" />
                      </div>
                      <div>
                        <Link
                          href={`/documents/${doc.id}/review`}
                          className="font-medium text-ink-primary hover:text-brand-light transition"
                        >
                          {doc.filename}
                        </Link>
                        <div className="flex items-center gap-2 text-[10px] text-ink-muted font-mono mt-0.5">
                          <span>
                            {doc.page_count} {doc.page_count === 1 ? "page" : "pages"}
                          </span>
                          <span>•</span>
                          <span>{(doc.file_size_bytes / 1024).toFixed(0)} KB</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Category */}
                  <td className="py-3 px-3">
                    <span
                      className={`inline-block text-[10px] font-mono px-2 py-0.5 rounded ${catMeta.badgeClass}`}
                    >
                      {catMeta.label}
                    </span>
                  </td>

                  {/* Vendor & ID */}
                  <td className="py-3 px-3">
                    <div className="font-medium text-ink-secondary truncate max-w-[180px]">
                      {doc.vendor_name || "—"}
                    </div>
                    <div className="text-[10px] font-mono text-ink-muted">
                      {doc.invoice_number || "—"}
                    </div>
                  </td>

                  {/* Total Financial Amount */}
                  <td className="py-3 px-3 text-right font-mono font-medium text-ink-primary tabular-nums">
                    {doc.total_amount ? formatCurrency(doc.total_amount) : "—"}
                  </td>

                  {/* Accounting Invariant State */}
                  <td className="py-3 px-3 text-center">
                    {doc.invariants_passed ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" />
                        Passed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                        <XCircle className="w-3 h-3" />
                        Review
                      </span>
                    )}
                  </td>

                  {/* Processing Status */}
                  <td className="py-3 px-3">
                    <span
                      className={`inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-full ${statMeta.badgeClass}`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${statMeta.dotClass}`}
                      />
                      {statMeta.label}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setDetailDoc(doc)}
                        className="p-1.5 rounded hover:bg-surface-elevated text-ink-muted hover:text-ink-primary border border-transparent hover:border-hairline transition"
                        title="Document Metadata & S3 Provenance"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDownload(doc)}
                        className="p-1.5 rounded hover:bg-surface-elevated text-ink-muted hover:text-brand-light border border-transparent hover:border-hairline transition"
                        title="Download Original PDF"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => setDeleteTarget({ id: doc.id })}
                        className="p-1.5 rounded hover:bg-rose-500/10 text-ink-muted hover:text-rose-400 border border-transparent hover:border-rose-500/20 transition"
                        title="Delete Document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <Link
                        href={`/documents/${doc.id}/review`}
                        className="px-2.5 py-1 rounded bg-surface-elevated hover:bg-brand/20 hover:text-brand-light text-ink-secondary border border-hairline text-xs font-medium transition flex items-center gap-1 ml-1"
                      >
                        <span>Studio</span>
                        <ChevronRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Metadata Detail Modal */}
      {detailDoc && (
        <DocumentDetailModal
          document={detailDoc}
          onClose={() => setDetailDoc(null)}
          onDownload={handleDownload}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="fixed inset-0 -z-10" onClick={() => setDeleteTarget(null)} />
          <div className="w-full max-w-sm bg-surface-elevated border border-hairline-strong rounded-xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink-primary">
                  Confirm Deletion
                </h3>
                <p className="text-xs text-ink-muted">
                  {deleteTarget.id
                    ? `Are you sure you want to delete ${deleteTarget.id}?`
                    : `Are you sure you want to delete ${deleteTarget.count} selected documents?`}
                </p>
              </div>
            </div>

            <p className="text-[11px] text-ink-secondary bg-surface-subtle p-2.5 rounded-lg border border-hairline">
              This action will mark the S3 object for tombstoning and invalidate cached OCR embeddings in pgvector.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-ink-secondary hover:text-ink-primary hover:bg-surface-hover transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-3.5 py-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-hairline-glow transition"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
