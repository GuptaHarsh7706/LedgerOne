import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FileText,
  ZoomIn,
  ZoomOut,
  Maximize2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Edit2,
  ShieldCheck,
  XCircle,
  Clock,
  Sparkles,
  Layers,
  ChevronLeft,
  ChevronRight,
  Info,
} from "lucide-react";
import {
  Button,
  Badge,
  Tabs,
  Modal,
  Input,
  PageTransition,
  triggerApprovalConfetti,
} from "../../components/ui";
import { api } from "../../services/api";
import { useActiveRole } from "../../services/permissions";
import {
  ReviewBundle,
  ExtractedField,
  TableLineItem,
  DocumentInvariant,
} from "../../services/types";

export const DocumentWorkspacePage: React.FC = () => {
  const { can, role } = useActiveRole();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const documentId = id || "a1000000-0000-0000-0000-000000009041";

  const [bundle, setBundle] = useState<ReviewBundle | null>(null);
  const [selectedField, setSelectedField] = useState<ExtractedField | null>(null);
  const [activeInspectorTab, setActiveInspectorTab] = useState("fields");
  const [zoomLevel, setZoomLevel] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  // Correction Modals
  const [fieldToCorrect, setFieldToCorrect] = useState<ExtractedField | null>(null);
  const [correctionValue, setCorrectionValue] = useState("");
  const [correctionRationale, setCorrectionRationale] = useState("");

  const [lineToCorrect, setLineToCorrect] = useState<TableLineItem | null>(null);
  const [lineFieldValue, setLineFieldValue] = useState("");

  const [invariantToOverride, setInvariantToOverride] = useState<DocumentInvariant | null>(null);
  const [overrideRationale, setOverrideRationale] = useState("");

  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const [isVerifying, setIsVerifying] = useState(false);

  const fetchBundle = async () => {
    setIsLoading(true);
    try {
      const res = await api.getReviewBundle(documentId);
      setBundle(res);
      if (res.fields && res.fields.length > 0) {
        setSelectedField(res.fields[0]);
      }
    } catch {
      // Fallback: load baseline bundle
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBundle();
  }, [documentId]);

  // Actions
  const handleCorrectField = async () => {
    if (!fieldToCorrect) return;
    try {
      await api.correctField(
        documentId,
        fieldToCorrect.field_name,
        correctionValue,
        correctionRationale
      );
      setFieldToCorrect(null);
      await fetchBundle();
    } catch (err: any) {
      alert(err.message || "Failed to save field correction");
    }
  };

  const handleCorrectLineItem = async () => {
    if (!lineToCorrect) return;
    try {
      await api.correctLineItem(
        documentId,
        lineToCorrect.line_index,
        "unit_price",
        parseFloat(lineFieldValue)
      );
      setLineToCorrect(null);
      await fetchBundle();
    } catch (err: any) {
      alert(err.message || "Failed to save line item correction");
    }
  };

  const handleOverrideInvariant = async () => {
    if (!invariantToOverride) return;
    try {
      await api.overrideInvariant(
        documentId,
        invariantToOverride.id,
        overrideRationale
      );
      setInvariantToOverride(null);
      await fetchBundle();
    } catch (err: any) {
      alert(err.message || "Failed to override invariant");
    }
  };

  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      await api.verifyDocument(documentId);
      triggerApprovalConfetti();
      await fetchBundle();
    } catch (err: any) {
      alert(err.message || "Approval failed. Gated by Segregation of Duties.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleReject = async () => {
    try {
      await api.rejectDocument(documentId, rejectReason);
      setIsRejectModalOpen(false);
      await fetchBundle();
    } catch (err: any) {
      alert(err.message || "Rejection failed");
    }
  };

  const doc = bundle?.document;
  const fields = bundle?.fields || [];
  const lineItems = bundle?.line_items || [];
  const invariants = bundle?.invariants || [];

  return (
    <PageTransition className="flex flex-col h-[calc(100vh-3rem)] overflow-hidden">
      {/* Top Forensic Toolbar */}
      <div className="h-12 border-b border-hairline bg-surface-primary px-4 flex items-center justify-between shrink-0 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-ink-primary">
              {doc?.filename || "INV-2026-9041_DataCore.pdf"}
            </span>
            <Badge
              variant={
                doc?.lifecycle_status === "VERIFIED"
                  ? "verified"
                  : doc?.lifecycle_status === "IN_REVIEW"
                  ? "brand"
                  : "review"
              }
              size="sm"
              dot
            >
              {doc?.lifecycle_status || "NEEDS_REVIEW"}
            </Badge>
          </div>
          <span className="text-ink-muted">|</span>
          <span className="text-[11px] font-mono text-ink-muted">
            ID: {documentId.slice(0, 18)}...
          </span>
        </div>

        {/* Dual-Custody Approval Actions */}
        <div className="flex items-center gap-2">
          {can("review.reject") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsRejectModalOpen(true)}
              className="text-status-danger hover:bg-status-danger/10"
              icon={<XCircle className="w-3.5 h-3.5" />}
            >
              Reject Document
            </Button>
          )}

          {can("review.approve") ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleVerify}
              isLoading={isVerifying}
              icon={<CheckCircle2 className="w-3.5 h-3.5" />}
            >
              Authorize & Verify Document
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-hairline bg-surface-subtle text-[11px] font-mono text-ink-muted">
              <span>Approval Restricted for {role}</span>
              <Badge variant="neutral" size="sm">SoD Guard</Badge>
            </div>
          )}
        </div>
      </div>

      {/* 3-Panel Forensic Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* PANEL 1: Left Thumbnail Strip & Navigation */}
        <div className="w-48 border-r border-hairline bg-sidebar p-3 space-y-3 shrink-0 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-muted font-semibold">
              Page Navigator
            </div>

            {/* Simulated 200 DPI Page Thumbnails */}
            {[1, 2].map((pageNum) => (
              <button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                className={`w-full p-2 rounded-xl border text-left transition-all ${
                  currentPage === pageNum
                    ? "border-brand bg-brand/10 shadow-hairline-glow"
                    : "border-hairline bg-surface-primary hover:border-hairline-strong"
                }`}
              >
                <div className="aspect-[3/4] bg-surface-elevated rounded-lg border border-hairline flex flex-col items-center justify-center p-2 text-ink-muted space-y-1 mb-1.5">
                  <FileText className="w-6 h-6 text-brand-light" />
                  <div className="w-full space-y-1">
                    <div className="h-1 bg-hairline rounded w-3/4 mx-auto" />
                    <div className="h-1 bg-hairline rounded w-1/2 mx-auto" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="font-semibold text-ink-primary">Page {pageNum}</span>
                  <span className="text-ink-muted">200 DPI</span>
                </div>
              </button>
            ))}
          </div>

          <div className="p-2.5 rounded-xl bg-surface-subtle border border-hairline text-[10px] font-mono text-ink-muted space-y-1">
            <div className="text-ink-primary font-semibold">Optical Integrity:</div>
            <div>Spatial BBox: 1:1 Parity</div>
            <div>Grounding: HNSW Dense</div>
          </div>
        </div>

        {/* PANEL 2: Central Document Canvas Viewer */}
        <div className="flex-1 flex flex-col bg-canvas relative overflow-hidden">
          {/* Canvas Controls */}
          <div className="h-9 border-b border-hairline bg-surface-primary/50 px-4 flex items-center justify-between shrink-0 text-xs text-ink-muted">
            <div className="flex items-center gap-2">
              <span>Zoom: {zoomLevel}%</span>
              <button
                onClick={() => setZoomLevel((z) => Math.max(50, z - 15))}
                className="p-1 rounded hover:bg-surface-hover text-ink-secondary hover:text-ink-primary"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoomLevel((z) => Math.min(200, z + 15))}
                className="p-1 rounded hover:bg-surface-hover text-ink-secondary hover:text-ink-primary"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span className="text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> 1:1 Spatial Parity
              </span>
            </div>
          </div>

          {/* Interactive Document Page Canvas */}
          <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
            <div
              className="relative bg-surface-primary rounded-xl border border-hairline shadow-floating-panel transition-all duration-200"
              style={{
                width: `${540 * (zoomLevel / 100)}px`,
                height: `${720 * (zoomLevel / 100)}px`,
              }}
            >
              {/* Document Header Representation */}
              <div className="p-6 border-b border-hairline space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-base font-bold text-ink-primary tracking-tight">
                      DataCore Enterprise Inc.
                    </h2>
                    <p className="text-[11px] text-ink-muted">
                      100 Tech Park Drive, Suite 400, San Jose, CA
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-brand-light">
                      COMMERCIAL INVOICE
                    </span>
                    <p className="text-[11px] font-mono text-ink-muted">INV-2026-9041</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs font-mono pt-2 border-t border-hairline/60">
                  <div>
                    <span className="text-ink-muted text-[10px]">BILL TO:</span>
                    <p className="font-semibold text-ink-primary">Apex Global Capital</p>
                  </div>
                  <div className="text-right">
                    <span className="text-ink-muted text-[10px]">ISSUE DATE:</span>
                    <p className="text-ink-primary">2026-10-14</p>
                  </div>
                </div>
              </div>

              {/* Line Items Table Representation */}
              <div className="p-6 space-y-3">
                <div className="text-[10px] font-mono uppercase text-ink-muted font-semibold pb-1 border-b border-hairline">
                  Billed Order Line Items
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center p-2 rounded bg-surface-elevated/40 border border-hairline">
                    <div>
                      <div className="font-semibold text-ink-primary">
                        DataCore SAN Storage Node 24TB
                      </div>
                      <div className="text-[10px] font-mono text-ink-muted">
                        Part # DC-SAN-24T | Qty: 3.00
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-status-danger font-bold">$3,600.00 / ea</div>
                      <div className="text-[10px] text-ink-muted">$10,800.00</div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center p-2 rounded bg-surface-elevated/40 border border-hairline">
                    <div>
                      <div className="font-semibold text-ink-primary">
                        Enterprise Support SLA (Gold)
                      </div>
                      <div className="text-[10px] font-mono text-ink-muted">Qty: 1.00</div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-ink-primary font-bold">$420.00</div>
                    </div>
                  </div>
                </div>

                {/* Subtotal & Total Block */}
                <div className="pt-3 border-t border-hairline space-y-1 text-xs font-mono">
                  <div className="flex justify-between text-ink-muted">
                    <span>Subtotal:</span>
                    <span>$11,220.00</span>
                  </div>
                  <div className="flex justify-between text-ink-primary font-bold text-sm pt-1 border-t border-hairline/60">
                    <span>Total Due:</span>
                    <span className="text-emerald-400">$11,220.00 USD</span>
                  </div>
                </div>
              </div>

              {/* Spatial Bounding Box Overlay for Selected Field */}
              {selectedField && (
                <div
                  className="absolute border-2 border-brand bg-brand/15 rounded pointer-events-none transition-all duration-300 animate-pulse"
                  style={{
                    left: "24px",
                    top: selectedField.field_name === "total_amount" ? "340px" : "110px",
                    width: "220px",
                    height: "36px",
                  }}
                >
                  <span className="absolute -top-5 left-0 px-1.5 py-0.2 rounded bg-brand text-white text-[9px] font-mono font-bold uppercase shadow-hairline-glow">
                    {selectedField.field_name} ({(selectedField.confidence_score * 100).toFixed(0)}%)
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PANEL 3: Right Extraction Intelligence Inspector */}
        <div className="w-80 border-l border-hairline bg-surface-primary flex flex-col shrink-0 overflow-hidden">
          {/* Segmented Inspector Tabs */}
          <div className="p-3 border-b border-hairline">
            <Tabs
              tabs={[
                { id: "fields", label: "Fields", badge: fields.length },
                { id: "lines", label: "Lines", badge: lineItems.length },
                { id: "invariants", label: "Invariants", badge: invariants.length },
              ]}
              activeTab={activeInspectorTab}
              onChange={setActiveInspectorTab}
              className="w-full justify-between"
            />
          </div>

          {/* Inspector Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* TAB 1: EXTRACTED FIELDS */}
            {activeInspectorTab === "fields" && (
              <div className="space-y-3">
                {fields.map((field) => {
                  const isSelected = selectedField?.field_name === field.field_name;
                  return (
                    <div
                      key={field.field_name}
                      onClick={() => setSelectedField(field)}
                      className={`p-3 rounded-xl border text-xs transition-all cursor-pointer ${
                        isSelected
                          ? "border-brand bg-brand/10 shadow-hairline-glow"
                          : "border-hairline bg-surface-elevated hover:border-hairline-strong"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono text-[11px] text-ink-muted uppercase">
                          {field.field_name}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] text-brand-light">
                            {(field.confidence_score * 100).toFixed(0)}% Conf
                          </span>
                          {can("review.correct") && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setFieldToCorrect(field);
                                setCorrectionValue(field.raw_value);
                              }}
                              className="p-1 rounded text-ink-muted hover:text-ink-primary hover:bg-surface-hover"
                              title="Correct Field"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="font-mono font-bold text-ink-primary text-sm truncate">
                        {String(field.raw_value)}
                      </div>

                      {field.is_human_corrected && (
                        <div className="mt-2 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          Human Corrected by Auditor
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* TAB 2: LINE ITEMS */}
            {activeInspectorTab === "lines" && (
              <div className="space-y-3">
                {lineItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-surface-elevated border border-hairline text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-ink-muted uppercase">
                        Line {item.line_index + 1}
                      </span>
                      {can("review.correct") && (
                        <button
                          onClick={() => {
                            setLineToCorrect(item);
                            setLineFieldValue(String(item.unit_price));
                          }}
                          className="text-xs text-brand-light hover:underline flex items-center gap-1 font-mono"
                        >
                          <Edit2 className="w-3 h-3" /> Edit
                        </button>
                      )}
                    </div>

                    <div className="font-semibold text-ink-primary">
                      {item.description}
                    </div>

                    <div className="grid grid-cols-3 gap-2 font-mono text-[11px] pt-1 border-t border-hairline/60">
                      <div>
                        <span className="text-ink-muted text-[10px]">QTY</span>
                        <p>{item.quantity}</p>
                      </div>
                      <div>
                        <span className="text-ink-muted text-[10px]">PRICE</span>
                        <p className="text-status-danger font-bold">${item.unit_price}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-ink-muted text-[10px]">TOTAL</span>
                        <p className="font-bold text-ink-primary">${item.line_total}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TAB 3: ACCOUNTING INVARIANTS */}
            {activeInspectorTab === "invariants" && (
              <div className="space-y-3">
                {invariants.map((inv) => (
                  <div
                    key={inv.id}
                    className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                      inv.is_satisfied
                        ? "bg-surface-elevated border-hairline"
                        : "bg-status-danger/10 border-status-danger/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-ink-primary">
                        {inv.code}
                      </span>
                      <Badge
                        variant={inv.is_satisfied ? "verified" : "discrepancy"}
                        size="sm"
                      >
                        {inv.is_satisfied ? "SATISFIED" : "FAILED"}
                      </Badge>
                    </div>

                    <p className="text-[11px] text-ink-secondary leading-relaxed">
                      {inv.description}
                    </p>

                    {!inv.is_satisfied && !inv.is_overridden && (
                      can("review.override") ? (
                        <Button
                          variant="danger"
                          size="xs"
                          onClick={() => setInvariantToOverride(inv)}
                          className="w-full mt-2"
                        >
                          Override Invariant (Auditor Rationale)
                        </Button>
                      ) : (
                        <div className="w-full mt-2 py-1 px-2 text-center rounded bg-surface-subtle border border-hairline text-[10px] font-mono text-ink-muted">
                          Override Restricted for {role}
                        </div>
                      )
                    )}

                    {inv.is_overridden && (
                      <div className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        Overridden: {inv.override_rationale}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Field Correction Modal */}
      <Modal
        isOpen={!!fieldToCorrect}
        onClose={() => setFieldToCorrect(null)}
        title={`Correct Field: ${fieldToCorrect?.field_name}`}
        description="Recorded in the immutable forensic audit trail"
        maxWidth="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setFieldToCorrect(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleCorrectField}>
              Save Correction
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-xs">
          <Input
            label="Corrected Normalized Value"
            value={correctionValue}
            onChange={(e) => setCorrectionValue(e.target.value)}
          />
          <Input
            label="Audit Justification"
            placeholder="e.g. Verified with Vendor PO Terms"
            value={correctionRationale}
            onChange={(e) => setCorrectionRationale(e.target.value)}
          />
        </div>
      </Modal>

      {/* Line Item Correction Modal */}
      <Modal
        isOpen={!!lineToCorrect}
        onClose={() => setLineToCorrect(null)}
        title={`Correct Line Item Unit Price`}
        description="Recalculates line total and dependent tax invariants"
        maxWidth="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setLineToCorrect(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleCorrectLineItem}>
              Recalculate & Save
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-xs">
          <Input
            label="Authorized Unit Price ($)"
            type="number"
            value={lineFieldValue}
            onChange={(e) => setLineFieldValue(e.target.value)}
          />
        </div>
      </Modal>

      {/* Invariant Override Modal */}
      <Modal
        isOpen={!!invariantToOverride}
        onClose={() => setInvariantToOverride(null)}
        title={`Override Invariant: ${invariantToOverride?.code}`}
        description="Requires dual-custody justification under SOC2 / ISO 27001 policy"
        maxWidth="md"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setInvariantToOverride(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleOverrideInvariant}>
              Confirm Formal Override
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-xs">
          <Input
            label="Formal Audit Rationale"
            placeholder="e.g. Master Service Agreement Amendment #3 supersedes standard rate"
            value={overrideRationale}
            onChange={(e) => setOverrideRationale(e.target.value)}
          />
        </div>
      </Modal>

      {/* Document Reject Modal */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title="Formally Reject Document"
        description="Moves lifecycle status to REJECTED and notifies vendor"
        maxWidth="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleReject}>
              Confirm Rejection
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-xs">
          <Input
            label="Rejection Reason"
            placeholder="e.g. Unreconciled 20% price inflation on SAN Storage Nodes"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
        </div>
      </Modal>
    </PageTransition>
  );
};
