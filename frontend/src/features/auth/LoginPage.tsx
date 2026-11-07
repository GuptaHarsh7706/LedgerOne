import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, PERSONA_PRESETS } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { GlowCard } from '../../components/ui/GlowCard';
import { 
  Shield, 
  Lock, 
  ArrowRight, 
  Key, 
  Building2, 
  CheckCircle2, 
  Cpu, 
  Database,
  AlertCircle
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, switchPersona, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      navigate('/workspace');
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please verify credentials.');
    }
  };

  const handleSelectPersona = async (key: string) => {
    setError(null);
    try {
      await switchPersona(key);
      navigate('/workspace');
    } catch (err: any) {
      setError(err?.message || 'Persona authentication failed.');
    }
  };

  return (
    <div className="min-h-screen bg-[#07080E] text-white flex flex-col justify-between p-4 sm:p-8 relative overflow-hidden font-sans">
      {/* Background radial gradients matching Opsayra aesthetic */}
      <div className="absolute top-[-15%] left-[20%] w-[600px] h-[600px] bg-ops-blue/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[15%] w-[500px] h-[500px] bg-ops-cyan/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Top Bar: Brand & System Badges */}
      <div className="max-w-6xl mx-auto w-full flex items-center justify-between pb-6 border-b border-white/[0.08] relative z-10">
        <button onClick={() => navigate('/')} className="flex items-center gap-3 text-left group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-ops-blue via-ops-cyan to-ops-yellow p-[1px] group-hover:shadow-[0_0_20px_rgba(0,255,204,0.3)] transition-all">
            <div className="w-full h-full bg-[#0B0C15] rounded-[11px] flex items-center justify-center">
              <span className="font-mono font-black text-sm text-white">L1</span>
            </div>
          </div>
          <div>
            <span className="font-bold text-base tracking-tight text-white block">LedgerOne</span>
            <span className="text-[10px] font-mono text-ops-cyan uppercase tracking-widest block">
              ENTERPRISE SAAS GATEWAY
            </span>
          </div>
        </button>

        <div className="hidden sm:flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[#141524] border border-white/[0.08] text-xs font-mono text-white/70">
            <Database className="w-3.5 h-3.5 text-ops-blue" />
            <span>Neon PG 18.6 RLS</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[#141524] border border-white/[0.08] text-xs font-mono text-white/70">
            <Cpu className="w-3.5 h-3.5 text-ops-cyan" />
            <span>RTX 3050 CUDA 12.4</span>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-6xl mx-auto w-full my-auto py-10 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Direct Credential Authentication Form (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ops-cyan/10 border border-ops-cyan/30 text-ops-cyan text-xs font-mono mb-3">
              <Lock className="w-3.5 h-3.5" />
              <span>SOC2 TYPE II COMPLIANT AUTH</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Sign In to Your Workspace
            </h1>
            <p className="text-xs text-white/60 mt-1.5 leading-relaxed">
              Authenticate using corporate credentials. Access is governed by PostgreSQL Row-Level Security and canonical 7-tier RBAC.
            </p>
          </div>

          <GlowCard className="p-6 sm:p-7">
            {error && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono mb-5 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-mono text-white/70 block mb-1.5">
                  Corporate Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="controller@apexcapital.internal"
                  className="w-full px-4 py-3 rounded-xl bg-[#0E0F1A] border border-white/10 text-white text-xs font-mono focus:border-ops-cyan focus:outline-none transition-colors"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-mono text-white/70">
                    Corporate Password
                  </label>
                  <span className="text-[10px] font-mono text-white/40">Authorized SSO / Password</span>
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-[#0E0F1A] border border-white/10 text-white text-xs font-mono focus:border-ops-cyan focus:outline-none transition-colors"
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full justify-center mt-2"
                disabled={isLoading}
                icon={<ArrowRight className="w-4 h-4" />}
              >
                {isLoading ? 'Authenticating...' : 'Authenticate & Launch'}
              </Button>
            </form>

            <div className="mt-5 pt-4 border-t border-white/[0.08] text-center">
              <span className="text-[11px] font-mono text-white/40">
                Argon2id Key Derivation • Dual-Custody Gated
              </span>
            </div>
          </GlowCard>
        </div>

        {/* Right Column: Pre-Provisioned Multi-Tenant SaaS Personas (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
            <div>
              <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-white">
                One-Click Enterprise Personas
              </h2>
              <p className="text-[11px] text-white/50">
                Select any verified tenant account to test full RBAC permissions and Segregation of Duties.
              </p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-ops-blue/20 text-ops-cyan border border-ops-blue/30">
              8 TEST ACCOUNTS
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[520px] overflow-y-auto pr-1">
            {PERSONA_PRESETS.map((p) => (
              <button
                key={p.key}
                disabled={isLoading}
                onClick={() => handleSelectPersona(p.key)}
                className="p-3.5 rounded-xl bg-[#111220] border border-white/[0.08] hover:border-ops-cyan/40 hover:bg-[#141526] text-left transition-all duration-200 group flex flex-col justify-between"
              >
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-bold font-mono uppercase tracking-wide text-white group-hover:text-ops-cyan transition-colors">
                      {p.role.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-ops-cyan/10 text-ops-cyan border border-ops-cyan/20 shrink-0">
                      {p.badge || p.role}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/60 leading-relaxed">
                    {p.description}
                  </p>
                </div>

                <div className="mt-3.5 pt-2 border-t border-white/[0.06] flex items-center justify-between text-[10px] font-mono text-white/40 group-hover:text-white transition-colors">
                  <span className="truncate">{p.orgName}</span>
                  <span className="text-ops-cyan font-semibold flex items-center gap-1">
                    Select Role <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer System Status */}
      <div className="max-w-6xl mx-auto w-full pt-6 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] font-mono text-white/40 relative z-10">
        <div>LedgerOne Core OS • Production Release Standard</div>
        <div className="flex items-center gap-4">
          <span>PostgreSQL 18.6 RLS</span>
          <span>•</span>
          <span>Dual Custody AUTH_SOD_001</span>
          <span>•</span>
          <span>pgvector 1536d</span>
        </div>
      </div>
    </div>
  );
};
