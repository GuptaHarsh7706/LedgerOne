import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../services/permissions';
import { GlowCard } from '../../components/ui/GlowCard';
import { Button } from '../../components/ui/Button';
import { 
  GitMerge, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  Truck, 
  Receipt, 
  ArrowRight,
  Sparkles,
  Lock
} from 'lucide-react';

interface MatchTriple {
  id: string;
  poNumber: string;
  grnNumber: string;
  invoiceNumber: string;
  vendor: string;
  poAmount: number;
  grnAmount: number;
  invoiceAmount: number;
  matchScore: number;
  discrepancy: number;
  status: 'PERFECT_MATCH' | 'PRICE_VARIANCE' | 'QUANTITY_VARIANCE';
}

const MATCHES: MatchTriple[] = [
  {
    id: 'm-1',
    poNumber: 'PO-2024-0019',
    grnNumber: 'GRN-4491-A',
    invoiceNumber: 'INV-88210',
    vendor: 'Global Logistics Corp',
    poAmount: 18500.00,
    grnAmount: 18500.00,
    invoiceAmount: 18500.00,
    matchScore: 100,
    discrepancy: 0.00,
    status: 'PERFECT_MATCH'
  },
  {
    id: 'm-2',
    poNumber: 'PO-2024-0044',
    grnNumber: 'GRN-4512-B',
    invoiceNumber: 'INV-90412',
    vendor: 'Vortex Industrial',
    poAmount: 32000.00,
    grnAmount: 32000.00,
    invoiceAmount: 32145.50,
    matchScore: 98.2,
    discrepancy: 145.50,
    status: 'PRICE_VARIANCE'
  },
  {
    id: 'm-3',
    poNumber: 'PO-2024-0082',
    grnNumber: 'GRN-4601-C',
    invoiceNumber: 'INV-91500',
    vendor: 'Apex Hardware Supplies',
    poAmount: 14200.00,
    grnAmount: 12100.00,
    invoiceAmount: 14200.00,
    matchScore: 85.2,
    discrepancy: 2100.00,
    status: 'QUANTITY_VARIANCE'
  }
];

