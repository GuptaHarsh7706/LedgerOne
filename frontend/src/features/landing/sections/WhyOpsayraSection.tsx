import React from 'react';
import { motion } from 'framer-motion';
import { SectionBadge } from '../../../components/ui/SectionBadge';
import { CategoryPill } from '../../../components/ui/CategoryPill';
import { GlowCard } from '../../../components/ui/GlowCard';
import { Cpu, CheckCircle2, GitMerge, Lock, Sparkles, FileText, ArrowRight } from 'lucide-react';

export const WhyOpsayraSection: React.FC = () => {
  return (
    <section id="why-ledgerone" className="relative py-28 px-4 sm:px-6 lg:px-8 border-t border-white/[0.05] overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-ops-cyan/5 rounded-full blur-[160px] pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-20">
          <SectionBadge number="03" total="11" label="WHY LEDGERONE" className="mb-4" />
          <CategoryPill label="SYSTEM CAPABILITIES" className="mb-4" />
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white mb-6">
            Build Smarter Workflows with <span className="text-ops-gradient">Verifiable Systems</span>
          </h2>
          <p className="text-white/60 text-base sm:text-lg leading-relaxed">
            Generic AI models guess; financial workflows demand absolute determinism. LedgerOne embeds strict mathematical invariants into every extraction, reconciliation, and settlement loop.
          </p>
        </div>

        {/* Bento Grid (2 columns on tablet, 3-column asymmetric layout on desktop) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {/* Card 1: Large Span */}
          <GlowCard className="p-8 lg:col-span-2 relative overflow-hidden group">
            <div className="flex items-center justify-between mb-8">
              <span className="text-xs font-mono text-white/40 tracking-wider">[ CORE_CAPABILITY_01 ]</span>
              <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-ops-blue/20 text-ops-blue border border-ops-blue/40">
                ACTIVE INVARIANT ENGINE
              </span>
            </div>

            <h3 className="text-2xl font-bold text-white mb-3">
              Zero-Tolerance Arithmetic Invariant Engine
            </h3>
            <p className="text-white/60 text-sm sm:text-base leading-relaxed mb-6 max-w-xl">
              Every extracted document is evaluated against rigorous double-entry equations. If subtotal + tax does not equal total down to the cent, or currency exchange rates breach defined thresholds, LedgerOne automatically flags the variance with exact arithmetic diffs.
            </p>

            {/* Simulated Live Invariant Terminal */}
            <div className="p-4 rounded-xl bg-[#12131D] border border-white/[0.08] font-mono text-xs text-white/80 space-y-2">
              <div className="flex items-center justify-between text-white/40 pb-2 border-b border-white/[0.06]">
                <span>EQUATION VALIDATOR</span>
                <span className="text-ops-cyan">STATUS: PASS (100.0%)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Σ Line Items:</span>
                <span className="text-white font-semibold">$34,850.00</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">+ Computed Sales Tax (8.25%):</span>
                <span className="text-white font-semibold">$2,875.12</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-white/[0.04] text-ops-cyan">
                <span>= Verified Document Total:</span>
                <span className="font-bold">$37,725.12 [MATCH]</span>
              </div>
            </div>
          </GlowCard>

          {/* Card 2: Spatial Grounding */}
          <GlowCard className="p-8 relative overflow-hidden group">
            <div className="flex items-center justify-between mb-8">
              <span className="text-xs font-mono text-white/40 tracking-wider">[ CORE_CAPABILITY_02 ]</span>
              <FileText className="w-5 h-5 text-ops-cyan" />
            </div>

            <h3 className="text-xl font-bold text-white mb-3">
              Spatial Bounding-Box Grounding
            </h3>
            <p className="text-white/60 text-sm leading-relaxed mb-6">
              No black-box hallucination. Every extracted field is tied to normalized 2D coordinates `[x1, y1, x2, y2]` on the source document with optical confidence indicators.
            </p>

            <div className="h-32 rounded-lg bg-[#141520] border border-white/[0.08] relative overflow-hidden flex items-center justify-center">
              <div className="absolute inset-4 border border-dashed border-ops-cyan/40 rounded flex items-center justify-center bg-ops-cyan/[0.04]">
                <span className="text-xs font-mono text-ops-cyan px-2 py-0.5 bg-black/60 rounded">
                  bbox: [0.12, 0.44, 0.38, 0.49] • 99.4%
                </span>
              </div>
            </div>
          </GlowCard>

          {/* Card 3: 3-Way Graph Reconciliation */}
          <GlowCard className="p-8 relative overflow-hidden group">
            <div className="flex items-center justify-between mb-8">
              <span className="text-xs font-mono text-white/40 tracking-wider">[ CORE_CAPABILITY_03 ]</span>
              <GitMerge className="w-5 h-5 text-ops-yellow" />
            </div>

            <h3 className="text-xl font-bold text-white mb-3">
              Three-Way Graph Reconciler
            </h3>
            <p className="text-white/60 text-sm leading-relaxed mb-6">
              Automated topological matching across Purchase Orders, Goods Receipt Notes, and Vendor Invoices. Catches partial deliveries, pricing creeps, and line-item mismatches.
            </p>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono p-2 rounded bg-[#12131D] border border-white/[0.05]">
                <span className="text-white/60">PO-90214 ↔ GRN-4410</span>
                <span className="text-ops-cyan">100% MATCH</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono p-2 rounded bg-[#12131D] border border-white/[0.05]">
                <span className="text-white/60">INV-8820 ↔ GRN-4410</span>
                <span className="text-ops-yellow">Δ $14.20 (0.04%)</span>
              </div>
            </div>
          </GlowCard>

          {/* Card 4: Hardware-Accelerated Local Copilot */}
          <GlowCard className="p-8 lg:col-span-2 relative overflow-hidden group" glowColor="rgba(12, 113, 255, 0.2)">
            <div className="flex items-center justify-between mb-8">
              <span className="text-xs font-mono text-white/40 tracking-wider">[ CORE_CAPABILITY_04 ]</span>
              <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-ops-cyan/10 text-ops-cyan border border-ops-cyan/30">
                RTX 3050 CUDA 12.4 ACCELERATION
              </span>
            </div>

            <h3 className="text-2xl font-bold text-white mb-3">
              On-Premise & Local GPU Security Boundary
            </h3>
            <p className="text-white/60 text-sm sm:text-base leading-relaxed mb-6 max-w-xl">
              Zero sensitive financial data leaves your secure perimeter. LedgerOne runs dedicated quantized models with dynamic batching and HNSW vector indexing directly on your local hardware, ensuring sub-50ms query latency and SOC 2 / GDPR compliance.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 rounded-lg bg-[#12131D] border border-white/[0.06]">
                <div className="text-lg font-bold font-mono text-white">4.8 GB</div>
                <div className="text-xs text-white/50">VRAM Budget</div>
              </div>
              <div className="p-3 rounded-lg bg-[#12131D] border border-white/[0.06]">
                <div className="text-lg font-bold font-mono text-ops-cyan">12 ms</div>
                <div className="text-xs text-white/50">Vector Search P95</div>
              </div>
              <div className="p-3 rounded-lg bg-[#12131D] border border-white/[0.06]">
                <div className="text-lg font-bold font-mono text-ops-blue">100%</div>
                <div className="text-xs text-white/50">Air-Gapped Ready</div>
              </div>
              <div className="p-3 rounded-lg bg-[#12131D] border border-white/[0.06]">
                <div className="text-lg font-bold font-mono text-ops-yellow">AES-256</div>
                <div className="text-xs text-white/50">At-Rest Storage</div>
              </div>
            </div>
          </GlowCard>
        </div>

        {/* Running Ticker matching Opsyra */}
        <div className="w-full py-4 px-6 rounded-xl bg-[#10111A] border border-white/[0.06] overflow-hidden">
          <div className="flex items-center gap-8 animate-marquee whitespace-nowrap text-xs font-mono uppercase tracking-widest text-white/50">
            <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-ops-cyan" /> ZERO-TOLERANCE MATHEMATICAL AUDIT</span>
            <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-ops-blue" /> DUAL-CUSTODY SEGREGATION OF DUTIES</span>
            <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-ops-yellow" /> THREE-WAY GRAPH RECONCILER</span>
            <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-ops-cyan" /> SPATIAL BOUNDING-BOX OCR TRACEABILITY</span>
            <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-ops-blue" /> POSTGRESQL ROW-LEVEL SECURITY</span>
          </div>
        </div>
      </div>
    </section>
  );
};
