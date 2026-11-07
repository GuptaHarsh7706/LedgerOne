"use client";

import React from "react";
import Link from "next/link";
import {
  FileText,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { DocumentItem } from "@/lib/api-client";
import {
  CATEGORY_CONFIG,
  STATUS_CONFIG,
  formatCurrency,
  DocumentCategory,
  ProcessingStatus,
} from "@/lib/tokens";

interface DocumentTableProps {
  documents: DocumentItem[];
}

export function DocumentTable({ documents }: DocumentTableProps) {
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
    <div className="overflow-x-auto rounded-xl border border-hairline bg-surface-card shadow-subtle-card">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b border-hairline bg-surface-subtle text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
            <th className="py-3 px-4">Document / File</th>
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

            return (
              <tr
                key={doc.id}
                className="hover:bg-surface-hover/80 transition-colors group"
              >
                {/* Filename & Metadata */}
                <td className="py-3 px-4">
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
                        <span>{doc.page_count} {doc.page_count === 1 ? "page" : "pages"}</span>
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
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/documents/${doc.id}/review`}
                      className="px-2.5 py-1 rounded bg-surface-elevated hover:bg-brand/20 hover:text-brand-light text-ink-secondary border border-hairline text-xs font-medium transition flex items-center gap-1"
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
  );
}
