import React from 'react';
import { SectionBadge } from '../../../components/ui/SectionBadge';
import { CategoryPill } from '../../../components/ui/CategoryPill';
import { GlowCard } from '../../../components/ui/GlowCard';
import { Button } from '../../../components/ui/Button';
import { ArrowRight, Sparkles, CheckCircle2, ShieldCheck, Terminal } from 'lucide-react';

export const CTASection: React.FC = () => {
  return (
    <section id="cta" className="relative py-32 px-4 sm:px-6 lg:px-8 border-t border-white/[0.05] overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-gradient-to-r from-ops-blue/20 via-ops-cyan/15 to-ops-yellow/10 rounded-full blur-[180px] pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        <GlowCard className="p-10 sm:p-16 lg:p-20 text-center relative overflow-hidden border-ops-cyan/30 bg-[#121320]" glowColor="rgba(0, 255, 204, 0.3)">
          {/* Subtle grid pattern inside */}
          <div className="absolute inset-0 bg-ambient-grid opacity-20 pointer-events-none" />

          <div className="relative z-10 max-w-3xl mx-auto">
            <SectionBadge number="11" total="11" label="START AUTOMATING" className="mb-4 inline-flex" />
            <div className="mb-6">
              <CategoryPill label="DEPLOY IN MINUTES" />
            </div>

            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-6 leading-[1.1]">
              Ready to Scale with <br />
              <span className="text-ops-gradient">Intelligent Automation?</span>
            </h2>

            <p className="text-white/70 text-base sm:text-lg mb-10 leading-relaxed font-sans max-w-xl mx-auto">
              Join leading financial operations teams replacing manual invoice reconciliations with mathematical guarantees, pixel-accurate bounding boxes, and dual-custody compliance.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
              <Button
                variant="gradient"
                size="lg"
                onClick={() => window.location.href = '/workspace'}
                icon={<ArrowRight className="w-5 h-5" />}
              >
                Launch Enterprise Workspace
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => window.location.href = '#how-it-works'}
              >
                Explore Architecture Docs
              </Button>
            </div>

            {/* Badges footer */}
            <div className="pt-8 border-t border-white/[0.08] flex flex-wrap items-center justify-center gap-6 text-xs font-mono text-white/50">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-ops-cyan" />
                <span>SOC 2 Type II Ready</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-ops-blue" />
                <span>On-Premise GPU Compatible</span>
              </div>
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-ops-yellow" />
                <span>Native REST API & Webhooks</span>
              </div>
            </div>
          </div>
        </GlowCard>
      </div>
    </section>
  );
};
