import React, { useState } from 'react';
import { useActiveRole, hasPermission } from '../../services/permissions';
import { GlowCard } from '../../components/ui/GlowCard';
import { Button } from '../../components/ui/Button';
import { 
  ShieldAlert, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  Check, 
  X, 
  Lock,
  UserCheck,
  ArrowRight
} from 'lucide-react';

interface ReviewItem {
  id: string;
  invoiceNumber: string;
  vendorName: string;
  total: number;
  violationType: string;
  calculatedSum: number;
  expectedSum: number;
  submittedBy: string;
  submittedAt: string;
  status: 'OPEN' | 'RESOLVED' | 'REJECTED';
}

const INITIAL_QUEUE: ReviewItem[] = [
  {
    id: 'rev-01',
    invoiceNumber: 'BOL-2026-0442',
    vendorName: 'Maersk Line A/S',
    total: 53120.00,
    violationType: 'Container Demurrage Surcharge Variance',
    calculatedSum: 52488.00,
    expectedSum: 53120.00,
    submittedBy: 'edi_ocean_gateway',
    submittedAt: '18 minutes ago',
    status: 'OPEN'
  },
  {
    id: 'rev-02',
    invoiceNumber: 'INV-2026-9022',
    vendorName: 'Vortex Industrial Precision',
    total: 13490.00,
    violationType: 'Arithmetic Subtotal Summation Discrepancy (INV-001)',
    calculatedSum: 13450.00,
    expectedSum: 13490.00,
    submittedBy: 'ocr_ingest_daemon',
    submittedAt: '45 minutes ago',
    status: 'OPEN'
  },
  {
    id: 'rev-03',
    invoiceNumber: 'FLT-2026-081',
    vendorName: 'Shell Aviation & Marine Fuel Logistics',
    total: 119920.00,
    violationType: 'Spot FX Rate Exceeded Tolerance Band (INV-004)',
    calculatedSum: 119700.00,
    expectedSum: 119920.00,
    submittedBy: 'fuel_telemetry_batch',
    submittedAt: '2 hours ago',
    status: 'OPEN'
  },
  {
    id: 'rev-04',
    invoiceNumber: 'FDR-77102-HW',
    vendorName: 'Gulf Marine Stevedoring & Wharfage',
    total: 7024.00,
    violationType: 'OCR Confidence Below 0.950 STP Threshold (0.941)',
    calculatedSum: 7024.00,
    expectedSum: 7024.00,
    submittedBy: 'dock_scanner_terminal',
    submittedAt: '3 hours ago',
    status: 'OPEN'
  },
  {
    id: 'rev-05',
    invoiceNumber: 'GRN-4491-B',
    vendorName: 'Stratos Advanced Alloys Ltd',
    total: 41400.00,
    violationType: 'Physical Receiving Weight Discrepancy (Δ 80 kg)',
    calculatedSum: 41400.00,
    expectedSum: 45000.00,
    submittedBy: 'warehouse_scale_feeder',
    submittedAt: '4 hours ago',
    status: 'OPEN'
  }
];

export const ReviewQueueView: React.FC = () => {
  const { currentRole } = useActiveRole();
  const [queue, setQueue] = useState<ReviewItem[]>(INITIAL_QUEUE);
  const [feedback, setFeedback] = useState<{ id: string; message: string; type: 'success' | 'danger' } | null>(null);

  const canApprove = hasPermission(currentRole, 'APPROVE_INVARIANTS') || hasPermission(currentRole, 'review.approve') || hasPermission(currentRole, 'review.override');

  const handleResolve = (id: string, action: 'RESOLVED' | 'REJECTED') => {
    if (!canApprove) return;
    setQueue(prev => prev.map(item => item.id === id ? { ...item, status: action } : item));
    const target = queue.find(q => q.id === id);
    setFeedback({
      id,
      type: action === 'RESOLVED' ? 'success' : 'danger',
      message: action === 'RESOLVED'
        ? `Invoice #${target?.invoiceNumber || id} signed and authorized by ${currentRole.replace(/_/g, ' ')}. Dual-custody audit logged.`
        : `Invoice #${target?.invoiceNumber || id} rejected by ${currentRole.replace(/_/g, ' ')}. Quarantined for supplier review.`,
    });
    setTimeout(() => setFeedback(null), 4000);
  };

  const openCount = queue.filter(q => q.status === 'OPEN').length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono text-ops-cyan">[ 03 / 07 ]</span>
            <span className="text-xs font-mono text-white/40">• DUAL-CUSTODY AUDIT GATE</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Segregation of Duties (SoD) Review Queue
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
            {openCount} ACTIVE EXCEPTIONS
          </span>
        </div>
      </div>

      {/* Action Notification Toast */}
      {feedback && (
        <div className={`p-4 rounded-xl border flex items-center justify-between text-xs font-mono transition-all animate-in fade-in duration-200 ${
          feedback.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-400" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-white/40 hover:text-white">✕</button>
        </div>
      )}

      {/* SoD Permission Barrier Alert */}
      {!canApprove && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-amber-400 font-mono text-xs">
          <Lock className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-sm text-white mb-0.5">Segregation of Duties Enforcement Active</div>
            <div>
              Your authenticated role <strong className="text-white underline">{currentRole}</strong> does not possess review approval or invariant override authority. Under enterprise Segregation of Duties (SoD) policies, sign-off on exception items requires an authorized <strong className="text-white">REVIEWER</strong> or <strong className="text-white">WORKSPACE_ADMIN</strong>.
            </div>
          </div>
        </div>
      )}

      {/* Review Queue Items */}
      <div className="space-y-4">
        {queue.map((item) => {
          const isResolved = item.status === 'RESOLVED';
          const isRejected = item.status === 'REJECTED';
          const variance = Math.abs(item.calculatedSum - item.expectedSum);

          return (
            <GlowCard key={item.id} className="p-6 transition-all">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                {/* Details */}
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-white">#{item.invoiceNumber}</span>
                    <span className="text-xs font-mono text-white/40">•</span>
                    <span className="text-xs font-semibold text-white/80">{item.vendorName}</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                      isResolved
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : isRejected
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    }`}>
                      {item.status}
                    </span>
                  </div>

                  <div className="text-xs font-mono text-amber-400 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{item.violationType} (Δ ${variance.toFixed(2)})</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-white/50">
                    <span>Document Total: ${item.total.toLocaleString()}</span>
                    <span>•</span>
                    <span>Computed: ${item.calculatedSum.toFixed(2)}</span>
                    <span>•</span>
                    <span>Submitted by: {item.submittedBy}</span>
                    <span>•</span>
                    <span>{item.submittedAt}</span>
                  </div>
                </div>

                {/* Dual-Custody Action Buttons */}
                <div className="flex items-center gap-3 shrink-0">
                  {item.status === 'OPEN' ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canApprove}
                        icon={<X className="w-4 h-4 text-rose-400" />}
                        onClick={() => handleResolve(item.id, 'REJECTED')}
                      >
                        Reject
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!canApprove}
                        icon={<Check className="w-4 h-4" />}
                        onClick={() => handleResolve(item.id, 'RESOLVED')}
                      >
                        Sign & Authorize
                      </Button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-xs font-mono text-white/60">
                      {isResolved ? (
                        <span className="text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" /> Dual-Custody Signed
                        </span>
                      ) : (
                        <span className="text-rose-400 flex items-center gap-1.5">
                          <XCircle className="w-4 h-4" /> Override Rejected
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </GlowCard>
          );
        })}
      </div>
    </div>
  );
};
