import React from 'react';
import { SectionBadge } from '../../../components/ui/SectionBadge';
import { CategoryPill } from '../../../components/ui/CategoryPill';
import { GlowCard } from '../../../components/ui/GlowCard';
import { ArrowRight, Link, CheckCheck, LineChart } from 'lucide-react';

interface ProcessStep {
  number: string;
  category: string;
  title: string;
  description: string;
  icon: typeof Link;
  tag: string;
  points: string[];
}

const STEPS: ProcessStep[] = [
  {
    number: '01',
    category: 'INTEGRATION',
    title: 'Connect & Ingest Across Any Format',
    description: 'Plug directly into S3, SFTP, ERP webhooks, or batch scanner feeds. LedgerOne automatically parses heterogeneous vendor invoices without pre-configured templates.',
    icon: Link,
    tag: 'DAY 1 READY',
    points: [
      'Zero-template multi-vendor parsing',
      'Native SAP & NetSuite connector',
      'Encrypted S3 bucket hot-folders'
    ]
  },
  {
    number: '02',
    category: 'VERIFICATION',
    title: 'Autonomous Invariant & Dual-Custody Check',
    description: 'The mathematical invariant engine verifies arithmetic equality and cross-references PO and GRN lines. Violations surface in the review studio for dual-custody sign-off.',
    icon: CheckCheck,
    tag: 'ZERO ERROR',
    points: [
      'Cent-level arithmetic balance enforcement',
      '3-way discrepancy topological matching',
      'Segregation of duties approval gates'
    ]
  },
  {
    number: '03',
    category: 'SETTLEMENT',
    title: 'Commit to Ledger & Stream Analytics',
    description: 'Approved transactions generate immutable journal entries with spatial citation receipts. Real-time telemetry monitors vendor price drift and cash cycle velocity.',
    icon: LineChart,
    tag: 'TOUCHLESS STP',
    points: [
      'Automated general ledger writeback',
      'Verifiable spatial audit trails',
      'Continuous vendor drift intelligence'
    ]
  }
];

export const ProcessSection: React.FC = () => {
  return (
    <section id="process" className="relative py-28 px-4 sm:px-6 lg:px-8 border-t border-white/[0.05] overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 right-1/4 w-96 h-96 bg-ops-cyan/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-20">
          <SectionBadge number="05" total="11" label="PROCESS" className="mb-4" />
          <CategoryPill label="AUTOMATION PROCESS" className="mb-4" />
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white mb-6">
            From Complexity to Clarity Through <span className="text-ops-gradient">Intelligent Systems</span>
          </h2>
          <p className="text-white/60 text-base sm:text-lg leading-relaxed">
            A battle-tested deployment process designed for high-volume enterprise financial operations.
          </p>
        </div>

        {/* 3 Step Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            return (
              <GlowCard key={step.number} className="p-8 relative flex flex-col justify-between group">
                <div>
                  <div className="flex items-center justify-between mb-8">
                    <span className="text-4xl lg:text-5xl font-bold font-mono text-white/30 group-hover:text-ops-cyan transition-colors">
                      {step.number}
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-widest px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.1] text-white/70">
                      {step.tag}
                    </span>
                  </div>

                  <div className="w-12 h-12 rounded-xl bg-ops-blue/10 border border-ops-blue/30 flex items-center justify-center text-ops-cyan mb-6 group-hover:scale-110 transition-transform">
                    <Icon className="w-6 h-6" />
                  </div>

                  <span className="text-[10px] font-mono uppercase tracking-widest text-ops-cyan/80 block mb-2">
                    {step.category}
                  </span>
                  <h3 className="text-xl font-bold text-white mb-3">
                    {step.title}
                  </h3>
                  <p className="text-white/60 text-sm leading-relaxed mb-6">
                    {step.description}
                  </p>
                </div>

                <div className="pt-6 border-t border-white/[0.06] space-y-2">
                  {step.points.map((pt, pIdx) => (
                    <div key={pIdx} className="flex items-center gap-2 text-xs font-mono text-white/70">
                      <span className="w-1.5 h-1.5 rounded-full bg-ops-cyan shrink-0" />
                      <span>{pt}</span>
                    </div>
                  ))}
                </div>
              </GlowCard>
            );
          })}
        </div>
      </div>
    </section>
  );
};
