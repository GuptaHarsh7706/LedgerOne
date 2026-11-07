import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SectionBadge } from '../../../components/ui/SectionBadge';
import { CategoryPill } from '../../../components/ui/CategoryPill';
import { GlowCard } from '../../../components/ui/GlowCard';
import { ArrowUpRight, TrendingUp, ShieldAlert, Clock, Building2 } from 'lucide-react';

interface CaseStudy {
  id: string;
  category: 'Enterprise AP' | 'Supply Chain' | 'Treasury';
  company: string;
  logo: string;
  headline: string;
  metric: string;
  metricLabel: string;
  challenge: string;
  solution: string;
  before: string;
  after: string;
  quote: string;
  author: string;
}

const CASE_STUDIES: CaseStudy[] = [
  {
    id: 'meridian',
    category: 'Enterprise AP',
    company: 'Meridian Global Logistics',
    logo: 'MGL',
    headline: 'Eliminating freight invoice discrepancies at 120,000 documents per month.',
    metric: '94%',
    metricLabel: 'Touchless STP Rate',
    challenge: 'Over 120k complex multi-currency logistics invoices per month with frequent demurrage and accessorial fee variances.',
    solution: 'Deployed LedgerOne autonomous invariant engine with automatic 3-way matching against bills of lading.',
    before: '18 Days AP Cycle',
    after: '14 Hours Auto-Settlement',
    quote: 'LedgerOne eliminated $2.3M in annual over-billings in our first quarter of operation.',
    author: 'VP of Financial Systems'
  },
  {
    id: 'vortex',
    category: 'Supply Chain',
    company: 'Vortex Industrial Manufacturing',
    logo: 'VIM',
    headline: 'Real-time PO-to-GRN line item reconciliation across 40 worldwide plants.',
    metric: '$6.8M',
    metricLabel: 'Discrepant Spend Intercepted',
    challenge: 'Mismatched unit of measures and partial deliveries led to recurring supplier payment holds and audit friction.',
    solution: 'Integrated spatial bounding box OCR with dual-custody verification workflows and automated tolerance checks.',
    before: '42% Exception Rate',
    after: '< 2.1% Exception Rate',
    quote: 'The spatial bounding boxes mean our auditors can verify any number in seconds with zero ambiguity.',
    author: 'Chief Accounting Officer'
  },
  {
    id: 'aurora',
    category: 'Treasury',
    company: 'Aurora FinTech Holdings',
    logo: 'AFH',
    headline: 'Zero-downtime multi-entity treasury settlement with strict regulatory segregation.',
    metric: '100%',
    metricLabel: 'SOC 2 & SoD Compliance',
    challenge: 'Multi-jurisdiction operations required strict segregation of duties between invoice uploaders and payment approvers.',
    solution: 'Enforced PostgreSQL RLS and cryptographic audit ledgers across 14 international legal entities.',
    before: 'Manual Dual-Sign Sheets',
    after: 'Cryptographic Dual-Custody',
    quote: 'Our external auditors completed the annual controls review in two days instead of four weeks.',
    author: 'Director of Internal Audit'
  },
  {
    id: 'solaris',
    category: 'Enterprise AP',
    company: 'Solaris Energy Infrastructure',
    logo: 'SEI',
    headline: 'Automated capital project invoice validation across joint ventures.',
    metric: '12x',
    metricLabel: 'Throughput Acceleration',
    challenge: '50-page complex engineering contractor invoices with hundreds of line items and retention clauses.',
    solution: 'Hardware-accelerated local parsing with custom math invariant checks for contractual retainage percentages.',
    before: '3.5 Hrs / Complex Invoice',
    after: '45 Seconds / Complex Invoice',
    quote: 'The AI assistant answers contractual questions with exact line-item citations directly from the documents.',
    author: 'Head of Project Finance'
  }
];

export const CaseStudySection: React.FC = () => {
  const [activeFilter, setActiveFilter] = useState<'All' | 'Enterprise AP' | 'Supply Chain' | 'Treasury'>('All');

  const filtered = activeFilter === 'All' 
    ? CASE_STUDIES 
    : CASE_STUDIES.filter(cs => cs.category === activeFilter);

  return (
    <section id="case-studies" className="relative py-28 px-4 sm:px-6 lg:px-8 border-t border-white/[0.05] overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/3 left-1/3 w-[600px] h-[600px] bg-ops-blue/5 rounded-full blur-[180px] pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
          <div>
            <SectionBadge number="06" total="11" label="CASE STUDIES" className="mb-4" />
            <CategoryPill label="AUTOMATION RESULTS" className="mb-4" />
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white max-w-2xl leading-[1.15]">
              Proven Automation Results for <span className="text-ops-gradient">Modern Teams</span>
            </h2>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap gap-2">
            {(['All', 'Enterprise AP', 'Supply Chain', 'Treasury'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveFilter(tab)}
                className={`px-4 py-2 rounded-full text-xs font-mono transition-all border ${
                  activeFilter === tab
                    ? 'bg-white text-black border-white'
                    : 'bg-[#181924] text-white/60 border-white/[0.08] hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Case Studies Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <AnimatePresence>
            {filtered.map((cs) => (
              <motion.div
                key={cs.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.3 }}
              >
                <GlowCard className="p-8 sm:p-10 flex flex-col justify-between h-full group">
                  <div>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center font-mono font-bold text-sm text-white">
                          {cs.logo}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-white">{cs.company}</div>
                          <div className="text-xs font-mono text-ops-cyan">{cs.category}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl sm:text-4xl font-bold font-mono text-ops-cyan">
                          {cs.metric}
                        </div>
                        <div className="text-[10px] font-mono uppercase text-white/50">
                          {cs.metricLabel}
                        </div>
                      </div>
                    </div>

                    <h3 className="text-xl font-bold text-white mb-4 leading-snug">
                      {cs.headline}
                    </h3>

                    <p className="text-sm text-white/60 mb-6 leading-relaxed">
                      {cs.challenge}
                    </p>

                    {/* Comparison Pill */}
                    <div className="grid grid-cols-2 gap-3 mb-6 p-3 rounded-lg bg-[#12131D] border border-white/[0.05]">
                      <div>
                        <div className="text-[10px] font-mono text-white/40 uppercase">Before LedgerOne</div>
                        <div className="text-sm font-mono font-semibold text-rose-400">{cs.before}</div>
                      </div>
                      <div className="border-l border-white/[0.06] pl-3">
                        <div className="text-[10px] font-mono text-white/40 uppercase">With LedgerOne</div>
                        <div className="text-sm font-mono font-semibold text-ops-cyan">{cs.after}</div>
                      </div>
                    </div>
                  </div>

                  {/* Quote Footer */}
                  <div className="pt-6 border-t border-white/[0.06]">
                    <p className="text-xs sm:text-sm italic text-white/80 mb-2">
                      "{cs.quote}"
                    </p>
                    <div className="text-xs font-mono text-white/40">— {cs.author}</div>
                  </div>
                </GlowCard>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
};
