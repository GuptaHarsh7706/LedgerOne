"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  FileText,
  Table as TableIcon,
  ShieldCheck,
  CheckCircle,
  XCircle,
  Lock,
  GitCompare,
  Edit2,
} from "lucide-react";
import {
  ExtractedField,
  ExtractedLineItem,
  InvariantResult,
  DocumentItem,
} from "@/lib/api-client";
import { TabularLineItemsTable } from "./TabularLineItemsTable";
import { InvariantPanel } from "./InvariantPanel";
import { formatConfidence } from "@/lib/tokens";
import { Badge, Button } from "@/components/ui";

interface ExtractionInspectorProps {
  document: DocumentItem;
  fields: ExtractedField[];
  lineItems: ExtractedLineItem[];
  invariants: InvariantResult[];
  activeFieldKey: string | null;
  onSelectField: (key: string) => void;
  onEditScalarField?: (field: ExtractedField) => void;
  onEditLineItem?: (li: ExtractedLineItem) => void;
  onOpenOverrideModal?: (inv: InvariantResult) => void;
  onApproveDocument?: () => void;
  onRejectDocument?: () => void;
  canApprove?: boolean;
}

export function ExtractionInspector({
  document,
  fields,
  lineItems,
  invariants,
  activeFieldKey,
  onSelectField,
  onEditScalarField,
  onEditLineItem,
  onOpenOverrideModal,
  onApproveDocument,
  onRejectDocument,
  canApprove = true,
}: ExtractionInspectorProps) {
  const [activeTab, setActiveTab] = useState<"FIELDS" | "TABLE" | "INVARIANTS">(
    "FIELDS"
  );

  return (
    <div className="w-[420px] bg-surface-subtle border-l border-hairline flex flex-col h-full shrink-0 select-none">
      {/* Header Tabs */}
      <div className="p-2 border-b border-hairline bg-surface-subtle/80 flex items-center gap-1">
        <button
          onClick={() => setActiveTab("FIELDS")}
          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 ${
            activeTab === "FIELDS"
              ? "bg-brand/10 text-brand-light border border-brand/20 shadow-sm"
              : "text-ink-secondary hover:text-ink-primary hover:bg-surface-hover"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Fields ({fields.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("TABLE")}
          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 ${
            activeTab === "TABLE"
              ? "bg-brand/10 text-brand-light border border-brand/20 shadow-sm"
              : "text-ink-secondary hover:text-ink-primary hover:bg-surface-hover"
          }`}
        >
          <TableIcon className="w-3.5 h-3.5" />
          <span>Lines ({lineItems.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("INVARIANTS")}
          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 ${
            activeTab === "INVARIANTS"
              ? "bg-brand/10 text-brand-light border border-brand/20 shadow-sm"
              : "text-ink-secondary hover:text-ink-primary hover:bg-surface-hover"
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Invariants</span>
        </button>
      </div>

      {/* Tab Content Area */}
      <div className="flex-1 p-3.5 overflow-y-auto space-y-3">
        {activeTab === "FIELDS" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-medium text-ink-primary">
                Normalized Scalar Extractions
              </span>
              <span className="text-[10px] font-mono text-ink-muted">
                Zero False Acceptance
              </span>
            </div>

            {fields.map((f) => {
              const isSelected = activeFieldKey === f.name;
              const conf = formatConfidence(f.confidence);

              return (
                <div
                  key={f.name}
                  onClick={() => onSelectField(f.name)}
                  className={`p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                    isSelected
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-200 shadow-sm"
                      : "bg-surface-card border-hairline hover:border-hairline-strong text-ink-secondary"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-ink-muted">
                      {f.label}
                    </span>
                    <div className="flex items-center gap-1.5 font-mono text-[10px]">
                      <span className="text-ink-muted">P.{f.page_number}</span>
                      <span className={`px-1.5 py-0.2 rounded font-medium ${conf.colorClass}`}>
                        {conf.text}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-ink-primary text-sm font-mono truncate">
                      {f.value}
                    </div>
                    {onEditScalarField && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditScalarField(f);
                        }}
                        className="p-1 rounded hover:bg-surface-elevated text-ink-muted hover:text-brand-light transition"
                        title="Edit field value"
                        aria-label="Edit field value"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div className="text-[10px] text-ink-muted font-mono mt-1 truncate">
                    Raw OCR: &quot;{f.raw_value}&quot;
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "TABLE" && (
          <TabularLineItemsTable
            lineItems={lineItems}
            activeFieldKey={activeFieldKey}
            onSelectLine={(num) => onSelectField(`line_${num}`)}
            onEditCell={onEditLineItem}
          />
        )}

        {activeTab === "INVARIANTS" && (
          <InvariantPanel
            invariants={invariants}
            onOpenOverrideModal={onOpenOverrideModal}
          />
        )}
      </div>

      {/* Dual-Custody Verification Actions Bar */}
      <div className="p-3.5 border-t border-hairline bg-surface-subtle space-y-2.5">
        {/* SoD Compliance Banner */}
        <div className="flex items-center justify-between text-[11px] text-ink-muted bg-surface-card p-2 rounded-lg border border-hairline">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-brand-light" />
            <span>Dual-Custody SoD Gate</span>
          </div>
          <Badge variant={canApprove ? "verified" : "discrepancy"} size="sm" dot>
            {canApprove ? "ELIGIBLE" : "BARRED (UPLOADER)"}
          </Badge>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="danger"
            size="sm"
            onClick={onRejectDocument}
            className="flex-1"
            icon={<XCircle className="w-3.5 h-3.5" />}
          >
            Reject
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={onApproveDocument}
            disabled={!canApprove}
            className="flex-1"
            icon={<CheckCircle className="w-3.5 h-3.5" />}
          >
            Verify & Approve
          </Button>
        </div>

        {/* 3-Way Reconciler Deep Link */}
        <Link href="/matching" className="block w-full">
          <Button
            variant="subtle"
            size="xs"
            className="w-full"
            icon={<GitCompare className="w-3 h-3 text-brand-light" />}
          >
            Cross-Reference against PO & GRN
          </Button>
        </Link>
      </div>
    </div>
  );
}
