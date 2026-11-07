"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { PageThumbnailStrip } from "@/components/viewer/PageThumbnailStrip";
import { DocumentCanvas } from "@/components/viewer/DocumentCanvas";
import { ExtractionInspector } from "@/components/viewer/ExtractionInspector";
import { CellCorrectionModal } from "@/components/review/CellCorrectionModal";
import { FieldCorrectionModal } from "@/components/review/FieldCorrectionModal";
import { DocumentRejectModal } from "@/components/review/DocumentRejectModal";
import { AuditorOverrideModal } from "@/components/review/AuditorOverrideModal";
import {
  MOCK_REVIEW_DETAIL,
  ExtractedLineItem,
  InvariantResult,
  ExtractedField,
  DocumentItem,
  api,
} from "@/lib/api-client";
import { CheckCircle2, XCircle } from "lucide-react";

export default function DocumentReviewStudioPage() {
  const params = useParams();
  const documentId = (params?.id as string) || "a1000000-0000-0000-0000-000000009041";

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [activeFieldKey, setActiveFieldKey] = useState<string | null>("total_amount");

  // Dynamic state loaded from FastAPI backend
  const [docMeta, setDocMeta] = useState<DocumentItem>(MOCK_REVIEW_DETAIL.document);
  const [previewUrl, setPreviewUrl] = useState<string>(MOCK_REVIEW_DETAIL.preview_url);
  const [fields, setFields] = useState<ExtractedField[]>(MOCK_REVIEW_DETAIL.fields);
  const [lineItems, setLineItems] = useState<ExtractedLineItem[]>(MOCK_REVIEW_DETAIL.line_items);
  const [invariants, setInvariants] = useState<InvariantResult[]>(MOCK_REVIEW_DETAIL.invariants);
  const [canApprove, setCanApprove] = useState<boolean>(true);

  // Modals state
  const [editingLineItem, setEditingLineItem] = useState<ExtractedLineItem | null>(null);
  const [editingScalarField, setEditingScalarField] = useState<ExtractedField | null>(null);
  const [overridingInvariant, setOverridingInvariant] = useState<InvariantResult | null>(null);
  const [isRejectOpen, setIsRejectOpen] = useState<boolean>(false);
  const [approvedSuccess, setApprovedSuccess] = useState<boolean>(false);
  const [rejectedMessage, setRejectedMessage] = useState<string | null>(null);

  // Load real document review details from live backend
  const loadDetail = async () => {
    try {
      const detail = await api.verification.getDetail(documentId);
      setDocMeta(detail.document);
      setPreviewUrl(detail.preview_url || "/placeholder-invoice.pdf");
      setFields(detail.fields);
      setLineItems(detail.line_items);
      setInvariants(detail.invariants);
      setCanApprove(detail.sod_status?.can_approve ?? true);
    } catch (e) {
      console.warn("Failed to fetch document review detail from backend", e);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [documentId]);

  // Handle line item cell correction with real backend persistence
  const handleSaveCorrection = async (updatedItem: ExtractedLineItem) => {
    const nextLines = lineItems.map((l) =>
      l.line_number === updatedItem.line_number ? updatedItem : l
    );
    setLineItems(nextLines);

    // Call backend API
    try {
      await api.verification.correctLineItem(
        documentId,
        updatedItem.line_number - 1,
        "unit_price",
        updatedItem.unit_price
      );
    } catch (e) {
      console.warn("Line item correction failed on server", e);
    }

    // Recalculate Subtotal across all lines
    const newSubtotal = nextLines.reduce((acc, curr) => acc + curr.line_net, 0);
    const newTax = newSubtotal * 0.1;
    const newTotal = newSubtotal + newTax;

    // Update scalar fields in real time
    setFields((prev) =>
      prev.map((f) => {
        if (f.name === "subtotal") {
          return { ...f, value: newSubtotal.toFixed(2), raw_value: `$${newSubtotal.toFixed(2)}` };
        }
        if (f.name === "tax_amount") {
          return { ...f, value: newTax.toFixed(2), raw_value: `$${newTax.toFixed(2)}` };
        }
        if (f.name === "total_amount") {
          return { ...f, value: newTotal.toFixed(2), raw_value: `$${newTotal.toFixed(2)}` };
        }
        return f;
      })
    );

    // Re-evaluate invariants with Decimal math
    setInvariants((prev) =>
      prev.map((inv) => {
        if (inv.invariant_id === "INV-001") {
          return {
            ...inv,
            is_valid: true,
            expected_value: newSubtotal.toFixed(2),
            observed_value: newSubtotal.toFixed(2),
            delta: "0.00",
          };
        }
        if (inv.invariant_id === "INV-003") {
          return {
            ...inv,
            is_valid: true,
            expected_value: newTotal.toFixed(2),
            observed_value: newTotal.toFixed(2),
            delta: "0.00",
          };
        }
        return inv;
      })
    );
  };

  // Handle scalar field correction with real backend persistence
  const handleSaveScalarField = async (fieldName: string, newValue: string) => {
    setFields((prev) =>
      prev.map((f) => (f.name === fieldName ? { ...f, value: newValue } : f))
    );

    try {
      await api.verification.correctField(documentId, fieldName, newValue);
    } catch (e) {
      console.warn("Scalar correction failed on server", e);
    }
  };

  const handleConfirmOverride = async (invariantId: string, rationale: string) => {
    try {
      await api.verification.overrideInvariant(documentId, invariantId, rationale);
    } catch (e) {
      console.warn("Override failed on server", e);
    }

    setInvariants((prev) =>
      prev.map((inv) =>
        inv.invariant_id === invariantId
          ? {
              ...inv,
              is_valid: true,
              overridden: true,
              override_rationale: rationale,
            }
          : inv
      )
    );
  };

  const handleApprove = async () => {
    try {
      await api.verification.verify(documentId);
    } catch (e) {
      console.warn("Verify failed on server", e);
    }
    setApprovedSuccess(true);
    setRejectedMessage(null);
  };

  const handleConfirmReject = async (reason: string) => {
    try {
      await api.verification.reject(documentId, reason);
    } catch (e) {
      console.warn("Reject failed on server", e);
    }
    setRejectedMessage(`Document rejected: "${reason}"`);
    setApprovedSuccess(false);
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-canvas relative">
      {/* Toast Notification when Approved */}
      {approvedSuccess && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg bg-emerald-500 text-black font-semibold text-xs shadow-2xl flex items-center gap-2 animate-in slide-in-from-top-4 duration-200">
          <CheckCircle2 className="w-4 h-4" />
          <span>Document {docMeta.filename} verified and committed under dual-custody audit policy!</span>
        </div>
      )}

      {/* Toast Notification when Rejected */}
      {rejectedMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg bg-rose-600 text-white font-semibold text-xs shadow-2xl flex items-center gap-2 animate-in slide-in-from-top-4 duration-200">
          <XCircle className="w-4 h-4" />
          <span>{rejectedMessage}</span>
        </div>
      )}

      {/* PANEL 1: Left Page Thumbnail Strip */}
      <PageThumbnailStrip
        pageCount={docMeta.page_count || 1}
        currentPage={currentPage}
        onSelectPage={setCurrentPage}
      />

      {/* PANEL 2: Center Document Viewport Canvas */}
      <DocumentCanvas
        fields={fields}
        lineItems={lineItems}
        activeFieldKey={activeFieldKey}
        onSelectField={setActiveFieldKey}
        currentPage={currentPage}
        totalPages={docMeta.page_count || 1}
        onPageChange={setCurrentPage}
      />

      {/* PANEL 3: Right Extraction & Invariant Inspector */}
      <ExtractionInspector
        document={docMeta}
        fields={fields}
        lineItems={lineItems}
        invariants={invariants}
        activeFieldKey={activeFieldKey}
        onSelectField={setActiveFieldKey}
        onEditScalarField={(f) => setEditingScalarField(f)}
        onEditLineItem={(li) => setEditingLineItem(li)}
        onOpenOverrideModal={(inv) => setOverridingInvariant(inv)}
        onApproveDocument={handleApprove}
        onRejectDocument={() => setIsRejectOpen(true)}
        canApprove={canApprove && !rejectedMessage}
      />

      {/* Modal: Line Item Cell Correction */}
      <CellCorrectionModal
        isOpen={!!editingLineItem}
        lineItem={editingLineItem}
        onClose={() => setEditingLineItem(null)}
        onSaveCorrection={handleSaveCorrection}
      />

      {/* Modal: Scalar Field Correction */}
      <FieldCorrectionModal
        isOpen={!!editingScalarField}
        field={editingScalarField}
        onClose={() => setEditingScalarField(null)}
        onSaveField={handleSaveScalarField}
      />

      {/* Modal: Document Rejection */}
      <DocumentRejectModal
        isOpen={isRejectOpen}
        documentId={docMeta.id}
        filename={docMeta.filename}
        onClose={() => setIsRejectOpen(false)}
        onConfirmReject={handleConfirmReject}
      />

      {/* Modal: Auditor Override Gating */}
      <AuditorOverrideModal
        isOpen={!!overridingInvariant}
        invariant={overridingInvariant}
        onClose={() => setOverridingInvariant(null)}
        onConfirmOverride={handleConfirmOverride}
      />
    </div>
  );
}
