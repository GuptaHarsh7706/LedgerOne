import React, { useState } from 'react';
import { SectionBadge } from '../../../components/ui/SectionBadge';
import { CategoryPill } from '../../../components/ui/CategoryPill';
import { GlowCard } from '../../../components/ui/GlowCard';
import { GitMerge, FileText, Truck, Receipt, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

interface MatchScenario {
  id: string;
  name: string;
  badge: string;
  po: { num: string; qty: number; rate: number; total: number };
  grn: { num: string; qty: number; status: string };
  inv: { num: string; qty: number; rate: number; total: number };
  matchStatus: 'MATCHED' | 'DISCREPANCY';
  explanation: string;
}

const SCENARIOS: MatchScenario[] = [
  {
    id: 'sc-1',
    name: 'Perfect 3-Way Match',
    badge: '100% STP',
    po: { num: 'PO-2024-0019', qty: 2, rate: 12500, total: 25000 },
    grn: { num: 'GRN-4491-A', qty: 2, status: 'Full Delivery Received' },
    inv: { num: 'INV-88210', qty: 2, rate: 12500, total: 25000 },
    matchStatus: 'MATCHED',
    explanation: 'PO committed quantity equals Goods Receipt delivered count, and unit price matches billing exactly. Straight-through automated clearance.'
  },
  {
    id: 'sc-2',
    name: 'Partial Shipment Delivery',
    badge: 'SPLIT LINE CLEARANCE',
    po: { num: 'PO-2024-0044', qty: 100, rate: 50, total: 5000 },
    grn: { num: 'GRN-4512-B', qty: 70, status: 'Partial Delivery (30 Pending)' },
    inv: { num: 'INV-90412', qty: 70, rate: 50, total: 3500 },
    matchStatus: 'MATCHED',
    explanation: 'Vendor billed only for the 70 units physically received. LedgerOne clears $3,500 for payment and retains an open $1,500 commitment.'
  },
  {
    id: 'sc-3',
    name: 'Unapproved Price Creep',
    badge: 'EXCEPTION FLAGGED',
    po: { num: 'PO-2024-0082', qty: 10, rate: 1200, total: 12000 },
    grn: { num: 'GRN-4601-C', qty: 10, status: '10 Units Inspected' },
    inv: { num: 'INV-91500', qty: 10, rate: 1250, total: 12500 },
    matchStatus: 'DISCREPANCY',
    explanation: 'Unit price escalated from $1,200 to $1,250 without contract amendment. Discrepancy isolated (+ $500.00) and routed to Review Queue.'
  }
];

export const ThreeWayMatchingSection: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>('sc-1');

  const selected = SCENARIOS.find(s => s.id === selectedId) || SCENARIOS[0];

  return (
    <section id="three-way-matching" className="relative py-28 px-4 sm:px-6 lg:px-8 border-t border-white/[0.05] overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/4 w-[500px] h-[500px] bg-ops-cyan/5 rounded-full blur-[180px] pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
          <div>
            <SectionBadge number="03" total="05" label="3-WAY RECONCILER" className="mb-4" />
            <CategoryPill label="TOPOLOGICAL GRAPH PARITY" className="mb-4" />
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white max-w-2xl leading-[1.15]">
              Autonomous <span className="text-ops-gradient">Three-Way Graph Matching</span>
            </h2>
          </div>
          <p className="text-white/60 text-base sm:text-lg max-w-md font-sans leading-relaxed">
            Eliminate over-billings and duplicate payments. LedgerOne builds a topological graph across POs, warehouse receipts, and vendor invoices to verify contractual parity before releasing funds.
          </p>
        </div>

        {/* Scenario Switcher Tabs */}
        <div className="flex flex-wrap gap-2.5 mb-8">
          {SCENARIOS.map((sc) => (
            <button
              key={sc.id}
              onClick={() => setSelectedId(sc.id)}
              className={`px-4 py-2 rounded-xl text-xs font-mono transition-all border flex items-center gap-2 ${
                selectedId === sc.id
                  ? 'bg-white text-black font-bold border-white shadow-md'
                  : 'bg-[#141524] text-white/60 border-white/[0.06] hover:text-white'
              }`}
            >
              <span>{sc.name}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                sc.matchStatus === 'MATCHED' ? 'bg-emerald-500/20 text-emerald-700' : 'bg-amber-500/20 text-amber-700'
              }`}>
                {sc.badge}
              </span>
            </button>
          ))}
        </div>

        {/* Reconciler Interactive Canvas */}
        <GlowCard className="p-8 sm:p-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Node 1: Purchase Order */}
            <div className="p-6 rounded-xl bg-[#11121F] border border-white/[0.08] relative">
              <div className="flex items-center justify-between text-xs font-mono text-ops-blue mb-3">
                <span className="font-bold">[ 01 / PURCHASE ORDER ]</span>
                <FileText className="w-4 h-4" />
              </div>
              <div className="text-lg font-bold text-white mb-1">{selected.po.num}</div>
              <div className="text-xs text-white/50 font-mono mb-4">Contractual Order</div>
              <div className="space-y-1 font-mono text-xs">
                <div className="flex justify-between text-white/60">
                  <span>Ordered Quantity:</span>
                  <span className="text-white">{selected.po.qty} units</span>
                </div>
                <div className="flex justify-between text-white/60">
                  <span>Unit Price:</span>
                  <span className="text-white">${selected.po.rate.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-ops-blue font-bold pt-2 border-t border-white/[0.06]">
                  <span>Committed Value:</span>
                  <span>${selected.po.total.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Node 2: Goods Receipt */}
            <div className="p-6 rounded-xl bg-[#11121F] border border-white/[0.08] relative">
              <div className="flex items-center justify-between text-xs font-mono text-ops-cyan mb-3">
                <span className="font-bold">[ 02 / GOODS RECEIPT ]</span>
                <Truck className="w-4 h-4" />
              </div>
              <div className="text-lg font-bold text-white mb-1">{selected.grn.num}</div>
              <div className="text-xs text-white/50 font-mono mb-4">Warehouse Receiving</div>
              <div className="space-y-1 font-mono text-xs">
                <div className="flex justify-between text-white/60">
                  <span>Physically Inspected:</span>
                  <span className="text-ops-cyan font-bold">{selected.grn.qty} units</span>
                </div>
                <div className="flex justify-between text-white/60">
                  <span>Receiving Note:</span>
                  <span className="text-white/80">{selected.grn.status}</span>
                </div>
                <div className="flex justify-between text-ops-cyan font-bold pt-2 border-t border-white/[0.06]">
                  <span>Receipt Parity:</span>
                  <span>{selected.grn.qty === selected.po.qty ? '100% INTAKE' : 'PARTIAL'}</span>
                </div>
              </div>
            </div>

            {/* Node 3: Vendor Invoice */}
            <div className="p-6 rounded-xl bg-[#11121F] border border-white/[0.08] relative">
              <div className="flex items-center justify-between text-xs font-mono text-ops-yellow mb-3">
                <span className="font-bold">[ 03 / VENDOR INVOICE ]</span>
                <Receipt className="w-4 h-4" />
              </div>
              <div className="text-lg font-bold text-white mb-1">{selected.inv.num}</div>
              <div className="text-xs text-white/50 font-mono mb-4">Claim for Settlement</div>
              <div className="space-y-1 font-mono text-xs">
                <div className="flex justify-between text-white/60">
                  <span>Billed Quantity:</span>
                  <span className="text-white">{selected.inv.qty} units</span>
                </div>
                <div className="flex justify-between text-white/60">
                  <span>Billed Unit Price:</span>
                  <span className={selected.inv.rate !== selected.po.rate ? 'text-amber-400 font-bold' : 'text-white'}>
                    ${selected.inv.rate.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-ops-yellow font-bold pt-2 border-t border-white/[0.06]">
                  <span>Billed Total:</span>
                  <span>${selected.inv.total.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Reconciliation Status Footer */}
          <div className="p-4 rounded-xl bg-[#090A12] border border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs">
            <div className="flex items-center gap-3">
              {selected.matchStatus === 'MATCHED' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              )}
              <span className="text-white/80 font-sans">{selected.explanation}</span>
            </div>

            <a
              href="/workspace/matching"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-ops-cyan/15 text-ops-cyan border border-ops-cyan/40 hover:bg-ops-cyan/25 transition-colors shrink-0"
            >
              <span>Inspect Matching Engine</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </GlowCard>
      </div>
    </section>
  );
};
