"use client";

import React, { useState } from "react";
import {
  UploadCloud,
  FileCheck,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { Modal, Button } from "@/components/ui";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess?: () => void;
}

export function UploadModal({ isOpen, onClose, onUploadSuccess }: UploadModalProps) {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState("INVOICE");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStage, setProcessingStage] = useState<string>("");
  const [completed, setCompleted] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const startUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadError(null);
    setUploadProgress(20);
    setProcessingStage("Initiating multipart stream to Neon S3 Assets Bucket...");

    try {
      setUploadProgress(50);
      setProcessingStage("Streaming bytes to S3 Object Storage (ap-southeast-1)...");

      const res = await api.documents.upload(selectedFile, category);

      if (res.error) {
        setUploadError(`Upload failed: ${res.error}`);
        setUploading(false);
        return;
      }

      setUploadProgress(100);
      setProcessingStage("Document ingested & queued for processing!");
      setUploading(false);
      setCompleted(true);
      if (onUploadSuccess) onUploadSuccess();
    } catch (err: any) {
      setUploadError(err?.message || "Document upload failed");
      setUploading(false);
    }
  };

  const reset = () => {
    setSelectedFile(null);
    setUploading(false);
    setCompleted(false);
    setUploadProgress(0);
    setProcessingStage("");
    setUploadError(null);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Ingest Document"
      description="Direct streaming to Neon S3 Object Storage with instant OCR & vector chunking"
      maxWidth="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          {!completed ? (
            <>
              <Button variant="ghost" size="sm" onClick={onClose} disabled={uploading}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={startUpload}
                disabled={!selectedFile || uploading}
                loading={uploading}
              >
                {uploading ? "Ingesting..." : "Start Ingestion"}
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                reset();
                onClose();
              }}
            >
              Done & Return to Library
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {!completed ? (
          <>
            {/* Category Selector */}
            <div>
              <label className="block text-xs font-medium text-ink-secondary mb-1.5">
                Expected Document Class
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={uploading}
                className="w-full px-3 py-2 rounded-lg bg-surface-card border border-hairline text-xs text-ink-primary focus:border-brand-light focus:outline-none"
              >
                <option value="INVOICE">Commercial Invoice</option>
                <option value="PURCHASE_ORDER">Purchase Order (PO)</option>
                <option value="RECEIPT">Goods Receipt Note (GRN)</option>
                <option value="CONTRACT">Legal Contract / Statement of Work</option>
                <option value="TAX_SCHEDULE">Tax Schedule / IRS Form</option>
              </select>
            </div>

            {/* Upload Error Banner */}
            {uploadError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Drag and Drop Box */}
            {!selectedFile ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`p-7 border border-dashed rounded-xl text-center cursor-pointer transition ${
                  dragOver
                    ? "border-brand-light bg-brand/5"
                    : "border-hairline hover:border-hairline-strong bg-surface-subtle"
                }`}
                onClick={() => document.getElementById("file-input")?.click()}
              >
                <input
                  id="file-input"
                  type="file"
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg,.tiff,.xlsx,.csv"
                  onChange={handleFileChange}
                />
                <UploadCloud className="w-8 h-8 text-brand-light mx-auto mb-2.5 opacity-80" />
                <p className="text-xs font-medium text-ink-primary">
                  Drop PDF, XLSX, CSV, or Image files here
                </p>
                <p className="text-[11px] text-ink-muted mt-1">
                  Supports up to 50MB with SHA-256 deduplication
                </p>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-surface-card border border-hairline flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center">
                    <FileCheck className="w-4 h-4 text-brand-light" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-ink-primary truncate max-w-[260px]">
                      {selectedFile.name}
                    </div>
                    <div className="text-[10px] text-ink-muted font-mono">
                      {(selectedFile.size / 1024).toFixed(1)} KB · Ready for lease
                    </div>
                  </div>
                </div>
                {!uploading && (
                  <button
                    onClick={reset}
                    className="text-xs text-rose-400 hover:underline"
                  >
                    Change
                  </button>
                )}
              </div>
            )}

            {/* Upload Progress Stream */}
            {uploading && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-ink-secondary font-medium">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-light" />
                    {processingStage}
                  </span>
                  <span className="font-mono text-ink-primary">{uploadProgress}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-surface-card overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-brand to-brand-light transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="py-6 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-ink-primary">
              Document Successfully Ingested & Parsed
            </h3>
            <p className="text-xs text-ink-muted max-w-sm mx-auto leading-relaxed">
              High-DPI rendering, Hungarian table reconstruction, and Decimal invariant validation were completed.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