export const MatchingView: React.FC = () => {
  const { user } = useAuth();
  const currentRole = user?.role || 'VIEWER';
  const canSettle = hasPermission(currentRole, 'matching.resolve') || hasPermission(currentRole, 'EXECUTE_SETTLEMENT');
  const [selectedMatch, setSelectedMatch] = useState<MatchTriple>(MATCHES[0]);
  const [settleFeedback, setSettleFeedback] = useState<string | null>(null);

  const handleAuthorizeSettlement = () => {
    if (!canSettle) return;
    setSettleFeedback(
      `Three-way match transaction for ${selectedMatch.vendor} (#${selectedMatch.invoiceNumber}) verified and cleared to general ledger by ${currentRole.replace(/_/g, ' ')}.`
    );
    setTimeout(() => setSettleFeedback(null), 4000);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono text-ops-cyan">[ 04 / 07 ]</span>
            <span className="text-xs font-mono text-white/40">• TOPOLOGICAL RECONCILER</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Three-Way Matching & Discrepancy Engine
          </h1>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-white/60">
          <span className="w-2 h-2 rounded-full bg-ops-cyan animate-pulse" />
          <span>REAL-TIME GRAPH PARITY ACTIVE</span>
        </div>
      </div>

      {/* Reconciler Interactive Canvas */}
      <GlowCard className="p-8">
        <div className="flex items-center justify-between pb-6 border-b border-white/[0.08] mb-8">
          <div>
            <div className="text-xs font-mono text-ops-cyan uppercase tracking-wider mb-1">
              SELECTED TOPOLOGICAL GRAPH • {selectedMatch.vendor}
            </div>
            <div className="text-xl font-bold text-white">
              PO {selectedMatch.poNumber} ↔ GRN {selectedMatch.grnNumber} ↔ INV {selectedMatch.invoiceNumber}
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl font-bold font-mono text-ops-cyan">
              {selectedMatch.matchScore}%
            </div>
            <div className="text-[10px] font-mono text-white/40 uppercase">
              TOPOLOGICAL MATCH SCORE
            </div>
          </div>
        </div>

        {/* 3 Interactive Nodes: PO, GRN, INVOICE */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          {/* PO Card */}
          <div className="p-6 rounded-xl bg-[#11121F] border border-white/[0.08] relative group">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-mono uppercase text-ops-blue tracking-wider">
                [ 01 / PURCHASE ORDER ]
              </span>
              <FileText className="w-4 h-4 text-ops-blue" />
            </div>
            <div className="text-base font-bold text-white mb-1">{selectedMatch.poNumber}</div>
            <div className="text-xs text-white/50 font-mono mb-4">Committed Contract Price</div>
            <div className="text-2xl font-bold font-mono text-white">
              ${selectedMatch.poAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>

          {/* GRN Card */}
          <div className="p-6 rounded-xl bg-[#11121F] border border-white/[0.08] relative group">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-mono uppercase text-ops-cyan tracking-wider">
                [ 02 / GOODS RECEIPT NOTE ]
              </span>
              <Truck className="w-4 h-4 text-ops-cyan" />
            </div>
            <div className="text-base font-bold text-white mb-1">{selectedMatch.grnNumber}</div>
            <div className="text-xs text-white/50 font-mono mb-4">Physical Verified Quantity</div>
            <div className="text-2xl font-bold font-mono text-ops-cyan">
              ${selectedMatch.grnAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>

          {/* Invoice Card */}
          <div className="p-6 rounded-xl bg-[#11121F] border border-white/[0.08] relative group">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-mono uppercase text-ops-yellow tracking-wider">
                [ 03 / VENDOR INVOICE ]
              </span>
              <Receipt className="w-4 h-4 text-ops-yellow" />
            </div>
            <div className="text-base font-bold text-white mb-1">{selectedMatch.invoiceNumber}</div>
            <div className="text-xs text-white/50 font-mono mb-4">Billed Request for Settlement</div>
            <div className="text-2xl font-bold font-mono text-ops-yellow">
              ${selectedMatch.invoiceAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Settle Toast Alert */}
        {settleFeedback && (
          <div className="mt-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center justify-between animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{settleFeedback}</span>
            </div>
            <button onClick={() => setSettleFeedback(null)} className="text-white/40 hover:text-white">✕</button>
          </div>
        )}

        {/* Discrepancy Analysis Bar */}
        <div className="mt-8 pt-6 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {selectedMatch.discrepancy === 0 ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            )}
            <span className="text-xs font-mono text-white/80">
              {selectedMatch.discrepancy === 0 ? (
                'Zero line-item variance. Three-way parity achieved.'
              ) : (
                `Variance detected: Δ $${selectedMatch.discrepancy.toFixed(2)} between Goods Receipt and Vendor Invoice.`
              )}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!canSettle && (
              <span className="text-[10px] font-mono text-white/40 flex items-center gap-1">
                <Lock className="w-3 h-3 text-amber-400" />
                Dual-Custody Gated
              </span>
            )}
            <Button
              variant={selectedMatch.discrepancy === 0 ? 'primary' : 'outline'}
              size="sm"
              disabled={!canSettle}
              title={!canSettle ? `Role '${currentRole}' lacks settlement clearance.` : 'Post settlement'}
              onClick={handleAuthorizeSettlement}
            >
              Authorize 3-Way Settlement
            </Button>
          </div>
        </div>
      </GlowCard>

      {/* Available Match Cases Table */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Reconciliation Batches</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {MATCHES.map((m) => (
            <div
              key={m.id}
              onClick={() => setSelectedMatch(m)}
              className={`p-4 rounded-xl border text-xs font-mono cursor-pointer transition-all ${
                selectedMatch.id === m.id
                  ? 'bg-[#181928] border-ops-cyan text-white shadow-[0_0_20px_rgba(0,255,204,0.1)]'
                  : 'bg-[#10111D] border-white/[0.06] text-white/70 hover:border-white/20'
              }`}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-white">{m.vendor}</span>
                <span className="text-ops-cyan">{m.matchScore}%</span>
              </div>
              <div className="text-[11px] text-white/40 mb-2">
                PO: {m.poNumber} ↔ INV: {m.invoiceNumber}
              </div>
              <div className="flex justify-between font-bold pt-2 border-t border-white/[0.06]">
                <span>Total: ${m.invoiceAmount.toLocaleString()}</span>
                <span className={m.discrepancy === 0 ? 'text-emerald-400' : 'text-amber-400'}>
                  Δ ${m.discrepancy.toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
