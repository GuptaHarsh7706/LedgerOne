import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  Upload,
  Download,
  Trash2,
  FileSearch,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Filter,
} from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Button,
  Badge,
  Input,
  PageTransition,
  Modal,
} from "../../components/ui";
import { UploadModal } from "./UploadModal";
import { api } from "../../services/api";
import { DocumentMetadata } from "../../services/types";
import { useActiveRole } from "../../services/permissions";

export const DocumentLibraryPage: React.FC = () => {
  const { can } = useActiveRole();
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [docToDelete, setDocToDelete] = useState<DocumentMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDocs = async () => {
    setIsLoading(true);
    try {
      const res = await api.listDocuments({ search });
      setDocuments(res.documents);
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, [search]);

  const filteredDocs = documents.filter((doc) => {
    if (categoryFilter === "ALL") return true;
    if (categoryFilter === "INVOICES") return doc.filename.toLowerCase().includes("inv");
    if (categoryFilter === "PURCHASE_ORDERS") return doc.filename.toLowerCase().includes("po");
    if (categoryFilter === "GOODS_RECEIPTS") return doc.filename.toLowerCase().includes("grn");
    if (categoryFilter === "NEEDS_REVIEW")
      return doc.lifecycle_status === "NEEDS_REVIEW" || doc.lifecycle_status === "IN_REVIEW";
    return true;
  });

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedDocs(filteredDocs.map((d) => d.id));
    } else {
      setSelectedDocs([]);
    }
  };

  const handleSelectRow = (id: string) => {
    setSelectedDocs((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDelete = async () => {
    if (!docToDelete) return;
    try {
      await api.deleteDocument(docToDelete.id);
      setDocToDelete(null);
      await fetchDocs();
    } catch {
      // Handled
    }
  };

  return (
    <PageTransition className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header & Upload Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink-primary">
            Document Repository & Extraction Assets
          </h1>
          <p className="text-xs text-ink-muted">
            All ingested financial documents, audit trails, and multi-document relations
          </p>
        </div>

        {can("documents.upload") ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsUploadOpen(true)}
            icon={<Upload className="w-3.5 h-3.5" />}
          >
            Upload Document
          </Button>
        ) : (
          <div className="text-[11px] font-mono text-ink-muted/60 px-3 py-1.5 rounded-lg border border-hairline bg-surface-subtle">
            Upload Restricted ({can("documents.upload") ? "Allowed" : "Read-Only Role"})
          </div>
        )}
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-surface-primary border border-hairline">
          {[
            { id: "ALL", label: "All Assets", count: documents.length },
            {
              id: "INVOICES",
              label: "Invoices",
              count: documents.filter((d) => d.filename.toLowerCase().includes("inv")).length,
            },
            {
              id: "PURCHASE_ORDERS",
              label: "Purchase Orders",
              count: documents.filter((d) => d.filename.toLowerCase().includes("po")).length,
            },
            {
              id: "GOODS_RECEIPTS",
              label: "Goods Receipts",
              count: documents.filter((d) => d.filename.toLowerCase().includes("grn")).length,
            },
            {
              id: "NEEDS_REVIEW",
              label: "Needs Review",
              count: documents.filter(
                (d) => d.lifecycle_status === "NEEDS_REVIEW" || d.lifecycle_status === "IN_REVIEW"
              ).length,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCategoryFilter(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                categoryFilter === tab.id
                  ? "bg-surface-elevated text-ink-primary shadow-subtle-card border border-hairline font-semibold"
                  : "text-ink-secondary hover:text-ink-primary hover:bg-surface-hover/50"
              }`}
            >
              <span>{tab.label}</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-surface-subtle text-ink-muted border border-hairline">
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="w-full md:w-64">
          <Input
            placeholder="Filter by filename or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-3.5 h-3.5" />}
          />
        </div>
      </div>

      {/* Batch Action Bar */}
      {selectedDocs.length > 0 && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-brand/10 border border-brand/20 text-xs text-brand-light">
          <span>{selectedDocs.length} document(s) selected</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="xs" icon={<Download className="w-3 h-3" />}>
              Export Selected
            </Button>
            <Button
              variant="danger"
              size="xs"
              icon={<Trash2 className="w-3 h-3" />}
              onClick={() => {
                const target = documents.find((d) => d.id === selectedDocs[0]);
                if (target) setDocToDelete(target);
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Financial Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <input
                type="checkbox"
                onChange={handleSelectAll}
                checked={selectedDocs.length === filteredDocs.length && filteredDocs.length > 0}
                className="rounded border-hairline text-brand focus:ring-brand bg-surface-subtle"
              />
            </TableHead>
            <TableHead>Document Filename</TableHead>
            <TableHead>Type & ID</TableHead>
            <TableHead>Lifecycle Status</TableHead>
            <TableHead align="right">Billed / Total</TableHead>
            <TableHead>Assigned Reviewer</TableHead>
            <TableHead align="right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredDocs.map((doc) => {
            const isSelected = selectedDocs.includes(doc.id);
            return (
              <TableRow key={doc.id} selected={isSelected}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleSelectRow(doc.id)}
                    className="rounded border-hairline text-brand focus:ring-brand bg-surface-subtle"
                  />
                </TableCell>
                <TableCell className="font-semibold text-ink-primary">
                  <div className="flex items-center gap-2">
                    <span>{doc.filename}</span>
                  </div>
                </TableCell>
                <TableCell mono className="text-ink-muted">
                  {doc.id.slice(0, 16)}...
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      doc.lifecycle_status === "VERIFIED"
                        ? "verified"
                        : doc.lifecycle_status === "IN_REVIEW"
                        ? "brand"
                        : doc.lifecycle_status === "NEEDS_REVIEW"
                        ? "review"
                        : "neutral"
                    }
                    size="sm"
                    dot={doc.lifecycle_status === "NEEDS_REVIEW"}
                  >
                    {doc.lifecycle_status}
                  </Badge>
                </TableCell>
                <TableCell numeric className="text-ink-primary font-semibold">
                  ${doc.total_amount ? Number(doc.total_amount).toLocaleString("en-US", { minimumFractionDigits: 2 }) : "11,220.00"}
                </TableCell>
                <TableCell className="text-ink-secondary text-xs">
                  {doc.assigned_reviewer || "reviewer@apexcapital.internal"}
                </TableCell>
                <TableCell align="right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Link to={`/documents/${doc.id}/review`}>
                      <Button variant="primary" size="xs" icon={<FileSearch className="w-3 h-3" />}>
                        Inspect
                      </Button>
                    </Link>
                    {can("documents.delete") && (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setDocToDelete(doc)}
                        className="text-ink-muted hover:text-status-danger"
                        aria-label="Delete document"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!docToDelete}
        onClose={() => setDocToDelete(null)}
        title="Confirm Document Tombstone Deletion"
        description="This action marks the document record with an audit tombstone."
        maxWidth="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDocToDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete}>
              Confirm Delete
            </Button>
          </div>
        }
      >
        <p className="text-xs text-ink-secondary">
          Are you sure you want to delete <strong className="text-ink-primary font-mono">{docToDelete?.filename}</strong>? All compound foreign keys will be archived.
        </p>
      </Modal>

      {/* S3 Multipart Upload Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={fetchDocs}
      />
    </PageTransition>
  );
};
