import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../services/permissions';
import { api } from '../../services/api';
import { Document, DashboardStats } from '../../types';
import { GlowCard } from '../../components/ui/GlowCard';
import { Button } from '../../components/ui/Button';
import { SectionBadge } from '../../components/ui/SectionBadge';
import { 
  FileText, 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  Clock, 
  ArrowRight,
  ShieldCheck,
  Cpu,
  Layers,
  CheckCheck
} from 'lucide-react';

export const WorkspaceDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const activeRole = user?.role || 'VIEWER';
  const canUpload = hasPermission(activeRole, 'documents.upload') || hasPermission(activeRole, 'UPLOAD_DOCUMENTS');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true);
        const [statsData, docsData] = await Promise.all([
          api.getStats(),
          api.getDocuments()
        ]);
        setStats(statsData);
        setDocuments(docsData);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboardData();
  }, []);

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono text-ops-cyan">[ 01 / 07 ]</span>
            <span className="text-xs font-mono text-white/40">• OPERATIONAL DASHBOARD</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Financial Invariants & Reconciler Overview
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/workspace/documents')}
            icon={<FileText className="w-4 h-4" />}
          >
            All Documents
          </Button>
          {canUpload ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/workspace/documents')}
              icon={<Upload className="w-4 h-4" />}
            >
              Upload Invoices
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/workspace/review')}
              icon={<CheckCheck className="w-4 h-4" />}
            >
              Review Exceptions
            </Button>
          )}
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <GlowCard className="p-5">
          <div className="flex items-center justify-between text-xs font-mono text-white/50 mb-3">
            <span>TOTAL VOLUME</span>
            <FileText className="w-4 h-4 text-ops-cyan" />
          </div>
          <div className="text-3xl font-bold font-mono text-white mb-1">
            {stats ? stats.totalDocuments.toLocaleString() : '1,420'}
          </div>
          <div className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            <span>+14.2% from last cycle</span>
          </div>
        </GlowCard>

        {/* KPI 2 */}
        <GlowCard className="p-5" glowColor="rgba(0, 255, 204, 0.2)">
          <div className="flex items-center justify-between text-xs font-mono text-white/50 mb-3">
            <span>INVARIANT PASS RATE</span>
            <ShieldCheck className="w-4 h-4 text-ops-cyan" />
          </div>
          <div className="text-3xl font-bold font-mono text-ops-cyan mb-1">
            {stats ? `${stats.invariantPassRate}%` : '99.4%'}
          </div>
          <div className="text-[11px] text-white/50 font-mono">
            Zero cent-level arithmetic leakage
          </div>
        </GlowCard>

        {/* KPI 3 */}
        <GlowCard className="p-5" glowColor="rgba(12, 113, 255, 0.2)">
          <div className="flex items-center justify-between text-xs font-mono text-white/50 mb-3">
            <span>TOUCHLESS STP RATE</span>
            <Cpu className="w-4 h-4 text-ops-blue" />
          </div>
          <div className="text-3xl font-bold font-mono text-white mb-1">
            {stats ? `${stats.straightThroughRate}%` : '89.6%'}
          </div>
          <div className="text-[11px] text-ops-blue font-mono">
            Auto-cleared into ERP ledgers
          </div>
        </GlowCard>

        {/* KPI 4 */}
        <GlowCard className="p-5" glowColor="rgba(255, 239, 20, 0.2)">
          <div className="flex items-center justify-between text-xs font-mono text-white/50 mb-3">
            <span>REQUIRES REVIEW</span>
            <AlertTriangle className="w-4 h-4 text-ops-yellow" />
          </div>
          <div className="text-3xl font-bold font-mono text-ops-yellow mb-1">
            {stats ? stats.pendingReview : '4'}
          </div>
          <div className="text-[11px] text-ops-yellow/80 font-mono">
            Dual-custody verification queue
          </div>
        </GlowCard>
      </div>

      {/* Main Grid: Review Alert Banner & Recent Documents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Invariant & Review Stream */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-ops-cyan" />
              Live Ingestion & Processing Feed
            </h2>
            <button
              onClick={() => navigate('/workspace/documents')}
              className="text-xs font-mono text-ops-cyan hover:underline flex items-center gap-1"
            >
              View All <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {documents.slice(0, 5).map((doc) => {
              const isViolation = doc.status === 'INVARIANT_VIOLATION';
              const isValidated = doc.status === 'VALIDATED';
              return (
                <div
                  key={doc.id}
                  onClick={() => navigate(`/workspace/documents/${doc.id}`)}
                  className="p-4 rounded-xl bg-[#121320] border border-white/[0.06] hover:border-white/20 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer group"
                >
                  <div className="flex items-center gap-3.5">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-mono text-xs font-bold ${
                      isViolation 
                        ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400' 
                        : isValidated
                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                        : 'bg-ops-blue/10 border border-ops-blue/30 text-ops-blue'
                    }`}>
                      {doc.currency === 'USD' ? '$' : '€'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white group-hover:text-ops-cyan transition-colors">
                          {doc.vendorName}
                        </span>
                        <span className="text-xs font-mono text-white/40">
                          #{doc.invoiceNumber}
                        </span>
                      </div>
                      <div className="text-xs text-white/50 font-mono mt-0.5">
                        {new Date(doc.createdAt).toLocaleDateString()} • {doc.lineItems.length} Line Items
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    <div className="text-right">
                      <div className="text-sm font-bold font-mono text-white">
                        ${doc.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] font-mono text-white/40">
                        CONF: {(doc.confidenceScore * 100).toFixed(0)}%
                      </div>
                    </div>

                    <span className={`text-[10px] font-mono uppercase px-2.5 py-1 rounded-full border ${
                      isViolation
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        : isValidated
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-ops-blue/10 border-ops-blue/30 text-ops-blue'
                    }`}>
                      {doc.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Col: Quick Triage & Dual-Custody Action Box */}
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-ops-cyan" />
            Dual-Custody Action Box
          </h2>

          <GlowCard className="p-6">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-4">
              <span className="text-xs font-mono text-white/40">[ ACTIVE_GATE ]</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                2 PENDING APPROVAL
              </span>
            </div>

            <p className="text-xs text-white/60 leading-relaxed mb-6 font-sans">
              Segregation of duties policy requires an authorized <strong className="text-white">REVIEWER</strong> or <strong className="text-white">WORKSPACE_ADMIN</strong> to verify flagged line items before ERP ledger commit.
            </p>

            <div className="space-y-3 mb-6">
              <div className="p-3 rounded-lg bg-[#0E0F1A] border border-white/[0.06] text-xs font-mono">
                <div className="flex justify-between text-white/80 mb-1">
                  <span>INV-2024-8841</span>
                  <span className="text-amber-400">Δ $14.20 Subtotal Mismatch</span>
                </div>
                <div className="text-[10px] text-white/40">Global Logistics Corp • Submitted 22m ago</div>
              </div>

              <div className="p-3 rounded-lg bg-[#0E0F1A] border border-white/[0.06] text-xs font-mono">
                <div className="flex justify-between text-white/80 mb-1">
                  <span>INV-2024-9022</span>
                  <span className="text-amber-400">Tax Invariant: 8.25% Expected</span>
                </div>
                <div className="text-[10px] text-white/40">Vortex Industrial • Submitted 1h ago</div>
              </div>
            </div>

            <Button
              variant="gradient"
              fullWidth
              size="sm"
              onClick={() => navigate('/workspace/review')}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Open Dual-Custody Review
            </Button>
          </GlowCard>
        </div>
      </div>
    </div>
  );
};
