import React, { useState } from 'react';
import { SectionBadge } from '../../../components/ui/SectionBadge';
import { CategoryPill } from '../../../components/ui/CategoryPill';
import { GlowCard } from '../../../components/ui/GlowCard';
import { Eye, Layers, ShieldCheck, CheckCircle2, ZoomIn, FileText } from 'lucide-react';

export const SpatialExtractionSection: React.FC = () => {
  const [activeToken, setActiveToken] = useState<string>('subtotal');

  const tokens = {
    invoiceNum: { label: 'Invoice Number', val: 'INV-2024-8841', bbox: '[0.42, 0.08, 0.58, 0.12]', conf: '99.9%' },
    vendor: { label: 'Vendor Entity', val: 'Global Logistics Corp', bbox: '[0.08, 0.08, 0.35, 0.14]', conf: '99.7%' },
    subtotal: { label: 'Extracted Subtotal', val: '$34,850.00', bbox: '[0.44, 0.62, 0.56, 0.66]', conf: '99.8%' },
    tax: { label: 'Calculated Tax', val: '$2,875.12', bbox: '[0.44, 0.67, 0.56, 0.71]', conf: '99.4%' },
    total: { label: 'Document Total', val: '$37,725.12', bbox: '[0.44, 0.73, 0.58, 0.78]', conf: '99.9%' },
  };

  const current = tokens[activeToken as keyof typeof tokens] || tokens.subtotal;

  return (
    <section id="spatial-grounding" className="relative py-28 px-4 sm:px-6 lg:px-8 border-t border-white/[0.05] overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-0 -translate-y-1/2 w-96 h-96 bg-ops-cyan/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
          <div>
            <SectionBadge number="01" total="05" label="SPATIAL EXTRACTION" className="mb-4" />
            <CategoryPill label="MULTI-MODAL OCR & GEOMETRY" className="mb-4" />
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white max-w-2xl leading-[1.15]">
              Eliminate Hallucinations with <span className="text-ops-gradient">Pixel-Grounded Geometry</span>
            </h2>
          </div>
          <p className="text-white/60 text-base sm:text-lg max-w-md font-sans leading-relaxed">
            LLMs often invent or transpose numbers when parsing complex multi-page financial records. LedgerOne maps every numerical token to normalized 2D coordinate bounding boxes with optical confidence metrics.
          </p>
        </div>

        {/* Interactive Spatial Canvas Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left: Interactive Simulated Document Surface */}
          <div className="lg:col-span-7">
            <GlowCard className="p-6 sm:p-8 relative overflow-hidden bg-[#0B0C15] border-white/15">
              <div className="flex items-center justify-between pb-4 mb-6 border-b border-white/[0.08]">
                <div className="flex items-center gap-2 text-xs font-mono text-white/70">
                  <FileText className="w-4 h-4 text-ops-cyan" />
                  <span>COMMERCIAL_INVOICE_PAGE_01.PDF</span>
                </div>
                <span className="text-[10px] font-mono text-ops-cyan px-2.5 py-0.5 rounded bg-ops-cyan/10 border border-ops-cyan/30">
                  300 DPI RASTER
                </span>
              </div>

              {/* Document Surface */}
              <div className="relative aspect-[4/3] rounded-xl bg-[#080910] border border-white/10 p-6 font-mono text-xs text-white/70 flex flex-col justify-between select-none">
                {/* Header Row */}
                <div className="flex justify-between items-start border-b border-white/[0.06] pb-4">
                  <div>
                    <div 
                      onClick={() => setActiveToken('vendor')}
                      className={`p-1.5 rounded cursor-pointer transition-all border ${
                        activeToken === 'vendor' ? 'bg-ops-cyan/20 border-ops-cyan text-white' : 'hover:bg-white/[0.03] border-transparent'
                      }`}
                    >
                      <div className="font-bold text-white text-sm">Global Logistics Corp</div>
                      <div className="text-[10px] text-white/40">100 Waterfront Pier, Suite 800</div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div 
                      onClick={() => setActiveToken('invoiceNum')}
                      className={`p-1.5 rounded cursor-pointer transition-all border ${
                        activeToken === 'invoiceNum' ? 'bg-ops-cyan/20 border-ops-cyan text-white' : 'hover:bg-white/[0.03] border-transparent'
                      }`}
                    >
                      <div className="font-bold text-white">INVOICE #{tokens.invoiceNum.val}</div>
                      <div className="text-[10px] text-white/40">DATE: 2024-10-24</div>
                    </div>
                  </div>
                </div>

                {/* Simulated Table Lines */}
                <div className="space-y-2 py-4">
                  <div className="text-[10px] text-white/30 uppercase flex justify-between border-b border-white/[0.04] pb-1">
                    <span>Description</span>
                    <span>Quantity</span>
                    <span>Total</span>
                  </div>

                  <div className="flex justify-between py-1 text-white/70">
                    <span>Ocean Container Shipping (40ft HQ)</span>
                    <span>2</span>
                    <span className="font-bold text-white">$25,000.00</span>
                  </div>

                  <div className="flex justify-between py-1 text-white/70">
                    <span>Customs Drayage & Terminal Handling</span>
                    <span>1</span>
                    <span className="font-bold text-white">$9,850.00</span>
                  </div>
                </div>

                {/* Math Footer with Clickable Bounding Boxes */}
                <div className="border-t border-white/[0.06] pt-4 flex flex-col items-end gap-1.5 text-xs">
                  <div 
                    onClick={() => setActiveToken('subtotal')}
                    className={`flex items-center gap-6 px-2.5 py-1 rounded cursor-pointer transition-all border ${
                      activeToken === 'subtotal' ? 'bg-ops-cyan/20 border-ops-cyan text-white' : 'hover:bg-white/[0.03] border-transparent'
                    }`}
                  >
                    <span className="text-white/40">Subtotal:</span>
                    <span className="font-bold text-white">${tokens.subtotal.val}</span>
                  </div>

                  <div 
                    onClick={() => setActiveToken('tax')}
                    className={`flex items-center gap-6 px-2.5 py-1 rounded cursor-pointer transition-all border ${
                      activeToken === 'tax' ? 'bg-ops-cyan/20 border-ops-cyan text-white' : 'hover:bg-white/[0.03] border-transparent'
                    }`}
                  >
                    <span className="text-white/40">Sales Tax (8.25%):</span>
                    <span className="font-bold text-white">${tokens.tax.val}</span>
                  </div>

                  <div 
                    onClick={() => setActiveToken('total')}
                    className={`flex items-center gap-6 px-2.5 py-1.5 rounded cursor-pointer transition-all border ${
                      activeToken === 'total' ? 'bg-ops-cyan/20 border-ops-cyan text-white shadow-[0_0_15px_rgba(0,255,204,0.3)]' : 'hover:bg-white/[0.03] border-transparent'
                    }`}
                  >
                    <span className="text-ops-cyan font-bold">Total Due:</span>
                    <span className="font-black text-ops-cyan text-sm">${tokens.total.val}</span>
                  </div>
                </div>
              </div>
            </GlowCard>
          </div>

          {/* Right: Live Spatial Token Telemetry */}
          <div className="lg:col-span-5 space-y-6">
            <div className="p-6 rounded-2xl bg-[#121320] border border-white/[0.08] space-y-4">
              <div className="flex items-center justify-between text-xs font-mono text-white/40">
                <span>[ SPATIAL_TELEMETRY ]</span>
                <span className="text-ops-cyan font-bold">{current.conf} CONFIDENCE</span>
              </div>

              <h3 className="text-xl font-bold text-white">
                {current.label}
              </h3>

              <div className="p-4 rounded-xl bg-[#090A12] border border-white/[0.06] space-y-2 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-white/40">Normalized Value:</span>
                  <span className="text-white font-bold">{current.val}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Normalized BBox:</span>
                  <span className="text-ops-cyan">{current.bbox}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Geometry Verification:</span>
                  <span className="text-emerald-400 font-semibold">VALIDATED</span>
                </div>
              </div>

              <p className="text-xs text-white/60 leading-relaxed font-sans">
                When auditors or reviewers inspect a transaction, clicking any token instantly navigates to its physical coordinate location on the PDF.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-4 rounded-xl bg-[#121320] border border-white/[0.06]">
                <div className="text-ops-cyan font-bold text-lg mb-1">0.00%</div>
                <div className="text-white/50 text-[11px]">Hallucination Rate</div>
              </div>
              <div className="p-4 rounded-xl bg-[#121320] border border-white/[0.06]">
                <div className="text-ops-blue font-bold text-lg mb-1">300 DPI</div>
                <div className="text-white/50 text-[11px]">Lossless Parsing</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
