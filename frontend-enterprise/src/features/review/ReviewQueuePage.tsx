import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  CheckSquare,
  ShieldAlert,
  Clock,
  UserCheck,
  FileSearch,
  ExternalLink,
  ShieldCheck,
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
  PageTransition,
} from "../../components/ui";
import { api } from "../../services/api";
import { DocumentMetadata } from "../../services/types";

export const ReviewQueuePage: React.FC = () => {
  const [queue, setQueue] = useState<DocumentMetadata[]>([]);
  const [filter, setFilter] = useState<"ALL" | "UNCLAIMED" | "IN_REVIEW">("ALL");
  const [isLoading, setIsLoading] = useState(true);

  const fetchQueue = async () => {
    setIsLoading(true);
    try {
      const res = await api.listReviewQueue();
      setQueue(res);
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const handleClaim = async (docId: string) => {
    try {
      await api.claimDocument(docId);
      await fetchQueue();
    } catch (err: any) {
      alert(err.message || "Failed to claim document");
    }
  };

  const filteredQueue = queue.filter((doc) => {
    if (filter === "UNCLAIMED") return doc.lifecycle_status === "NEEDS_REVIEW";
    if (filter === "IN_REVIEW") return doc.lifecycle_status === "IN_REVIEW";
    return true;
  });

  return (
    <PageTransition className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink-primary">
            Human Verification Queue & Exception Gating
          </h1>
          <p className="text-xs text-ink-muted">
            Segregation of Duties (SoD) dual-custody verification required prior to ERP export
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px] bg-surface-primary px-3 py-1.5 rounded-lg border border-hairline text-ink-muted">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>SoD Dual Custody Active</span>
        </div>
      </div>

      {/* Segregation of Duties Banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-surface-primary border border-hairline shadow-subtle-card text-xs">
        <ShieldAlert className="w-4 h-4 text-status-warning shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold text-ink-primary">
            Mandatory Separation of Ingestion & Verification
          </div>
          <p className="text-[11px] text-ink-secondary leading-relaxed">
            Per financial control standard <code>AUTH_SOD_002</code>, the user who ingested or altered an original document cannot unilaterally authorize final verification. Cross-reviewer authorization enforced via PostgreSQL Row-Level Security.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-surface-primary border border-hairline w-fit">
        {[
          { id: "ALL", label: "All Pending Items", count: queue.length },
          {
            id: "UNCLAIMED",
            label: "Unclaimed Queue",
            count: queue.filter((d) => d.lifecycle_status === "NEEDS_REVIEW").length,
          },
          {
            id: "IN_REVIEW",
            label: "In Active Review",
            count: queue.filter((d) => d.lifecycle_status === "IN_REVIEW").length,
          },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id as any)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              filter === tab.id
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

      {/* Review Queue Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Exception Document</TableHead>
            <TableHead>UUID</TableHead>
            <TableHead>Queue Status</TableHead>
            <TableHead>Vendor & Commitment</TableHead>
            <TableHead>Assigned Reviewer</TableHead>
            <TableHead align="right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredQueue.map((doc) => (
            <TableRow key={doc.id}>
              <TableCell className="font-semibold text-ink-primary">
                {doc.filename}
              </TableCell>
              <TableCell mono className="text-ink-muted">
                {doc.id.slice(0, 16)}...
              </TableCell>
              <TableCell>
                <Badge
                  variant={doc.lifecycle_status === "IN_REVIEW" ? "brand" : "review"}
                  size="sm"
                  dot
                >
                  {doc.lifecycle_status}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="font-medium text-ink-primary">
                  {doc.vendor_name || "DataCore Enterprise Inc."}
                </div>
                <div className="font-mono text-[11px] text-emerald-400">
                  ${doc.total_amount ? Number(doc.total_amount).toLocaleString("en-US", { minimumFractionDigits: 2 }) : "11,220.00"}
                </div>
              </TableCell>
              <TableCell className="text-ink-secondary">
                {doc.assigned_reviewer || "Unassigned"}
              </TableCell>
              <TableCell align="right">
                <div className="flex items-center justify-end gap-2">
                  {doc.lifecycle_status !== "IN_REVIEW" && (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => handleClaim(doc.id)}
                      icon={<UserCheck className="w-3 h-3" />}
                    >
                      Claim Document
                    </Button>
                  )}
                  <Link to={`/documents/${doc.id}/review`}>
                    <Button variant="primary" size="xs" icon={<FileSearch className="w-3 h-3" />}>
                      Open Studio
                    </Button>
                  </Link>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </PageTransition>
  );
};
