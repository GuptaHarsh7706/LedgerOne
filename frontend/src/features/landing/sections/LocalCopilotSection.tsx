import React, { useState } from 'react';
import { SectionBadge } from '../../../components/ui/SectionBadge';
import { CategoryPill } from '../../../components/ui/CategoryPill';
import { GlowCard } from '../../../components/ui/GlowCard';
import { Bot, Cpu, Sparkles, Send, CheckCircle2, ShieldCheck, ArrowRight } from 'lucide-react';

interface PreloadedQuery {
  q: string;
  answer: string;
  citation: { doc: string; page: number; bbox: string; excerpt: string };
}

const QUERIES: PreloadedQuery[] = [
  {
    q: "What was the exact container shipping charge on invoice INV-2024-8841?",
    answer: "The ocean container shipping charge is $25,000.00 for 2 units of 40ft High-Cube containers ($12,500.00 each) routed from Rotterdam to NYC. Mathematical invariant check INV-001 confirmed parity.",
    citation: {
      doc: "INV-2024-8841.pdf",
      page: 1,
      bbox: "[0.12, 0.44, 0.38, 0.49]",
      excerpt: "40ft High-Cube Ocean Container Freight (Rotterdam -> NYC) Qty: 2 Unit: $12,500.00 Total: $25,000.00"
    }
  },
  {
    q: "Why was invoice INV-2024-9022 flagged for review?",
    answer: "Invoice INV-2024-9022 from Vortex Industrial was quarantined due to a tax rate invariant violation: the document billed sales tax at 7.60% ($950.00) instead of the jurisdictional rate of 8.25% ($1,031.25), creating an open variance of $81.25.",
    citation: {
      doc: "INV-2024-9022.pdf",
      page: 1,
      bbox: "[0.44, 0.67, 0.56, 0.71]",
      excerpt: "Sales Tax Billed: $950.00 (Expected at 8.25%: $1,031.25)"
    }
  },
  {
    q: "Are there any unfulfilled lines on Purchase Order PO-2024-0044?",
    answer: "Yes. Purchase Order PO-2024-0044 committed 100 units. Goods Receipt Note GRN-4512-B verified receipt of 70 units. The remaining 30 units ($1,500.00 commitment) remain open in the topological reconciler.",
    citation: {
      doc: "PO-2024-0044.pdf",
      page: 1,
      bbox: "[0.10, 0.40, 0.35, 0.46]",
      excerpt: "Item: Precision Valve Fittings Qty: 100 Delivered: 70 Remaining: 30"
    }
  }
];

export const LocalCopilotSection: React.FC = () => {
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const active = QUERIES[selectedIdx];

  return (
    <section id="air-gapped-copilot" className="relative py-28 px-4 sm:px-6 lg:px-8 border-t border-white/[0.05] overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/3 w-[600px] h-[600px] bg-ops-blue/5 rounded-full blur-[180px] pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
          <div>
            <SectionBadge number="05" total="05" label="AIR-GAPPED COPILOT" className="mb-4" />
            <CategoryPill label="LOCAL RTX 3050 CUDA 12.4 ENGINE" className="mb-4" />
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white max-w-2xl leading-[1.15]">
              Air-Gapped Copilot with <span className="text-ops-gradient">Verifiable Citations</span>
            </h2>
          </div>
          <p className="text-white/60 text-base sm:text-lg max-w-md font-sans leading-relaxed">
            Zero financial documents leave your firewall. LedgerOne runs localized quantized embeddings and dense vector indexing with hardware acceleration, generating answers strictly cited with exact spatial coordinates.
          </p>
        </div>

        {/* Interactive Copilot Console */}
        <GlowCard className="p-8 sm:p-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-8 border-b border-white/[0.08] gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-ops-blue/20 border border-ops-blue/40 flex items-center justify-center text-ops-cyan">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-white text-base">Local Financial Assistant Core</div>
                <div className="text-xs text-ops-cyan font-mono">RTX 3050 CUDA 12.4 • HNSW PGVECTOR INDEX</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-mono text-white/50">ON-PREM MEMORY: 4.8 GB ALLOCATED</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left: Query Suggestions */}
            <div className="lg:col-span-5 space-y-3">
              <div className="text-xs font-mono text-white/40 uppercase tracking-wider mb-2">
                TEST GROUNDED QUERIES:
              </div>

              {QUERIES.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedIdx(idx)}
                  className={`w-full text-left p-4 rounded-xl border text-xs font-mono transition-all ${
                    selectedIdx === idx
                      ? 'bg-[#18192A] border-ops-cyan text-white shadow-[0_0_20px_rgba(0,255,204,0.1)]'
                      : 'bg-[#10111D] border-white/[0.06] text-white/60 hover:border-white/20 hover:text-white'
                  }`}
                >
                  <div className="font-sans font-medium text-white mb-1">"{q.q}"</div>
                  <div className="text-[10px] text-ops-cyan">Target: {q.citation.doc}</div>
                </button>
              ))}

              <div className="pt-4">
                <a
                  href="/login"
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-ops-blue/20 hover:bg-ops-blue/30 border border-ops-blue/40 text-xs font-mono text-white transition-all group"
                >
                  <span>Open Full AI Copilot Console</span>
                  <ArrowRight className="w-3.5 h-3.5 text-ops-cyan group-hover:translate-x-1 transition-transform" />
                </a>
              </div>
            </div>

            {/* Right: Live Answer & Spatial Citations Card */}
            <div className="lg:col-span-7 space-y-4">
              <div className="p-6 rounded-2xl bg-[#090A12] border border-white/[0.08] space-y-4">
                <div className="flex items-center justify-between text-xs font-mono text-white/40 pb-3 border-b border-white/[0.06]">
                  <span>ASSISTANT GENERATION (LATENCY: 42ms)</span>
                  <span className="text-emerald-400 font-bold">100% EVIDENCE GROUNDED</span>
                </div>

                <p className="text-sm text-white/90 font-sans leading-relaxed">
                  {active.answer}
                </p>

                {/* Spatial Citation Box */}
                <div className="mt-4 p-4 rounded-xl bg-[#121320] border border-white/[0.06] space-y-2 font-mono text-xs">
                  <div className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-ops-cyan" />
                    SPATIAL GROUNDING RECEIPT:
                  </div>

                  <div className="p-2.5 rounded bg-[#0A0B14] border border-white/[0.05] space-y-1">
                    <div className="flex justify-between text-white/80">
                      <span className="text-ops-cyan">{active.citation.doc} (Page {active.citation.page})</span>
                      <span className="text-[10px] text-white/40">bbox: {active.citation.bbox}</span>
                    </div>
                    <div className="text-[11px] text-white/50 italic font-sans">
                      "{active.citation.excerpt}"
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#121320] border border-white/[0.06] text-xs font-mono text-white/50 flex items-center justify-between">
                <span>STRICT ABSTENTION POLICY:</span>
                <span className="text-ops-cyan">If answer not present in document, model explicitly abstains.</span>
              </div>
            </div>
          </div>
        </GlowCard>
      </div>
    </section>
  );
};
