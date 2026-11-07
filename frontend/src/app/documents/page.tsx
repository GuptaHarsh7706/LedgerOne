"use client";

import React, { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DocumentTable } from "@/components/documents/DocumentTable";
import { CategoryFilterBar } from "@/components/documents/CategoryFilterBar";
import { UploadModal } from "@/components/documents/UploadModal";
import { MOCK_DOCUMENTS, DocumentItem, api } from "@/lib/api-client";
import { Upload, Database, RefreshCw } from "lucide-react";
import { Button, PageTransition } from "@/components/ui";

function DocumentsContent() {
  const searchParams = useSearchParams();
  const initialUploadOpen = searchParams?.get("action") === "upload";

  const [documents, setDocuments] = useState<DocumentItem[]>(MOCK_DOCUMENTS);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(initialUploadOpen);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Dynamic fetch function from FastAPI backend
  const fetchDocuments = async () => {
    setIsLoading(true);
    try {
      const data = await api.documents.list({ category: selectedCategory });
      setDocuments(data);
    } catch (err) {
      console.warn("Failed to load live documents from backend", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [selectedCategory]);

  useEffect(() => {
    const handleOpen = () => setIsUploadOpen(true);
    window.addEventListener("open-upload-modal", handleOpen);
    return () => window.removeEventListener("open-upload-modal", handleOpen);
  }, []);

  const handleDeleteDocument = async (id: string) => {
    try {
      await api.documents.delete(id);
    } catch (e) {
      console.warn("Delete request failed", e);
    }
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const handleBatchDelete = async (ids: string[]) => {
    const idSet = new Set(ids);
    for (const id of ids) {
      try {
        await api.documents.delete(id);
      } catch (e) {
        console.warn("Batch delete failed on", id);
      }
    }
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
    <PageTransition className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink-primary">
            Document Repository & Ingestion Hub
          </h1>
          <p className="text-xs text-ink-muted">
            Audited financial artifacts stored in Private S3 Assets Bucket with PostgreSQL RLS
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-card border border-hairline text-xs text-ink-muted">
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-mono text-[11px]">S3 Assets: ap-southeast-1</span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={fetchDocuments}
            disabled={isLoading}
            aria-label="Refresh from PostgreSQL"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-brand-light" : ""}`} />
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsUploadOpen(true)}
            icon={<Upload className="w-3.5 h-3.5" />}
          >
            Upload Document
          </Button>
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
        onUploadSuccess={fetchDocuments}
      />
    </PageTransition>
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
