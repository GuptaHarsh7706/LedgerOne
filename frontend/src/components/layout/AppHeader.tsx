import React, { useState } from 'react';
import { useAuth, PERSONA_PRESETS } from '../../context/AuthContext';
import { ROLE_LABELS } from '../../services/permissions';
import { 
  Shield, 
  Database, 
  Cpu, 
  ChevronDown, 
  Check, 
  Lock, 
  LogOut, 
  Users, 
  ArrowRight,
  Sparkles
} from 'lucide-react';

interface AppHeaderProps {
  onToggleSidebar?: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = () => {
  const { user, switchPersona, logout, isLoading } = useAuth();
  const [personaModalOpen, setPersonaModalOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const activeRole = user?.role || 'VIEWER';
  const roleMeta = ROLE_LABELS[activeRole] || { label: activeRole, badge: 'Standard', description: '' };

  const getRoleInitials = (role: string) => {
    const parts = role.split('_');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return role.substring(0, 2).toUpperCase();
  };

  return (
    <>
      <header className="h-16 border-b border-white/[0.08] bg-[#0E0F1A]/80 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between">
        {/* Left: Real Multi-Tenant Workspace Context */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#141524] border border-white/[0.08] text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-ops-cyan animate-pulse" />
            <span className="text-white/40">WORKSPACE:</span>
            <span className="text-white font-semibold">{user?.ws_name || 'Production Financial Core'}</span>
            <span className="text-white/20">/</span>
            <span className="text-ops-cyan truncate max-w-[140px] sm:max-w-none">
              ENTERPRISE CORE
            </span>
          </div>
        </div>

        {/* Right Controls: Engine Health, Real RBAC Badge, and Authenticated User Menu */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Hardware & Cloud Health Badges */}
          <div className="hidden lg:flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#141524] border border-white/[0.06] text-[11px] font-mono text-white/70">
              <Cpu className="w-3.5 h-3.5 text-ops-cyan" />
              <span>RTX 3050 CUDA 12.4</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#141524] border border-white/[0.06] text-[11px] font-mono text-white/70">
              <Database className="w-3.5 h-3.5 text-ops-blue" />
              <span>Neon PG 18.6 RLS</span>
            </div>
          </div>

          {/* Real RBAC Security Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-ops-blue/15 border border-ops-blue/40 text-xs font-mono text-white shadow-[0_0_15px_rgba(12,113,255,0.15)]">
            <Lock className="w-3.5 h-3.5 text-ops-cyan" />
            <span className="hidden sm:inline text-white/60">ROLE:</span>
            <span className="font-semibold text-ops-cyan tracking-wider">{activeRole}</span>
            <span className="hidden xl:inline text-[10px] px-1.5 py-0.5 rounded bg-white/[0.08] text-white/50">
              RLS-ENFORCED
            </span>
          </div>

          {/* User Profile & Role Switcher */}
          <div className="relative">
            <button
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="flex items-center gap-2.5 p-1 rounded-xl hover:bg-white/[0.04] transition-colors focus:outline-none"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-ops-blue via-ops-cyan to-ops-yellow p-[1px]">
                <div className="w-full h-full rounded-full bg-[#0E0F1A] flex items-center justify-center text-[11px] font-mono font-bold text-ops-cyan">
                  {getRoleInitials(activeRole)}
                </div>
              </div>
              <div className="hidden md:flex flex-col text-left">
                <span className="text-xs font-bold font-mono text-white truncate max-w-[140px]">
                  {activeRole.replace(/_/g, ' ')}
                </span>
                <span className="text-[10px] font-mono text-ops-cyan/70 truncate max-w-[140px]">
                  {roleMeta.badge}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-white/40" />
            </button>

            {userDropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-[#141524] border border-white/[0.12] shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-4 py-3 border-b border-white/[0.08]">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-bold font-mono text-white tracking-wide">
                      {activeRole.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-ops-cyan/10 text-ops-cyan border border-ops-cyan/20">
                      {roleMeta.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/50 leading-relaxed mt-1">
                    {roleMeta.description}
                  </p>
                </div>

                <div className="p-1">
                  <button
                    onClick={() => {
                      setUserDropdownOpen(false);
                      setPersonaModalOpen(true);
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between text-xs text-white/80 hover:text-white hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Users className="w-4 h-4 text-ops-cyan" />
                      <span>Switch Enterprise Role...</span>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ops-cyan/15 text-ops-cyan">
                      8 ROLES
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setUserDropdownOpen(false);
                      logout();
                      window.location.href = '/';
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-2.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Verified SaaS Role Switcher Modal (Identical to Login Page Layout) */}
      {personaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl rounded-2xl bg-[#111220] border border-white/[0.15] shadow-2xl p-6 sm:p-7 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-5">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-4 h-4 text-ops-cyan" />
                  <span className="text-xs font-mono uppercase tracking-widest text-ops-cyan">
                    ENTERPRISE ROLES & SOD POLICIES
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white">
                  Switch Enterprise Role
                </h2>
                <p className="text-xs text-white/60 mt-1">
                  Select any verified enterprise role to test full RBAC permissions and Segregation of Duties.
                </p>
              </div>
              <button
                onClick={() => setPersonaModalOpen(false)}
                className="text-white/40 hover:text-white text-xs font-mono px-2.5 py-1 rounded-lg border border-white/10 hover:border-white/20"
              >
                ESC / CLOSE
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {PERSONA_PRESETS.map((p) => {
                const isCurrent = user?.role === p.role;
                return (
                  <button
                    key={p.key}
                    disabled={isLoading}
                    onClick={async () => {
                      await switchPersona(p.key);
                      setPersonaModalOpen(false);
                    }}
                    className={`p-3.5 rounded-xl border text-left transition-all duration-200 group flex flex-col justify-between ${
                      isCurrent
                        ? 'bg-ops-cyan/15 border-ops-cyan text-white shadow-[0_0_20px_rgba(0,255,204,0.15)] ring-1 ring-ops-cyan'
                        : 'bg-[#141526] border-white/[0.08] hover:border-ops-cyan/40 hover:bg-[#181930] text-left'
                    }`}
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

                    <div className="mt-3.5 pt-2 border-t border-white/[0.06] flex items-center justify-between text-[10px] font-mono">
                      {isCurrent ? (
                        <span className="text-ops-cyan font-bold flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> ACTIVE ROLE
                        </span>
                      ) : (
                        <span className="text-white/40 group-hover:text-white transition-colors">
                          Verified Role
                        </span>
                      )}
                      <span className="text-ops-cyan font-semibold flex items-center gap-1">
                        Select <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="p-3.5 rounded-xl bg-[#161728] border border-white/[0.06] flex items-center justify-between text-xs font-mono text-white/60">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-ops-blue" />
                <span>Backend Segregation: Dual custody & cross-tenant RLS are fully active.</span>
              </div>
              <span className="text-[10px] text-ops-cyan font-mono">PGVECTOR + NEON</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
