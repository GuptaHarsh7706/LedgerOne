"use client";

import React, { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DocumentTable } from "@/components/documents/DocumentTable";
import { CategoryFilterBar } from "@/components/documents/CategoryFilterBar";
import { UploadModal } from "@/components/documents/UploadModal";
import { MOCK_DOCUMENTS, DocumentItem } from "@/lib/api-client";
import { Upload, Database } from "lucide-react";

function DocumentsContent() {
  const searchParams = useSearchParams();
  const initialUploadOpen = searchParams?.get("action") === "upload";

  const [documents, setDocuments] = useState<DocumentItem[]>(MOCK_DOCUMENTS);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(initialUploadOpen);

  useEffect(() => {
    const handleOpen = () => setIsUploadOpen(true);
    window.addEventListener("open-upload-modal", handleOpen);
    return () => window.removeEventListener("open-upload-modal", handleOpen);
  }, []);

  const handleDeleteDocument = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const handleBatchDelete = (ids: string[]) => {
    const idSet = new Set(ids);
    setDocuments((prev) => prev.filter((d) => !idSet.has(d.id)));
  };

  // Compute category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: documents.length };
    for (const d of documents) {
      counts[d.category] = (counts[d.category] || 0) + 1;
    }
    return counts;
  }, [documents]);

  // Filtered documents
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const matchCat =
        selectedCategory === "ALL" || doc.category === selectedCategory;
      const matchQuery =
        !searchQuery ||
        doc.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (doc.vendor_name &&
          doc.vendor_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (doc.invoice_number &&
          doc.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCat && matchQuery;
    });
  }, [documents, selectedCategory, searchQuery]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink-primary">
            Document Repository & Ingestion Hub
          </h1>
          <p className="text-xs text-ink-muted">
            Audited financial artifacts stored in Private S3 Assets Bucket with PostgreSQL RLS
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-card border border-hairline text-xs text-ink-muted">
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span>S3 Assets: ap-southeast-1</span>
          </div>

          <button
            onClick={() => setIsUploadOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-brand hover:bg-brand-light text-white text-xs font-semibold shadow-hairline-glow transition"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Document</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <CategoryFilterBar
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        totalCounts={categoryCounts}
      />

      {/* Main Table View */}
      <DocumentTable
        documents={filteredDocuments}
        onDeleteDocument={handleDeleteDocument}
        onBatchDelete={handleBatchDelete}
      />

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={() => {
          // Re-fetch or keep updated
        }}
      />
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 max-w-7xl mx-auto text-xs text-ink-muted">
          Loading document repository...
        </div>
      }
    >
      <DocumentsContent />
    </Suspense>
  );
}
