"use client";

import React, { useState } from "react";
import { XCircle, AlertTriangle } from "lucide-react";
import { Modal, Button } from "@/components/ui";

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Reject Document"
      description={filename}
      maxWidth="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleReject}
            icon={<XCircle className="w-3.5 h-3.5" />}
          >
            Confirm Rejection
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        <div>
          <label className="block text-ink-secondary font-medium mb-1.5">
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
            className="w-full px-3 py-2 rounded-xl bg-surface-card border border-hairline text-ink-primary placeholder-ink-muted focus:border-rose-400 focus:outline-none text-xs"
            autoFocus
          />
          {error && <p className="text-[11px] text-rose-400 mt-1">{error}</p>}
        </div>

        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span className="leading-relaxed">
            Rejecting transitions this document state to <code className="font-mono">REJECTED</code> and halts accounts payable workflow. A formal notification is recorded in the audit ledger.
          </span>
        </div>
      </div>
    </Modal>
  );
}
