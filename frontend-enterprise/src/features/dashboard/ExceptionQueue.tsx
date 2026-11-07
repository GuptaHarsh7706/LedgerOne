import React from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowUpRight, CheckCircle2, ShieldAlert } from "lucide-react";
import { Badge, Button } from "../../components/ui";
import { DocumentMetadata } from "../../services/types";

interface ExceptionQueueProps {
  documents: DocumentMetadata[];
  onClaim?: (docId: string) => void;
}

export const ExceptionQueue: React.FC<ExceptionQueueProps> = ({ documents, onClaim }) => {
  const exceptions = documents.filter(
    (d) => d.lifecycle_status === "NEEDS_REVIEW" || d.lifecycle_status === "IN_REVIEW"
  );

  return (
    <div className="rounded-2xl bg-surface-primary border border-hairline p-4 shadow-subtle-card space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-hairline">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-status-warning" />
          <h3 className="text-xs font-semibold text-ink-primary">
            Active Exception Verification Queue ({exceptions.length})
          </h3>
        </div>
        <Link
          to="/review-queue"
          className="text-[11px] font-mono text-brand-light hover:underline flex items-center gap-1"
        >
          View Full Queue <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>

      {exceptions.length === 0 ? (
        <div className="p-6 text-center text-xs text-ink-muted">
          All workspace documents verified. Zero exceptions pending.
        </div>
      ) : (
        <div className="space-y-2">
          {exceptions.map((doc) => (
            <div
              key={doc.id}
              className="p-3 rounded-xl bg-surface-elevated/80 border border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-ink-primary">
                    {doc.filename}
                  </span>
                  <Badge variant={doc.lifecycle_status === "IN_REVIEW" ? "brand" : "review"} size="sm" dot>
                    {doc.lifecycle_status}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px] text-ink-muted">
                  <span>ID: {doc.id.slice(0, 18)}...</span>
                  <span>Vendor: {doc.vendor_name || "DataCore Enterprise"}</span>
                  <span className="text-emerald-400 font-semibold">
                    ${doc.total_amount ? Number(doc.total_amount).toLocaleString("en-US", { minimumFractionDigits: 2 }) : "11,220.00"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {onClaim && doc.lifecycle_status !== "IN_REVIEW" && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => onClaim(doc.id)}
                  >
                    Claim
                  </Button>
                )}
                <Link to={`/documents/${doc.id}/review`}>
                  <Button variant="primary" size="xs">
                    Inspect Evidence
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
