import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SectionBadge } from '../../../components/ui/SectionBadge';
import { CategoryPill } from '../../../components/ui/CategoryPill';
import { GlowCard } from '../../../components/ui/GlowCard';
import { Layers, CheckCircle2, ArrowRight, ArrowDownRight, Database, RefreshCw, Cpu } from 'lucide-react';

interface Pillar {
  id: string;
  step: string;
  title: string;
  tagline: string;
  description: string;
  features: string[];
  codeSnippet: string;
  badge: string;
}

const PILLARS: Pillar[] = [
  {
    id: 'ingest',
    step: '01',
    title: 'Multi-Modal Ingestion & Layout Normalization',
    tagline: 'High-throughput document intake across any unstructured channel.',
    description: 'Ingests PDF, TIFF, scanned images, EDIFACT, and S3 batch drops with automated deskew, contrast correction, and dual-layer OCR.',
    features: [
      'Multi-engine OCR with confidence heatmaps',
      'Lossless image enhancement & deskewing',
      'Asynchronous task queuing via Celery & Redis',
      'SHA-256 cryptographic document deduplication'
    ],
    codeSnippet: `// INGESTION_PIPELINE
await intake.process({
  source: "s3://ledgerone-vault/inv_90412.pdf",
  preprocess: ["deskew", "denoise", "ocr"],
  hash: "e3b0c44298fc1c149afbf4c8996fb924..."
});`,
    badge: 'INGESTION ENGINE'
  },
  {
    id: 'verify',
    step: '02',
    title: 'Deterministic Invariant & Rule Validation',
    tagline: 'Dual-entry balance equations enforced with mathematical finality.',
    description: 'Every token is tested against formal invariants: Subtotal + Tax = Total, line-item quantity × price parity, and cross-currency FX tolerance thresholds.',
    features: [
      'Formal arithmetic equality constraints',
      'Dual-custody verification workflow',
      'Segregation of Duties (SoD) enforcement',
      'Spatial coordinate ground-truth anchoring'
    ],
    codeSnippet: `// INVARIANT_EVALUATOR
assert(sum(line_items.total) == doc.subtotal);
assert(doc.subtotal * tax_rate == doc.tax_amount);
assert(doc.subtotal + doc.tax_amount == doc.total);
return InvariantResult.SUCCESS;`,
    badge: 'MATHEMATICAL CORE'
  },
  {
    id: 'reconcile',
    step: '03',
    title: 'Three-Way Graph Matching & ERP Sync',
    tagline: 'Autonomous topological matching across PO, GRN, and Invoice.',
    description: 'Discrepancies are isolated, root-caused, and routed to review queues. Validated ledgers are committed directly to SAP, NetSuite, or Workday.',
    features: [
      'Graph-based line item fuzzy alignment',
      'Variance tolerance auto-clearance',
      'Dual-custody approval authorization barrier',
      'Automated journal entry writeback'
    ],
    codeSnippet: `// 3_WAY_RECONCILER
const match = reconciler.match({
  po: "PO-2024-001",
  grn: "GRN-8841",
  invoice: "INV-99214"
});
// Discrepancy: $0.00 (Perfect Match)
await erp.postJournal(match.journalPayload);`,
    badge: 'SETTLEMENT GATE'
  }
];

export const HowItWorksSection: React.FC = () => {
  const [activePillar, setActivePillar] = useState<string>('ingest');

  const selected = PILLARS.find(p => p.id === activePillar) || PILLARS[0];

  return (
    <section id="how-it-works" className="relative py-28 px-4 sm:px-6 lg:px-8 border-t border-white/[0.05] overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-0 -translate-y-1/2 w-80 h-80 bg-ops-blue/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
          <div>
            <SectionBadge number="04" total="11" label="HOW IT WORKS" className="mb-4" />
            <CategoryPill label="WORKFLOW INTELLIGENCE" className="mb-4" />
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white max-w-2xl leading-[1.15]">
              Scale Modern Operations with <span className="text-ops-gradient">Intelligent Automation</span>
            </h2>
          </div>
          <p className="text-white/60 text-base sm:text-lg max-w-md font-sans leading-relaxed">
            LedgerOne operates as an end-to-end verification pipeline. Click through each pillar below to see the deterministic math and workflow contracts in motion.
          </p>
        </div>

        {/* Tab Navigation Pill Group */}
        <div className="flex flex-wrap gap-3 mb-10">
          {PILLARS.map((p) => {
            const isActive = activePillar === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setActivePillar(p.id)}
                className={`flex items-center gap-3 px-6 py-3 rounded-full text-xs sm:text-sm font-mono uppercase tracking-wider transition-all duration-300 border ${
                  isActive
                    ? 'bg-white text-black border-white shadow-[0_0_25px_rgba(255,255,255,0.3)] scale-[1.02]'
                    : 'bg-[#181924] text-white/70 border-white/[0.08] hover:border-white/20 hover:text-white'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isActive ? 'bg-black text-white' : 'bg-white/10 text-white/70'
                }`}>
                  {p.step}
                </span>
                <span>{p.title.split('&')[0].trim()}</span>
              </button>
            );
          })}
        </div>

        {/* Active Pillar Card (Matching Opsyra layout) */}
        <AnimatePresence mode="wait">
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.35 }}
          >
            <GlowCard className="p-8 sm:p-12">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                {/* Left Column: Details */}
                <div className="lg:col-span-7">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-xs font-mono px-3 py-1 rounded-full bg-ops-cyan/10 text-ops-cyan border border-ops-cyan/30">
                      PILLAR {selected.step} • {selected.badge}
                    </span>
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                    {selected.title}
                  </h3>
                  <p className="text-base text-ops-cyan/90 font-mono mb-4">
                    {selected.tagline}
                  </p>
                  <p className="text-sm sm:text-base text-white/60 mb-8 leading-relaxed">
                    {selected.description}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
                    {selected.features.map((feat, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-[#141520] border border-white/[0.05]">
                        <CheckCircle2 className="w-4 h-4 text-ops-cyan shrink-0" />
                        <span className="text-xs text-white/80 font-mono">{feat}</span>
                      </div>
                    ))}
                  </div>

                  <a
                    href="/workspace"
                    className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-white bg-ops-blue/20 hover:bg-ops-blue/30 border border-ops-blue/50 px-5 py-2.5 rounded-full transition-all group"
                  >
                    Test In Workspace Sandbox
                    <ArrowRight className="w-4 h-4 text-ops-cyan group-hover:translate-x-1 transition-transform" />
                  </a>
                </div>

                {/* Right Column: Interactive Code Console */}
                <div className="lg:col-span-5">
                  <div className="rounded-xl bg-[#090A10] border border-white/[0.1] p-5 shadow-2xl relative overflow-hidden">
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/[0.08]">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]" />
                        <span className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
                        <span className="w-2.5 h-2.5 rounded-full bg-[#27C93F]" />
                      </div>
                      <span className="text-[10px] font-mono text-white/40">ledgerone-core-v3.0</span>
                    </div>

                    <pre className="font-mono text-xs text-white/80 overflow-x-auto p-2 leading-relaxed selection:bg-ops-blue/30">
                      <code>{selected.codeSnippet}</code>
                    </pre>

                    <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-white/40">
                      <span>VERIFIED COMPILED RUNTIME</span>
                      <span className="text-ops-cyan flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-ops-cyan animate-ping" />
                        ACTIVE
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </GlowCard>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
};
