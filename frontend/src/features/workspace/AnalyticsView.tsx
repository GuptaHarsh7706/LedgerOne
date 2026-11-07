import React from 'react';
import { GlowCard } from '../../components/ui/GlowCard';
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Clock, 
  ShieldCheck, 
  PieChart,
  ArrowUpRight
} from 'lucide-react';

const VENDOR_SPEND = [
  { vendor: 'Global Logistics Corp', amount: 34850.00, percent: 42, color: 'bg-ops-cyan' },
  { vendor: 'Vortex Industrial', amount: 28400.00, percent: 34, color: 'bg-ops-blue' },
  { vendor: 'Apex Data Services', amount: 14200.00, percent: 17, color: 'bg-ops-yellow' },
  { vendor: 'Stratos Engineering', amount: 5900.00, percent: 7, color: 'bg-white/40' },
];

const DISCREPANCY_CAUSES = [
  { cause: 'Tax Rounding Variance (< $0.05)', count: 18, share: '56%' },
  { cause: 'Mismatched Unit of Measure', count: 8, share: '25%' },
  { cause: 'Unapproved Price Creep', count: 4, share: '12%' },
  { cause: 'Duplicate Invoice Transmission', count: 2, share: '7%' },
];

export const AnalyticsView: React.FC = () => {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono text-ops-cyan">[ 06 / 07 ]</span>
            <span className="text-xs font-mono text-white/40">• SPEND & INVARIANT TELEMETRY</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Enterprise Financial Operations Telemetry
          </h1>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-white/50">
          <span>PERIOD: CURRENT FISCAL QUARTER</span>
        </div>
      </div>

      {/* 3 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <GlowCard className="p-6">
          <div className="flex items-center justify-between text-xs font-mono text-white/50 mb-3">
            <span>TOTAL RECONCILED SPEND</span>
            <DollarSign className="w-4 h-4 text-ops-cyan" />
          </div>
          <div className="text-4xl font-bold font-mono text-white mb-2">$83,350.00</div>
          <div className="text-xs font-mono text-emerald-400 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" /> +24% YoY volume
          </div>
        </GlowCard>

        <GlowCard className="p-6" glowColor="rgba(0, 255, 204, 0.2)">
          <div className="flex items-center justify-between text-xs font-mono text-white/50 mb-3">
            <span>AVERAGE STP CYCLE VELOCITY</span>
            <Clock className="w-4 h-4 text-ops-cyan" />
          </div>
          <div className="text-4xl font-bold font-mono text-ops-cyan mb-2">42 sec</div>
          <div className="text-xs font-mono text-white/50">
            From PDF intake to ERP general ledger
          </div>
        </GlowCard>

        <GlowCard className="p-6" glowColor="rgba(255, 239, 20, 0.2)">
          <div className="flex items-center justify-between text-xs font-mono text-white/50 mb-3">
            <span>INTERCEPTED LEAKAGE</span>
            <ShieldCheck className="w-4 h-4 text-ops-yellow" />
          </div>
          <div className="text-4xl font-bold font-mono text-ops-yellow mb-2">$4,820.00</div>
          <div className="text-xs font-mono text-white/50">
            Prevented through invariant validation
          </div>
        </GlowCard>
      </div>

      {/* Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Vendor Spend Breakdown */}
        <GlowCard className="p-6">
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-6">
            <span className="text-xs font-mono text-white/40">[ VENDOR_EXPOSURE ]</span>
            <span className="text-xs font-mono text-ops-cyan">4 ACTIVE SUPPLIERS</span>
          </div>

          <h3 className="text-lg font-bold text-white mb-6">Spend Distribution by Vendor</h3>

          {/* Progress Stack */}
          <div className="w-full h-3 rounded-full bg-black/60 overflow-hidden flex mb-6">
            {VENDOR_SPEND.map((v, i) => (
              <div
                key={i}
                className={`${v.color} h-full`}
                style={{ width: `${v.percent}%` }}
                title={`${v.vendor}: ${v.percent}%`}
              />
            ))}
          </div>

          {/* Vendor Details */}
          <div className="space-y-4">
            {VENDOR_SPEND.map((v, i) => (
              <div key={i} className="flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${v.color}`} />
                  <span className="text-white/80">{v.vendor}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-white/40">{v.percent}%</span>
                  <span className="font-bold text-white">${v.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            ))}
          </div>
        </GlowCard>

        {/* Discrepancy Root Causes */}
        <GlowCard className="p-6">
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-6">
            <span className="text-xs font-mono text-white/40">[ ROOT_CAUSE_ANALYSIS ]</span>
            <span className="text-xs font-mono text-amber-400">32 TOTAL EXCEPTIONS</span>
          </div>

          <h3 className="text-lg font-bold text-white mb-6">Exception Distribution</h3>

          <div className="space-y-4">
            {DISCREPANCY_CAUSES.map((item, idx) => (
              <div key={idx} className="p-3.5 rounded-xl bg-[#11121F] border border-white/[0.06] flex items-center justify-between text-xs font-mono">
                <div>
                  <div className="font-semibold text-white/90 mb-0.5">{item.cause}</div>
                  <div className="text-[10px] text-white/40">{item.count} occurrences isolated</div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-ops-cyan">{item.share}</span>
                </div>
              </div>
            ))}
          </div>
        </GlowCard>
      </div>
    </div>
  );
};
