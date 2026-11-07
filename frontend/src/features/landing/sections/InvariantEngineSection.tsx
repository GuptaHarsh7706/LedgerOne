import React, { useState } from 'react';
import { SectionBadge } from '../../../components/ui/SectionBadge';
import { CategoryPill } from '../../../components/ui/CategoryPill';
import { GlowCard } from '../../../components/ui/GlowCard';
import { Check, AlertTriangle, ShieldCheck, Cpu, ArrowRight, RefreshCw, Sliders } from 'lucide-react';

export const InvariantEngineSection: React.FC = () => {
  const [qty1, setQty1] = useState<number>(2);
  const [price1, setPrice1] = useState<number>(12500);
  const [qty2, setQty2] = useState<number>(1);
  const [price2, setPrice2] = useState<number>(9850);
  const [headerTotal, setHeaderTotal] = useState<number>(37725.12);

  const subtotal = qty1 * price1 + qty2 * price2;
  const computedTax = +(subtotal * 0.0825).toFixed(2);
  const computedTotal = +(subtotal + computedTax).toFixed(2);
  const variance = +(computedTotal - headerTotal).toFixed(2);
  const isMatch = Math.abs(variance) < 0.01;

  const resetValues = () => {
    setQty1(2);
    setPrice1(12500);
    setQty2(1);
    setPrice2(9850);
    setHeaderTotal(37725.12);
  };

  return (
    <section id="invariant-engine" className="relative py-28 px-4 sm:px-6 lg:px-8 border-t border-white/[0.05] overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 right-10 w-96 h-96 bg-ops-blue/10 rounded-full blur-[160px] pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
          <div>
            <SectionBadge number="02" total="05" label="INVARIANT ENGINE" className="mb-4" />
            <CategoryPill label="DETERMINISTIC ARITHMETIC" className="mb-4" />
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white max-w-2xl leading-[1.15]">
              Zero-Tolerance <span className="text-ops-gradient">Mathematical Parity</span>
            </h2>
          </div>
          <p className="text-white/60 text-base sm:text-lg max-w-md font-sans leading-relaxed">
            Accounting is an exact discipline. LedgerOne runs Python `FixedDecimal` double-entry checksums on every invoice. If line item totals + tax do not equal the billed total down to the exact cent, the transaction is automatically quarantined.
          </p>
        </div>

        {/* Interactive Invariant Equation Workbench */}
        <GlowCard className="p-8 sm:p-10 mb-12">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-8 border-b border-white/[0.08] gap-4">
            <div>
              <div className="text-xs font-mono text-ops-cyan uppercase tracking-wider mb-1">
                LIVE EQUATION SIMULATOR
              </div>
              <h3 className="text-xl font-bold text-white">
                Test Arithmetic Validation Rules in Real Time
              </h3>
            </div>

            <button
              onClick={resetValues}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#141524] border border-white/[0.08] hover:border-white/20 text-xs font-mono text-white/60 hover:text-white transition-all self-start sm:self-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset Standard Values</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: Interactive Input Controls */}
            <div className="lg:col-span-6 space-y-4 font-mono text-xs">
              <div className="p-4 rounded-xl bg-[#10111D] border border-white/[0.06] space-y-3">
                <div className="text-white/40 uppercase text-[10px]">LINE ITEM 01: OCEAN CONTAINER FREIGHT</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-white/60 block mb-1">Quantity</label>
                    <input
                      type="number"
                      value={qty1}
                      onChange={(e) => setQty1(Number(e.target.value))}
                      className="w-full bg-[#0A0B14] border border-white/10 rounded-lg p-2 text-white font-bold focus:border-ops-cyan focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-white/60 block mb-1">Unit Price ($)</label>
                    <input
                      type="number"
                      value={price1}
                      onChange={(e) => setPrice1(Number(e.target.value))}
                      className="w-full bg-[#0A0B14] border border-white/10 rounded-lg p-2 text-white font-bold focus:border-ops-cyan focus:outline-none"
                    />
                  </div>
                </div>
                <div className="text-right text-ops-cyan font-bold">
                  Line Total: ${(qty1 * price1).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#10111D] border border-white/[0.06] space-y-3">
                <div className="text-white/40 uppercase text-[10px]">LINE ITEM 02: CUSTOMS CLEARANCE</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-white/60 block mb-1">Quantity</label>
                    <input
                      type="number"
                      value={qty2}
                      onChange={(e) => setQty2(Number(e.target.value))}
                      className="w-full bg-[#0A0B14] border border-white/10 rounded-lg p-2 text-white font-bold focus:border-ops-cyan focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-white/60 block mb-1">Unit Price ($)</label>
                    <input
                      type="number"
                      value={price2}
                      onChange={(e) => setPrice2(Number(e.target.value))}
                      className="w-full bg-[#0A0B14] border border-white/10 rounded-lg p-2 text-white font-bold focus:border-ops-cyan focus:outline-none"
                    />
                  </div>
                </div>
                <div className="text-right text-ops-cyan font-bold">
                  Line Total: ${(qty2 * price2).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#10111D] border border-white/[0.06] space-y-2">
                <label className="text-white/60 block">Billed Document Total on Invoice Header ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={headerTotal}
                  onChange={(e) => setHeaderTotal(Number(e.target.value))}
                  className="w-full bg-[#0A0B14] border border-white/10 rounded-lg p-2 text-white font-bold text-sm focus:border-ops-cyan focus:outline-none"
                />
                <div className="text-[10px] text-white/40">Change this value by a few cents to trigger an instant invariant alert.</div>
              </div>
            </div>

            {/* Right: Live Invariant Evaluation State */}
            <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
              <div className="p-6 rounded-xl bg-[#090A12] border border-white/[0.08] space-y-4 font-mono text-xs">
                <div className="flex justify-between items-center pb-3 border-b border-white/[0.06]">
                  <span className="text-white/40">INVARIANT RULE:</span>
                  <span className="text-white font-bold">INV-005 (Header Master Equation)</span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-white/70">
                    <span>Sum of Calculated Lines:</span>
                    <span className="font-bold text-white">${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-white/70">
                    <span>+ Sales Tax (8.25%):</span>
                    <span className="font-bold text-white">${computedTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-ops-cyan font-bold pt-2 border-t border-white/[0.04]">
                    <span>= Verified Arithmetic Total:</span>
                    <span>${computedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-white/50 pt-1">
                    <span>Billed Header Total:</span>
                    <span>${headerTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <div className={`p-4 rounded-xl border flex items-center justify-between ${
                  isMatch
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                }`}>
                  <div className="flex items-center gap-2">
                    {isMatch ? <Check className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-amber-400" />}
                    <span className="font-bold">
                      {isMatch ? 'PASSED: Zero Variance' : `FAILED: Δ $${variance.toFixed(2)} Discrepancy`}
                    </span>
                  </div>
                  <span className="text-[10px] uppercase font-bold">
                    {isMatch ? 'AUTO-SETTLED' : 'QUARANTINED'}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#121320] border border-white/[0.06] text-xs font-mono text-white/60">
                <div className="text-ops-cyan font-bold mb-1">FIXED-DECIMAL PRECISION STANDARD:</div>
                <div>All internal calculations use 28-digit fixed-point decimals, eliminating IEEE 754 floating-point binary inaccuracies.</div>
              </div>
            </div>
          </div>
        </GlowCard>
      </div>
    </section>
  );
};
