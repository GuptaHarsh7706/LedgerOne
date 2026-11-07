import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { Document, LineItem } from '../../types';
import { useActiveRole, hasPermission } from '../../services/permissions';
import { GlowCard } from '../../components/ui/GlowCard';
import { Button } from '../../components/ui/Button';
import { 
  FileText, 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowLeft, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  ShieldCheck,
  Check,
  X,
  Layers,
  Eye,
  FileCode,
  Tag
} from 'lucide-react';

export const DocumentStudio: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentRole } = useActiveRole();

  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeDoc, setActiveDoc] = useState<Document | null>(null);
  const [selectedItem, setSelectedItem] = useState<LineItem | null>(null);
  const [hoveredBox, setHoveredBox] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'visual' | 'json'>('visual');

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const docs = await api.getDocuments();
        setDocuments(docs);
        if (id) {
          const found = docs.find(d => d.id === id) || docs[0];
          setActiveDoc(found);
          if (found && found.lineItems.length > 0) {
            setSelectedItem(found.lineItems[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load documents:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  const canApprove = hasPermission(currentRole, 'APPROVE_INVARIANTS');
  const canUpload = hasPermission(currentRole, 'UPLOAD_DOCUMENTS');

  const filteredDocs = filter === 'ALL' 
    ? documents 
    : documents.filter(d => d.status === filter);

  // If no document is selected, render the Document Directory & Ingestion Table
  if (!id || !activeDoc) {
    return (
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono text-ops-cyan">[ 02 / 07 ]</span>
              <span className="text-xs font-mono text-white/40">• DOCUMENT INTELLIGENCE REPOSITORY</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Ingestion & Spatial Extraction Directory
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              size="sm"
              disabled={!canUpload}
              icon={<Upload className="w-4 h-4" />}
              onClick={() => alert('Drag-and-Drop Ingestion Hotzone: Ready for PDF/TIFF/EDI batch upload.')}
            >
              Upload Document Batch
            </Button>
          </div>
        </div>

        {/* Upload Hotzone */}
        {canUpload && (
          <div className="p-8 border-2 border-dashed border-white/10 hover:border-ops-cyan/40 rounded-2xl bg-[#0D0E18] text-center transition-all cursor-pointer group">
            <div className="w-12 h-12 rounded-xl bg-ops-cyan/10 border border-ops-cyan/30 flex items-center justify-center text-ops-cyan mx-auto mb-3 group-hover:scale-110 transition-transform">
              <Upload className="w-6 h-6" />
            </div>
            <div className="text-sm font-semibold text-white mb-1">
              Drop enterprise invoices, purchase orders, or shipping receipts
            </div>
            <div className="text-xs font-mono text-white/40">
              PDF, TIFF, PNG up to 50MB • Automated deskew, OCR & arithmetic invariant checking
            </div>
          </div>
        )}

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-white/[0.08]">
          <div className="flex flex-wrap gap-2">
            {['ALL', 'VALIDATED', 'INVARIANT_VIOLATION', 'PENDING_REVIEW'].map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all border ${
                  filter === status
                    ? 'bg-white text-black font-semibold border-white'
                    : 'bg-[#141524] text-white/60 border-white/[0.06] hover:text-white'
                }`}
              >
                {status.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="text-xs font-mono text-white/40">
            SHOWING {filteredDocs.length} DOCUMENTS
          </div>
        </div>

        {/* Documents Table */}
        <div className="rounded-xl border border-white/[0.08] bg-[#0E0F1A] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#141524] text-white/40 border-b border-white/[0.06] uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Invoice / ID</th>
                  <th className="py-3.5 px-4">Vendor</th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Total Amount</th>
                  <th className="py-3.5 px-4">Confidence</th>
                  <th className="py-3.5 px-4">Invariant Status</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filteredDocs.map((doc) => {
                  const isViolation = doc.status === 'INVARIANT_VIOLATION';
                  const isValidated = doc.status === 'VALIDATED';
                  return (
                    <tr
                      key={doc.id}
                      onClick={() => navigate(`/workspace/documents/${doc.id}`)}
                      className="hover:bg-white/[0.02] cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 px-4 font-semibold text-white">
                        #{doc.invoiceNumber}
                      </td>
                      <td className="py-3.5 px-4 text-white/80">{doc.vendorName}</td>
                      <td className="py-3.5 px-4 text-white/50">
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-white">
                        ${doc.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-ops-cyan">
                        {(doc.confidenceScore * 100).toFixed(0)}%
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${
                          isViolation
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                            : isValidated
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-ops-blue/10 border-ops-blue/30 text-ops-blue'
                        }`}>
                          {doc.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span className="text-ops-cyan hover:underline">Inspect Spatial →</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // 3-Panel Workstation for Selected Document
  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/workspace/documents')}
            className="p-2 rounded-lg bg-[#141524] border border-white/[0.08] hover:border-white/20 text-white/60 hover:text-white transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-ops-cyan">DOCUMENT_STUDIO</span>
              <span className="text-xs font-mono text-white/30">•</span>
              <span className="text-xs font-mono text-white/50">#{activeDoc.invoiceNumber}</span>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              {activeDoc.vendorName}
            </h1>
          </div>
        </div>

        {/* Dual-Custody Approval Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[#141524] border border-white/[0.08] text-xs font-mono mr-2">
            <button
              onClick={() => setActiveTab('visual')}
              className={`px-3 py-1 rounded ${activeTab === 'visual' ? 'bg-white text-black font-semibold' : 'text-white/60'}`}
            >
              Visual Grounding
            </button>
            <button
              onClick={() => setActiveTab('json')}
              className={`px-3 py-1 rounded ${activeTab === 'json' ? 'bg-white text-black font-semibold' : 'text-white/60'}`}
            >
              Raw AST
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={!canApprove}
            icon={<X className="w-4 h-4 text-rose-400" />}
            onClick={() => alert(`Document #${activeDoc.invoiceNumber} rejected by ${currentRole}.`)}
          >
            Reject Invariant
          </Button>

          <Button
            variant="primary"
            size="sm"
            disabled={!canApprove}
            icon={<Check className="w-4 h-4" />}
            onClick={() => alert(`Dual-custody verification signed by ${currentRole}. Journal posted.`)}
          >
            Sign & Release
          </Button>
        </div>
      </div>

      {/* 3-Column Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Metadata & Invariant Equation Evaluator (3 Cols) */}
        <div className="lg:col-span-3 space-y-4">
          <GlowCard className="p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <span className="text-xs font-mono text-white/40">[ METADATA ]</span>
              <span className="text-xs font-mono text-ops-cyan">
                CONF: {(activeDoc.confidenceScore * 100).toFixed(0)}%
              </span>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-white/40">Date:</span>
                <span className="text-white">{new Date(activeDoc.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Currency:</span>
                <span className="text-white">{activeDoc.currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Status:</span>
                <span className="text-ops-cyan">{activeDoc.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Pages:</span>
                <span className="text-white">1 of 1</span>
              </div>
            </div>
          </GlowCard>

          {/* Invariant Equation Validator Box */}
          <GlowCard className="p-4 space-y-3" glowColor="rgba(0, 255, 204, 0.2)">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
              <span className="text-xs font-mono text-white/40">[ INVARIANT_MATH ]</span>
              <ShieldCheck className="w-4 h-4 text-ops-cyan" />
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="p-2 rounded bg-[#0A0B14] border border-white/[0.05]">
                <div className="flex justify-between text-white/60">
                  <span>Subtotal:</span>
                  <span>${activeDoc.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-white/60">
                  <span>Sales Tax:</span>
                  <span>${activeDoc.tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-white/[0.04] text-ops-cyan font-bold">
                  <span>Evaluated Total:</span>
                  <span>${activeDoc.total.toFixed(2)}</span>
                </div>
              </div>

              <div className="text-[11px] text-white/50 leading-relaxed font-sans">
                {activeDoc.status === 'INVARIANT_VIOLATION' ? (
                  <span className="text-amber-400 font-mono block">
                    ⚠️ Math Invariant Warning: Calculated sum does not match document header total within 0.01 tolerance.
                  </span>
                ) : (
                  <span className="text-emerald-400 font-mono block">
                    ✓ Invariant Passed: Dual-entry equation satisfies arithmetic parity.
                  </span>
                )}
              </div>
            </div>
          </GlowCard>
        </div>

        {/* Center Column: Interactive Spatial Bounding-Box Viewer (5 Cols) */}
        <div className="lg:col-span-5">
          <GlowCard className="p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-ops-cyan" />
                <span className="text-xs font-mono text-white/70">SPATIAL BOUNDING-BOX CANVAS</span>
              </div>
              <div className="flex items-center gap-1">
                <button className="p-1.5 rounded hover:bg-white/10 text-white/60"><ZoomIn className="w-3.5 h-3.5" /></button>
                <button className="p-1.5 rounded hover:bg-white/10 text-white/60"><ZoomOut className="w-3.5 h-3.5" /></button>
              </div>
            </div>

            {/* Document Surface Canvas */}
            <div className="relative aspect-[3/4] w-full rounded-xl bg-[#090A12] border border-white/[0.1] p-6 shadow-inner overflow-hidden font-mono select-none">
              {/* Document Header Mock */}
              <div className="border-b border-white/10 pb-4 mb-6 flex justify-between items-start">
                <div>
                  <div className="text-xs font-bold text-white/80">{activeDoc.vendorName}</div>
                  <div className="text-[10px] text-white/40">100 Corporate Parkway, Suite 400</div>
                  <div className="text-[10px] text-white/40">tax-id: US-8829104-B</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-white/80">COMMERCIAL INVOICE</div>
                  <div className="text-[10px] text-white/40">INV: #{activeDoc.invoiceNumber}</div>
                  <div className="text-[10px] text-white/40">{new Date(activeDoc.createdAt).toLocaleDateString()}</div>
                </div>
              </div>

              {/* Document Simulated Lines */}
              <div className="space-y-4 mb-8">
                <div className="text-[10px] text-white/40 uppercase border-b border-white/10 pb-1 flex justify-between">
                  <span>Description</span>
                  <span>Total</span>
                </div>

                {activeDoc.lineItems.map((item, idx) => {
                  const isSelected = selectedItem?.id === item.id;
                  const isHovered = hoveredBox === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      onMouseEnter={() => setHoveredBox(item.id)}
                      onMouseLeave={() => setHoveredBox(null)}
                      className={`p-2 rounded text-xs flex justify-between items-center transition-all cursor-pointer relative border ${
                        isSelected
                          ? 'bg-ops-cyan/10 border-ops-cyan text-white shadow-[0_0_15px_rgba(0,255,204,0.2)]'
                          : isHovered
                          ? 'bg-ops-blue/10 border-ops-blue/50 text-white'
                          : 'bg-transparent border-transparent text-white/70 hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="truncate pr-2">
                        <span>{item.description}</span>
                        <span className="text-[10px] text-white/40 block">
                          {item.quantity} units @ ${item.unitPrice.toFixed(2)}
                        </span>
                      </div>
                      <div className="font-bold shrink-0">
                        ${item.total.toFixed(2)}
                      </div>

                      {/* Bounding Box Visual Tag */}
                      {(isSelected || isHovered) && (
                        <span className="absolute -top-2.5 right-2 px-1.5 py-0.5 rounded bg-ops-cyan text-black text-[8px] font-bold tracking-tight">
                          bbox: [{(item.bbox[0]).toFixed(2)}, {(item.bbox[1]).toFixed(2)}]
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Bottom Invariant Calculation Surface */}
              <div className="absolute bottom-6 right-6 w-48 p-3 rounded bg-[#10111D] border border-white/10 space-y-1 text-[11px]">
                <div className="flex justify-between text-white/50">
                  <span>Subtotal:</span>
                  <span>${activeDoc.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-white/50">
                  <span>Tax (8.25%):</span>
                  <span>${activeDoc.tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-white/10 font-bold text-white">
                  <span>Total Due:</span>
                  <span className="text-ops-cyan">${activeDoc.total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </GlowCard>
        </div>

        {/* Right Column: Line Items & AST Inspector (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">
          <GlowCard className="p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <span className="text-xs font-mono text-white/40">[ EXTRACTED_TOKENS ]</span>
              <span className="text-xs font-mono text-white/60">
                {activeDoc.lineItems.length} Records
              </span>
            </div>

            {activeTab === 'visual' ? (
              <div className="space-y-3">
                {activeDoc.lineItems.map((item) => {
                  const isSelected = selectedItem?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className={`p-3 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#181928] border-ops-cyan text-white shadow-[0_0_15px_rgba(0,255,204,0.1)]'
                          : 'bg-[#11121E] border-white/[0.06] text-white/70 hover:border-white/20'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-semibold text-white">{item.description}</span>
                        <span className="font-bold text-ops-cyan">${item.total.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-white/40">
                        <span>QTY: {item.quantity} × ${item.unitPrice.toFixed(2)}</span>
                        <span>CONF: {(item.confidence * 100).toFixed(0)}%</span>
                      </div>
                      <div className="mt-2 text-[9px] text-white/30 truncate">
                        bbox: [{item.bbox.join(', ')}]
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <pre className="p-3 rounded-lg bg-[#0A0B14] border border-white/[0.06] text-[10px] font-mono text-white/70 overflow-x-auto max-h-96">
                <code>{JSON.stringify(activeDoc, null, 2)}</code>
              </pre>
            )}
          </GlowCard>
        </div>
      </div>
    </div>
  );
};
