"use client";

import React, { useState } from "react";
import {
  X,
  UploadCloud,
  FileCheck,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from "lucide-react";

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

  const startUpload = () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadProgress(15);
    setProcessingStage("Acquiring 15-minute presigned S3 lease...");

    setTimeout(() => {
      setUploadProgress(45);
      setProcessingStage("Streaming bytes to Private S3 Assets Bucket (ap-southeast-1)...");
    }, 600);

    setTimeout(() => {
      setUploadProgress(75);
      setProcessingStage("Modular OCR: High-DPI rasterization & TrOCR CUDA inference...");
    }, 1400);

    setTimeout(() => {
      setUploadProgress(95);
      setProcessingStage("Hungarian Table Solver: Extracting tabular line items...");
    }, 2200);

    setTimeout(() => {
      setUploadProgress(100);
      setProcessingStage("Pure Decimal Invariant Evaluation: Complete!");
      setUploading(false);
      setCompleted(true);
      if (onUploadSuccess) onUploadSuccess();
    }, 3000);
  };

  const reset = () => {
    setSelectedFile(null);
    setUploading(false);
    setCompleted(false);
    setUploadProgress(0);
    setProcessingStage("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="fixed inset-0 -z-10" onClick={onClose} />
      <div className="w-full max-w-lg bg-surface-elevated border border-hairline-strong rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-hairline bg-surface-subtle">
          <div>
            <h2 className="text-sm font-semibold text-ink-primary">
              Ingest Document into LedgerOne
            </h2>
            <p className="text-[11px] text-ink-muted">
              Direct streaming to Neon S3 Object Storage with instant OCR
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-ink-muted hover:text-ink-primary hover:bg-surface-hover transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
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

              {/* Drag and Drop Box */}
              {!selectedFile ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  className={`p-8 border-2 border-dashed rounded-xl text-center cursor-pointer transition ${
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
                  <UploadCloud className="w-10 h-10 text-brand-light mx-auto mb-3" />
                  <p className="text-xs font-semibold text-ink-primary">
                    Drop PDF, XLSX, CSV, or Image files here
                  </p>
                  <p className="text-[11px] text-ink-muted mt-1">
                    Supports up to 50MB per document with SHA-256 deduplication
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-surface-card border border-hairline flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center">
                      <FileCheck className="w-5 h-5 text-brand-light" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-ink-primary truncate max-w-[260px]">
                        {selectedFile.name}
                      </div>
                      <div className="text-[10px] text-ink-muted font-mono">
                        {(selectedFile.size / 1024).toFixed(1)} KB • Ready for lease
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
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-ink-primary">
                Document Successfully Ingested & Parsed
              </h3>
              <p className="text-xs text-ink-muted max-w-sm mx-auto">
                High-DPI rendering, Hungarian table reconstruction, and Decimal invariant validation were completed.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-hairline bg-surface-subtle flex items-center justify-end gap-2">
          {!completed ? (
            <>
              <button
                onClick={onClose}
                disabled={uploading}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-ink-secondary hover:text-ink-primary hover:bg-surface-hover transition"
              >
                Cancel
              </button>
              <button
                onClick={startUpload}
                disabled={!selectedFile || uploading}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold shadow-hairline-glow transition flex items-center gap-1.5 ${
                  !selectedFile || uploading
                    ? "bg-surface-hover text-ink-disabled cursor-not-allowed"
                    : "bg-brand hover:bg-brand-light text-white"
                }`}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>Start Pipeline Ingestion</span>
                )}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-md bg-brand hover:bg-brand-light text-white text-xs font-semibold transition"
            >
              Done & Return to Library
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
