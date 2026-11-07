"use client";

import React, { useState } from "react";
import { X, XCircle, AlertTriangle } from "lucide-react";

interface DocumentRejectModalProps {
  isOpen: boolean;
  documentId: string;
  filename: string;
  onClose: () => void;
  onConfirmReject: (reason: string) => void;
}

export function DocumentRejectModal({
  isOpen,
  filename,
  onClose,
  onConfirmReject,
}: DocumentRejectModalProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleReject = () => {
    if (!reason.trim() || reason.trim().length < 8) {
      setError("Please document a specific rejection reason (min 8 characters).");
      return;
    }
    onConfirmReject(reason);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="fixed inset-0 -z-10" onClick={onClose} />
      <div className="w-full max-w-md bg-surface-elevated border border-hairline-strong rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-hairline bg-surface-subtle">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
              <XCircle className="w-3.5 h-3.5 text-rose-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink-primary">
                Reject Financial Document
              </h3>
              <p className="text-[10px] text-ink-muted">{filename}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-ink-muted hover:text-ink-primary transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 text-xs">
          <div>
            <label className="block text-ink-secondary font-medium mb-1">
              Statutory Rejection Reason (Mandatory)
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError("");
              }}
              placeholder="e.g., 'Unapproved price inflation detected vs contracted PO-2026-4412. Sent back to supplier for credit note issuance.'..."
              className="w-full px-3 py-2 rounded-lg bg-surface-card border border-hairline text-ink-primary placeholder-ink-muted focus:border-rose-400 focus:outline-none"
              autoFocus
            />
            {error && <p className="text-[10px] text-rose-400 mt-1">{error}</p>}
          </div>

          <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>
              Rejecting transitions this document state to <code>REJECTED</code> and halts accounts payable workflow. A formal notification is recorded in the audit ledger.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-hairline bg-surface-subtle flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs text-ink-secondary hover:text-ink-primary transition"
          >
            Cancel
          </button>
          <button
            onClick={handleReject}
            className="px-4 py-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-hairline-glow transition flex items-center gap-1.5"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Confirm Rejection</span>
          </button>
        </div>
      </div>
    </div>
  );
}
