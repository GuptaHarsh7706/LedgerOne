import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveRole, hasPermission } from '../../services/permissions';
import { api } from '../../services/api';
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
  ArrowRight,
  RotateCw,
  FileText
} from 'lucide-react';

interface ReviewQueueItem {
  id: string;
  filename: string;
  status: string;
  category: string;
  mean_confidence: number;
  metadata?: Record<string, any>;
  created_at: string;
}

export const ReviewQueueView: React.FC = () => {
  const navigate = useNavigate();
  const { currentRole } = useActiveRole();
  const [queue, setQueue] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{ id: string; message: string; type: 'success' | 'danger' } | null>(null);

  const canApprove = hasPermission(currentRole, 'APPROVE_INVARIANTS') || hasPermission(currentRole, 'review.approve') || hasPermission(currentRole, 'review.override');

  const loadQueue = async () => {
    try {
      setLoading(true);
      const items = await api.getReviewQueue();
      setQueue(items);
    } catch (err) {
      console.error('Failed to load review queue from PostgreSQL:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handleResolve = async (id: string, action: 'APPROVE' | 'REJECT') => {
    if (!canApprove) {
      setFeedback({
        id,
        type: 'danger',
        message: `Action blocked: Role '${currentRole}' lacks review approval permissions.`,
      });
      setTimeout(() => setFeedback(null), 5000);
      return;
    }

    try {
      if (action === 'APPROVE') {
        await api.approveDocument(id);
        setFeedback({
          id,
          type: 'success',
          message: `Document approved and signed off by ${currentRole.replace(/_/g, ' ')}. Dual-custody audit logged in PostgreSQL.`,
        });
      } else {
        await api.rejectDocument(id, 'Quarantined in SoD review queue');
        setFeedback({
          id,
          type: 'danger',
          message: `Document rejected by ${currentRole.replace(/_/g, ' ')}. Quarantined in PostgreSQL audit ledger.`,
        });
      }
      await loadQueue();
    } catch (err: any) {
      console.error('Review action failed:', err);
      setFeedback({
        id,
        type: 'danger',
        message: `Operation rejected by backend: ${err?.message || 'Segregation of duties violation or invalid verification status.'}`,
      });
    }
    setTimeout(() => setFeedback(null), 6000);
  };

  const openCount = queue.filter(q => q.status === 'NEEDS_REVIEW' || q.status === 'IN_REVIEW' || q.status === 'AWAITING_REVIEW' || q.status === 'QUEUED').length;

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
          <Button
            variant="outline"
            size="sm"
            onClick={loadQueue}
            disabled={loading}
            icon={<RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh Queue
          </Button>
          <span className="text-xs font-mono px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
            {openCount} ACTIVE ITEMS
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
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-white/40 hover:text-white ml-4">✕</button>
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
        {queue.length === 0 && !loading && (
          <div className="p-12 text-center rounded-2xl bg-[#0D0E1A] border border-white/[0.08] text-white/50 font-mono text-xs">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
            No documents currently quarantined in the review queue. All documents conform to accounting invariants.
          </div>
        )}

        {queue.map((item) => {
          const isResolved = item.status === 'VERIFIED' || item.status === 'COMPLETED';
          const isRejected = item.status === 'REJECTED';
          const meta = item.metadata || {};
          const invoiceNum = meta.invoice_number || `DOC-${item.id.slice(0, 8).toUpperCase()}`;
          const vendor = meta.vendor_name || meta.vendor || item.filename;
          const totalAmt = Number(meta.total_amount || meta.gross_total || 0);

          return (
            <GlowCard key={item.id} className="p-6 transition-all">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                {/* Details */}
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-white">#{invoiceNum}</span>
                    <span className="text-xs font-mono text-white/40">•</span>
                    <span className="text-xs font-semibold text-white/80">{vendor}</span>
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
                    <span>Optical Confidence: {(item.mean_confidence * 100).toFixed(1)}% • Category: {item.category}</span>
                  </div>

                  <div className="text-[11px] font-mono text-white/40 flex items-center gap-4">
                    <span>File: {item.filename}</span>
                    <span>•</span>
                    <span className="text-white/60">Billed: ${totalAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    <span>•</span>
                    <span>Created: {new Date(item.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/workspace/documents/${item.id}`)}
                    icon={<FileText className="w-4 h-4 text-ops-cyan" />}
                  >
                    Inspect in Studio
                  </Button>

                  {!isResolved && !isRejected && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canApprove}
                        onClick={() => handleResolve(item.id, 'REJECT')}
                        icon={<X className="w-4 h-4 text-rose-400" />}
                      >
                        Reject
                      </Button>

                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!canApprove}
                        onClick={() => handleResolve(item.id, 'APPROVE')}
                        icon={<Check className="w-4 h-4" />}
                      >
                        Sign & Authorize
                      </Button>
                    </>
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
