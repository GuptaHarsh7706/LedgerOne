import React from 'react';
import { SectionBadge } from '../../../components/ui/SectionBadge';
import { CategoryPill } from '../../../components/ui/CategoryPill';
import { GlowCard } from '../../../components/ui/GlowCard';
import { Button } from '../../../components/ui/Button';
import { ArrowRight, ShieldCheck, Database, Cpu, Terminal } from 'lucide-react';

export const PlatformCTASection: React.FC = () => {
  return (
    <section id="cta" className="relative py-32 px-4 sm:px-6 lg:px-8 border-t border-white/[0.05] overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-gradient-to-r from-ops-blue/20 via-ops-cyan/15 to-ops-yellow/10 rounded-full blur-[180px] pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10">
        <GlowCard className="p-10 sm:p-16 text-center relative overflow-hidden border-ops-cyan/30 bg-[#121320]" glowColor="rgba(0, 255, 204, 0.25)">
          <div className="relative z-10 max-w-3xl mx-auto">
            <SectionBadge number="07" total="07" label="DEPLOY INTELLIGENCE" className="mb-4 inline-flex" />
            <div className="mb-6">
              <CategoryPill label="PRODUCTION READY" />
            </div>

            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white mb-6 leading-[1.1]">
              Ready to Eliminate Financial Discrepancies with <br />
              <span className="text-ops-gradient">Mathematical Certainty?</span>
            </h2>

            <p className="text-white/70 text-base sm:text-lg mb-10 leading-relaxed font-sans max-w-xl mx-auto">
              Deploy LedgerOne into your accounts payable, treasury, and procurement workflows. Ingest multi-format documents, enforce invariant equations, and settle with dual-custody confidence.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
              <Button
                variant="gradient"
                size="lg"
                onClick={() => window.location.href = '/login'}
                icon={<ArrowRight className="w-5 h-5" />}
              >
                Launch Enterprise Workspace
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => window.location.href = '/login'}
              >
                Open Spatial Document Studio
              </Button>
            </div>

            {/* Badges footer */}
            <div className="pt-8 border-t border-white/[0.08] flex flex-wrap items-center justify-center gap-6 text-xs font-mono text-white/50">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-ops-cyan" />
                <span>Dual-Custody Segregation of Duties (SoD)</span>
              </div>
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-ops-blue" />
                <span>On-Premise RTX 3050 GPU Acceleration</span>
              </div>
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-ops-yellow" />
                <span>Neon PostgreSQL 18.6 RLS Multi-Tenancy</span>
              </div>
            </div>
          </div>
        </GlowCard>
      </div>
    </section>
  );
};
