import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HeroInteractiveCanvas } from '../../../components/3d/HeroInteractiveCanvas';
import { SectionBadge } from '../../../components/ui/SectionBadge';
import { Button } from '../../../components/ui/Button';
import { GlowCard } from '../../../components/ui/GlowCard';
import { Marquee } from '../../../components/ui/Marquee';
import { 
  FileText, 
  CheckCircle2, 
  ShieldAlert, 
  Cpu, 
  ArrowRight, 
  Sparkles, 
  GitMerge, 
  Eye, 
  Check, 
  AlertTriangle,
  RefreshCw,
  Sliders
} from 'lucide-react';

interface SampleDoc {
  id: string;
  number: string;
  vendor: string;
  category: string;
  subtotal: number;
  tax: number;
  total: number;
  confidence: number;
  lineItems: { desc: string; qty: number; unit: number; total: number; bbox: number[] }[];
}

const SAMPLE_DOCS: SampleDoc[] = [
  {
    id: 'doc-1',
    number: 'INV-2024-8841',
    vendor: 'Global Logistics Corp',
    category: 'Ocean Freight & Customs',
    subtotal: 34850.00,
    tax: 2875.12,
    total: 37725.12,
    confidence: 0.998,
    lineItems: [
      { desc: '40ft High-Cube Ocean Container Freight (Rotterdam -> NYC)', qty: 2, unit: 12500.00, total: 25000.00, bbox: [0.12, 0.44, 0.38, 0.49] },
      { desc: 'Customs Clearance, Harbor Drayage & Terminal Handling', qty: 1, unit: 9850.00, total: 9850.00, bbox: [0.12, 0.50, 0.42, 0.55] }
    ]
  },
  {
    id: 'doc-2',
    number: 'INV-2024-9022',
    vendor: 'Vortex Industrial',
    category: 'Precision Hardware Assemblies',
    subtotal: 12500.00,
    tax: 950.00,
    total: 13450.00,
    confidence: 0.975,
    lineItems: [
      { desc: 'Titanium Grade-5 Fastener Assemblies (ASTM-B348)', qty: 500, unit: 25.00, total: 12500.00, bbox: [0.15, 0.42, 0.45, 0.48] }
    ]
  },
  {
    id: 'doc-3',
    number: 'PO-2024-4412',
    vendor: 'PureStorage Enterprise',
    category: 'High-Density SAN Storage',
    subtotal: 10200.00,
    tax: 1020.00,
    total: 11220.00,
    confidence: 0.992,
    lineItems: [
      { desc: 'High-Density All-Flash NVMe Array Module (30TB)', qty: 1, unit: 10200.00, total: 10200.00, bbox: [0.10, 0.40, 0.35, 0.46] }
    ]
  }
];

