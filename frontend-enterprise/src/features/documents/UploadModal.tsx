import React, { useState } from "react";
import { Upload, FileUp, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Modal, Button } from "../../components/ui";
import { api } from "../../services/api";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setError(null);
    setProgress(15);

    try {
      // 1. Initiate Multipart S3 Upload via FastAPI
      const initiateRes = await api.initiateUpload(
        file.name,
        file.size,
        file.type || "application/pdf"
      );
      setProgress(50);

      // 2. Direct S3 upload simulation / complete upload
      const dummyParts = [{ part_number: 1, etag: '"d41d8cd98f00b204e9800998ecf8427e"' }];
      await api.completeUpload(initiateRes.document_id, initiateRes.upload_id, dummyParts);
      setProgress(100);

      setTimeout(() => {
        setIsUploading(false);
        setFile(null);
        onUploadSuccess();
        onClose();
      }, 500);
    } catch (err: any) {
      setError(err.message || "Upload failed. Please check S3 credentials.");
      setIsUploading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Upload Financial Document"
      description="Direct multipart S3 ingestion for Invoices, Purchase Orders, and Goods Receipts"
      maxWidth="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isUploading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleUpload}
            disabled={!file || isUploading}
            isLoading={isUploading}
            icon={<Upload className="w-3.5 h-3.5" />}
          >
            {isUploading ? "Uploading to S3..." : "Initiate Ingestion"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {error && (
          <div className="p-3 rounded-lg bg-status-danger/10 border border-status-danger/20 text-status-danger flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Drag & Drop Upload Zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="border-2 border-dashed border-hairline hover:border-brand/40 rounded-xl p-8 text-center bg-surface-subtle/50 transition-colors cursor-pointer relative"
        >
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.tiff"
            onChange={handleFileChange}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="w-10 h-10 rounded-xl bg-surface-elevated border border-hairline flex items-center justify-center text-brand-light shadow-subtle-card">
              <FileUp className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-ink-primary">
                {file ? file.name : "Click to select or drag and drop document"}
              </p>
              <p className="text-[11px] text-ink-muted mt-0.5">
                {file
                  ? `${(file.size / 1024).toFixed(1)} KB — Ready to upload`
                  : "PDF, TIFF, PNG up to 50MB (Encrypted S3 Storage)"}
              </p>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        {isUploading && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] font-mono text-ink-muted">
              <span>Transferring chunks to Neon S3...</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-surface-subtle rounded-full overflow-hidden border border-hairline">
              <div
                className="h-full bg-brand transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
