import React from 'react';
import { useActiveRole } from '../../services/permissions';
import { Role } from '../../types';
import { Shield, Sparkles, Database, Cpu, ChevronDown, Check, User } from 'lucide-react';

const ROLES: { role: Role; label: string; desc: string }[] = [
  { role: 'PLATFORM_ADMIN', label: 'Platform Admin', desc: 'Full root access across all tenants' },
  { role: 'ORGANIZATION_ADMIN', label: 'Org Admin', desc: 'Manages workspaces, billing & users' },
  { role: 'WORKSPACE_ADMIN', label: 'Workspace Admin', desc: 'Controls workspace policies & integrations' },
  { role: 'DOCUMENT_MANAGER', label: 'Document Manager', desc: 'Can upload, re-run OCR & edit extractions' },
  { role: 'REVIEWER', label: 'Reviewer (Dual-Custody)', desc: 'Approves/rejects financial invariants' },
  { role: 'ANALYST', label: 'Analyst', desc: 'Read-only analytics & trend telemetry' },
  { role: 'VIEWER', label: 'Viewer', desc: 'Audit-only read access' }
];

interface AppHeaderProps {
  onToggleSidebar?: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = () => {
  const { currentRole, setRole } = useActiveRole();
  const [roleMenuOpen, setRoleMenuOpen] = React.useState(false);

  return (
    <header className="h-16 border-b border-white/[0.08] bg-[#0E0F1A]/80 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between">
      {/* Left: Organization & Environment Breadcrumb */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#141524] border border-white/[0.08] text-xs font-mono">
          <span className="w-2 h-2 rounded-full bg-ops-cyan animate-pulse" />
          <span className="text-white/40">TENANT:</span>
          <span className="text-white font-semibold">LedgerOne Global Corp</span>
          <span className="text-white/20">/</span>
          <span className="text-ops-cyan">Production-US-East</span>
        </div>
      </div>

      {/* Right Controls: Engine Status, Role Switcher, and User Profile */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Hardware & DB Health Badges */}
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

        {/* Role Simulator Pill & Dropdown */}
        <div className="relative">
          <button
            onClick={() => setRoleMenuOpen(!roleMenuOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-ops-blue/15 border border-ops-blue/40 text-xs font-mono text-white hover:bg-ops-blue/25 transition-colors"
          >
            <Shield className="w-3.5 h-3.5 text-ops-cyan" />
            <span className="hidden sm:inline text-white/60">ROLE:</span>
            <span className="font-semibold text-ops-cyan">{currentRole}</span>
            <ChevronDown className="w-3.5 h-3.5 text-white/50" />
          </button>

          {roleMenuOpen && (
            <div className="absolute right-0 mt-2 w-72 rounded-xl bg-[#151624] border border-white/[0.12] shadow-2xl py-2 z-50">
              <div className="px-3 py-2 border-b border-white/[0.06] text-[10px] font-mono uppercase tracking-wider text-white/40">
                Simulate 7-Tier Enterprise RBAC
              </div>
              <div className="max-h-72 overflow-y-auto">
                {ROLES.map((r) => {
                  const isSelected = currentRole === r.role;
                  return (
                    <button
                      key={r.role}
                      onClick={() => {
                        setRole(r.role);
                        setRoleMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between text-xs hover:bg-white/[0.04] transition-colors ${
                        isSelected ? 'bg-ops-blue/20 text-white' : 'text-white/70'
                      }`}
                    >
                      <div>
                        <div className="font-semibold font-mono text-white">{r.label}</div>
                        <div className="text-[10px] text-white/40">{r.desc}</div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-ops-cyan" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* User Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-ops-blue to-ops-cyan p-[1px]">
          <div className="w-full h-full rounded-full bg-[#0E0F1A] flex items-center justify-center text-xs font-mono font-bold text-white">
            JD
          </div>
        </div>
      </div>
    </header>
  );
};