export const HeroSection: React.FC = () => {
  const [selectedDocId, setSelectedDocId] = useState<string>('doc-1');
  const [activeTab, setActiveTab] = useState<'spatial' | 'math' | 'matching'>('spatial');
  const [injectVariance, setInjectVariance] = useState<boolean>(false);
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);

  const doc = SAMPLE_DOCS.find(d => d.id === selectedDocId) || SAMPLE_DOCS[0];

  // Injected variance calculation
  const displayedSubtotal = injectVariance ? doc.subtotal + 14.20 : doc.subtotal;
  const isEquationValid = !injectVariance && (displayedSubtotal + doc.tax === doc.total);

  return (
    <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden min-h-[92vh] flex flex-col justify-center">
      {/* 3D WebGL Particle Constellation Canvas */}
      <HeroInteractiveCanvas />

      {/* Ambient Lighting Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-gradient-to-r from-ops-blue/20 via-ops-cyan/20 to-ops-yellow/10 rounded-full blur-[150px] pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10 w-full text-center">
        {/* Section Pill Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/10 bg-[#121320]/80 backdrop-blur-md mb-8">
          <span className="w-2 h-2 rounded-full bg-ops-cyan animate-pulse" />
          <span className="text-xs font-mono text-ops-cyan tracking-wider uppercase font-semibold">
            [ SYSTEM_CORE ] • AUTONOMOUS FINANCIAL INTELLIGENCE
          </span>
        </div>

        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-white mb-6 max-w-4xl mx-auto leading-[1.1]">
          Financial Document Intelligence with{' '}
          <span className="text-ops-gradient">Mathematical Precision</span>
        </h1>

        {/* Subtitle */}
        <p className="text-base sm:text-xl text-white/70 max-w-2xl mx-auto mb-10 leading-relaxed font-sans">
          Ingest complex unstructured invoices, ground every token in pixel-level spatial bounding boxes, enforce zero-tolerance arithmetic invariants, and execute dual-custody ERP settlement with zero human error.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <Button
            variant="gradient"
            size="lg"
            onClick={() => window.location.href = '/login'}
            icon={<ArrowRight className="w-4 h-4" />}
          >
            Launch Enterprise Workspace
          </Button>

          <Button
            variant="secondary"
            size="lg"
            onClick={() => {
              const el = document.getElementById('spatial-grounding');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            Explore Invariant Core
          </Button>
        </div>

        {/* Live Interactive Product Workbench Preview */}
        <div className="max-w-5xl mx-auto text-left">
          <GlowCard className="p-6 sm:p-8 border-white/15 bg-[#0D0E1A]/95 shadow-[0_0_50px_rgba(0,0,0,0.8)] backdrop-blur-xl">
            {/* Workbench Top Bar: Document Switcher & Status */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-6 border-b border-white/[0.08] gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                </div>
                <span className="text-xs font-mono text-white/40">ledgerone-interactive-core</span>
              </div>

              {/* Sample Document Tabs */}
              <div className="flex items-center gap-1.5 bg-[#141524] p-1 rounded-xl border border-white/[0.06] text-xs font-mono overflow-x-auto">
                {SAMPLE_DOCS.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => {
                      setSelectedDocId(d.id);
                      setInjectVariance(false);
                    }}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      selectedDocId === d.id
                        ? 'bg-white text-black font-semibold shadow-sm'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    #{d.number}
                  </button>
                ))}
              </div>
            </div>

            {/* Workbench Mode Selector */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('spatial')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-mono transition-all border ${
                    activeTab === 'spatial'
                      ? 'bg-ops-cyan/15 text-ops-cyan border-ops-cyan/40 font-semibold'
                      : 'bg-white/[0.03] text-white/60 border-white/[0.06] hover:text-white'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>1. Spatial Grounding</span>
                </button>

                <button
                  onClick={() => setActiveTab('math')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-mono transition-all border ${
                    activeTab === 'math'
                      ? 'bg-ops-cyan/15 text-ops-cyan border-ops-cyan/40 font-semibold'
                      : 'bg-white/[0.03] text-white/60 border-white/[0.06] hover:text-white'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>2. Invariant Math Engine</span>
                </button>

                <button
                  onClick={() => setActiveTab('matching')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-mono transition-all border ${
                    activeTab === 'matching'
                      ? 'bg-ops-cyan/15 text-ops-cyan border-ops-cyan/40 font-semibold'
                      : 'bg-white/[0.03] text-white/60 border-white/[0.06] hover:text-white'
                  }`}
                >
                  <GitMerge className="w-3.5 h-3.5" />
                  <span>3. Three-Way Match</span>
                </button>
              </div>

              {/* Simulation Action: Inject Math Variance */}
              {activeTab === 'math' && (
                <button
                  onClick={() => setInjectVariance(!injectVariance)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all border ${
                    injectVariance
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold animate-pulse'
                      : 'bg-white/[0.04] text-white/60 border-white/[0.08] hover:text-white'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>{injectVariance ? 'Reset Equation' : 'Inject $14.20 Variance'}</span>
                </button>
              )}
            </div>

            {/* Tab 1: Spatial Grounding Canvas */}
            {activeTab === 'spatial' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Document Physical Preview */}
                <div className="lg:col-span-7 p-6 rounded-xl bg-[#090A12] border border-white/[0.08] font-mono text-xs text-white/80 space-y-4">
                  <div className="flex justify-between items-start border-b border-white/[0.08] pb-3 text-white/50">
                    <div>
                      <div className="font-bold text-white text-sm">{doc.vendor}</div>
                      <div className="text-[10px]">Category: {doc.category}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-ops-cyan">OCR CONFIDENCE: {(doc.confidence * 100).toFixed(1)}%</div>
                      <div className="text-[10px] text-white/40">Page 1 of 1 • 300 DPI</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="text-[10px] uppercase text-white/40 flex justify-between border-b border-white/[0.04] pb-1">
                      <span>Description</span>
                      <span>Line Total</span>
                    </div>

                    {doc.lineItems.map((li, idx) => {
                      const isHovered = hoveredLine === idx;
                      return (
                        <div
                          key={idx}
                          onMouseEnter={() => setHoveredLine(idx)}
                          onMouseLeave={() => setHoveredLine(null)}
                          className={`p-3 rounded-lg border transition-all cursor-pointer relative ${
                            isHovered
                              ? 'bg-ops-cyan/10 border-ops-cyan text-white shadow-[0_0_15px_rgba(0,255,204,0.15)]'
                              : 'bg-white/[0.02] border-transparent text-white/70 hover:bg-white/[0.04]'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-sans font-medium">{li.desc}</span>
                            <span className="font-mono font-bold text-ops-cyan">${li.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between text-[10px] text-white/40 mt-1">
                            <span>QTY: {li.qty} @ ${li.unit.toFixed(2)}</span>
                            <span className="text-ops-cyan">bbox: [{li.bbox.join(', ')}]</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-3 border-t border-white/[0.08] flex justify-between text-xs text-white/60">
                    <span>Subtotal: ${doc.subtotal.toFixed(2)}</span>
                    <span>Tax: ${doc.tax.toFixed(2)}</span>
                    <span className="text-white font-bold">Total: ${doc.total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Right: Real-time Extraction Inspector */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="p-4 rounded-xl bg-[#11121F] border border-white/[0.08] space-y-3">
                    <div className="text-xs font-mono text-white/40 uppercase tracking-wider flex items-center justify-between">
                      <span>SPATIAL INSPECTOR</span>
                      <span className="text-ops-cyan text-[10px]">ZERO-HALLUCINATION</span>
                    </div>

                    <p className="text-xs text-white/60 font-sans leading-relaxed">
                      Every parsed token is anchored to exact physical coordinates on the underlying image. Hovering any line item verifies its bounding box with optical confidence telemetry.
                    </p>

                    <div className="p-3 rounded-lg bg-[#0A0B14] border border-white/[0.06] text-xs font-mono space-y-1.5 text-white/70">
                      <div className="flex justify-between">
                        <span className="text-white/40">Anchor Coordinates:</span>
                        <span className="text-ops-cyan">
                          {hoveredLine !== null 
                            ? `[${doc.lineItems[hoveredLine].bbox.join(', ')}]` 
                            : `[${doc.lineItems[0].bbox.join(', ')}]`}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40">Token Confidence:</span>
                        <span className="text-white">99.8%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40">Layout Alignment:</span>
                        <span className="text-emerald-400">PASSED</span>
                      </div>
                    </div>
                  </div>

                  <a
                    href="/login"
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-ops-blue/20 hover:bg-ops-blue/30 border border-ops-blue/40 text-xs font-mono text-white transition-all group"
                  >
                    <span>Open in Document Studio Workstation</span>
                    <ArrowRight className="w-3.5 h-3.5 text-ops-cyan group-hover:translate-x-1 transition-transform" />
                  </a>
                </div>
              </div>
            )}

            {/* Tab 2: Invariant Math Engine */}
            {activeTab === 'math' && (
              <div className="p-6 rounded-xl bg-[#090A12] border border-white/[0.08] space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white mb-1">Double-Entry Financial Invariant Validation</h3>
                    <p className="text-xs text-white/50 font-sans">
                      Equations must evaluate down to the exact cent: Σ(Line Items) + Computed Tax == Document Total.
                    </p>
                  </div>
                  <span className={`text-xs font-mono px-3 py-1 rounded-full border ${
                    isEquationValid
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30 font-bold'
                  }`}>
                    {isEquationValid ? 'INVARIANT PASS: MATCH (100.0%)' : 'VIOLATION DETECTED: Δ $14.20'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
                  <div className="p-4 rounded-lg bg-[#121320] border border-white/[0.06]">
                    <div className="text-white/40 mb-1">1. COMPUTED SUBTOTAL</div>
                    <div className="text-xl font-bold text-white">${displayedSubtotal.toFixed(2)}</div>
                    <div className="text-[10px] text-white/40 mt-1">Σ of parsed line item totals</div>
                  </div>

                  <div className="p-4 rounded-lg bg-[#121320] border border-white/[0.06]">
                    <div className="text-white/40 mb-1">2. CALCULATED SALES TAX</div>
                    <div className="text-xl font-bold text-white">${doc.tax.toFixed(2)}</div>
                    <div className="text-[10px] text-white/40 mt-1">8.25% jurisdictional rate</div>
                  </div>

                  <div className="p-4 rounded-lg bg-[#121320] border border-white/[0.06]">
                    <div className="text-white/40 mb-1">3. DOCUMENT HEADER TOTAL</div>
                    <div className="text-xl font-bold text-ops-cyan">${doc.total.toFixed(2)}</div>
                    <div className="text-[10px] text-white/40 mt-1">Extracted document invoice total</div>
                  </div>
                </div>

                {/* Diff Explanation */}
                <div className={`p-4 rounded-xl border text-xs font-mono ${
                  isEquationValid
                    ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                }`}>
                  {isEquationValid ? (
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Mathematical invariant verified: $34,850.00 + $2,875.12 == $37,725.12. Ready for automated general ledger commit.</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Invariant equation failed: Subtotal $34,864.20 + Tax $2,875.12 != Total $37,725.12 (Variance: +$14.20). Routed to Dual-Custody Review Queue.</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 3: Three-Way Reconciler */}
            {activeTab === 'matching' && (
              <div className="p-6 rounded-xl bg-[#090A12] border border-white/[0.08] space-y-6">
                <div>
                  <h3 className="text-base font-bold text-white mb-1">Three-Way Graph Topological Alignment</h3>
                  <p className="text-xs text-white/50 font-sans">
                    Automated topological reconciliation across Purchase Order (PO-2024-0019), Goods Receipt (GRN-4491-A), and Vendor Invoice ({doc.number}).
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
                  <div className="p-4 rounded-lg bg-[#121320] border border-white/[0.06]">
                    <div className="text-ops-blue font-bold mb-1">[ PO-2024-0019 ]</div>
                    <div className="text-white/60 text-[11px]">Contract Authorization</div>
                    <div className="text-lg font-bold text-white mt-2">$37,725.12</div>
                  </div>

                  <div className="p-4 rounded-lg bg-[#121320] border border-white/[0.06]">
                    <div className="text-ops-cyan font-bold mb-1">[ GRN-4491-A ]</div>
                    <div className="text-white/60 text-[11px]">Physical Warehouse Intake</div>
                    <div className="text-lg font-bold text-ops-cyan mt-2">$37,725.12</div>
                  </div>

                  <div className="p-4 rounded-lg bg-[#121320] border border-white/[0.06]">
                    <div className="text-ops-yellow font-bold mb-1">[ {doc.number} ]</div>
                    <div className="text-white/60 text-[11px]">Billed Claim for Payment</div>
                    <div className="text-lg font-bold text-ops-yellow mt-2">$37,725.12</div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#11121F] border border-white/[0.06] flex items-center justify-between text-xs font-mono">
                  <span className="text-white/70">TOPOLOGICAL GRAPH STATUS:</span>
                  <span className="text-ops-cyan font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> 100% PARITY • TOUCHLESS SETTLEMENT CLEARED
                  </span>
                </div>
              </div>
            )}
          </GlowCard>
        </div>

        {/* Brand Integration Marquee */}
        <div className="mt-16 pt-12 border-t border-white/[0.06]">
          <p className="text-xs font-mono uppercase tracking-widest text-white/40 text-center mb-8">
            NATIVE BIDIRECTIONAL CONNECTORS ACROSS ENTERPRISE LEDGERS
          </p>
          <Marquee />
        </div>
      </div>
    </section>
  );
};
