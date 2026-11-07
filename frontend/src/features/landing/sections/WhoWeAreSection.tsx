import React from 'react';
import { motion } from 'framer-motion';
import { SectionBadge } from '../../../components/ui/SectionBadge';
import { CategoryPill } from '../../../components/ui/CategoryPill';
import { GlowCard } from '../../../components/ui/GlowCard';
import { AnimatedNumber } from '../../../components/ui/AnimatedNumber';
import { ArrowUpRight, ShieldCheck, Zap, BarChart3 } from 'lucide-react';

export const WhoWeAreSection: React.FC = () => {
  return (
    <section id="who-we-are" className="relative py-28 px-4 sm:px-6 lg:px-8 border-t border-white/[0.05] overflow-hidden">
      {/* Background ambient radial glow */}
      <div className="absolute top-1/2 right-0 -translate-y-1/2 w-96 h-96 bg-ops-blue/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        {/* Header Block */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
          <div>
            <SectionBadge number="02" total="11" label="WHO WE ARE" className="mb-4" />
            <CategoryPill label="MISSION & PURPOSE" className="mb-4" />
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white max-w-2xl leading-[1.15]">
              We replace manual reconciliations with <span className="text-ops-gradient">deterministic systems</span>.
            </h2>
          </div>
          <p className="text-white/60 text-base sm:text-lg max-w-md font-sans leading-relaxed">
            Enterprise document verification shouldn't rely on brittle heuristics or fallible manual data entry. LedgerOne unifies OCR, spatial layout geometry, and double-entry arithmetic invariants into an immutable financial operating core.
          </p>
        </div>

        {/* 3 High-Impact Stat Cards matching Opsyra */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {/* Card 1 */}
          <GlowCard className="p-8 group">
            <div className="flex items-center justify-between mb-6">
              <span className="text-xs font-mono text-white/40 tracking-wider">[ METRIC_01 ]</span>
              <div className="w-10 h-10 rounded-lg bg-ops-blue/10 border border-ops-blue/30 flex items-center justify-center text-ops-blue group-hover:scale-110 transition-transform">
                <Zap className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-5xl lg:text-6xl font-bold font-mono tracking-tight text-white">
                <AnimatedNumber value={85} />
              </span>
              <span className="text-3xl font-bold text-ops-cyan">%</span>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Reduction in Cycle Latency</h3>
            <p className="text-sm text-white/50 leading-relaxed">
              Touchless STP (Straight-Through Processing) for multi-line purchase orders and invoice reconciliations across 14 enterprise ERPs.
            </p>
          </GlowCard>

          {/* Card 2 */}
          <GlowCard className="p-8 group" glowColor="rgba(0, 255, 204, 0.2)">
            <div className="flex items-center justify-between mb-6">
              <span className="text-xs font-mono text-white/40 tracking-wider">[ METRIC_02 ]</span>
              <div className="w-10 h-10 rounded-lg bg-ops-cyan/10 border border-ops-cyan/30 flex items-center justify-center text-ops-cyan group-hover:scale-110 transition-transform">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-5xl lg:text-6xl font-bold font-mono tracking-tight text-white">
                <AnimatedNumber value={99} />
              </span>
              <span className="text-3xl font-bold text-ops-cyan">.8%</span>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Extraction Parity & Precision</h3>
            <p className="text-sm text-white/50 leading-relaxed">
              Pixel-grounded spatial bounding boxes eliminate hallucinations. Every numerical token is verified by mathematical checksums.
            </p>
          </GlowCard>

          {/* Card 3 */}
          <GlowCard className="p-8 group" glowColor="rgba(255, 239, 20, 0.2)">
            <div className="flex items-center justify-between mb-6">
              <span className="text-xs font-mono text-white/40 tracking-wider">[ METRIC_03 ]</span>
              <div className="w-10 h-10 rounded-lg bg-ops-yellow/10 border border-ops-yellow/30 flex items-center justify-center text-ops-yellow group-hover:scale-110 transition-transform">
                <BarChart3 className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-5xl lg:text-6xl font-bold font-mono tracking-tight text-white">$</span>
              <span className="text-5xl lg:text-6xl font-bold font-mono tracking-tight text-white">
                <AnimatedNumber value={42} />
              </span>
              <span className="text-3xl font-bold text-ops-yellow">M+</span>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Discrepant Spend Intercepted</h3>
            <p className="text-sm text-white/50 leading-relaxed">
              Three-way graph matching catches double billings, quantity mismatches, and unauthorized line-item variances before settlement.
            </p>
          </GlowCard>
        </div>

        {/* Secondary Banner Quote matching Opsyra style */}
        <div className="relative p-8 rounded-2xl bg-[#141520] border border-white/[0.08] flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden">
          <div className="flex items-center gap-4">
            <div className="w-3 h-3 rounded-full bg-ops-cyan animate-pulse" />
            <p className="text-sm sm:text-base text-white/80 font-mono">
              [ SYSTEM_STATUS ]: Active validation engine running zero-downtime consensus with dual-custody segregation.
            </p>
          </div>
          <a
            href="/workspace"
            className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-ops-cyan hover:text-white transition-colors group"
          >
            Explore System Architecture
            <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </a>
        </div>
      </div>
    </section>
  );
};
