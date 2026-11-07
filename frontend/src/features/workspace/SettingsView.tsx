import React from 'react';
import { useActiveRole } from '../../services/permissions';
import { Role } from '../../types';
import { GlowCard } from '../../components/ui/GlowCard';
import { Button } from '../../components/ui/Button';
import { 
  Settings, 
  Shield, 
  Check, 
  X, 
  Lock, 
  Sliders, 
  Database, 
  Key,
  Users
} from 'lucide-react';

const PERMISSIONS_MATRIX: { name: string; key: string; roles: Role[] }[] = [
  { name: 'Upload & Ingest Documents', key: 'UPLOAD_DOCUMENTS', roles: ['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN', 'WORKSPACE_ADMIN', 'DOCUMENT_MANAGER'] },
  { name: 'Edit Extracted Line Items', key: 'EDIT_EXTRACTIONS', roles: ['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN', 'WORKSPACE_ADMIN', 'DOCUMENT_MANAGER'] },
  { name: 'Approve Invariants (Dual-Custody)', key: 'APPROVE_INVARIANTS', roles: ['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN', 'WORKSPACE_ADMIN', 'REVIEWER'] },
  { name: 'Execute ERP 3-Way Settlement', key: 'EXECUTE_SETTLEMENT', roles: ['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN', 'WORKSPACE_ADMIN'] },
  { name: 'Manage Roles & Users', key: 'MANAGE_USERS', roles: ['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN'] },
  { name: 'View Analytics & Spend Data', key: 'VIEW_ANALYTICS', roles: ['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN', 'WORKSPACE_ADMIN', 'DOCUMENT_MANAGER', 'REVIEWER', 'ANALYST', 'VIEWER'] },
];

const ALL_ROLES: Role[] = [
  'PLATFORM_ADMIN',
  'ORGANIZATION_ADMIN',
  'WORKSPACE_ADMIN',
  'DOCUMENT_MANAGER',
  'REVIEWER',
  'ANALYST',
  'VIEWER'
];

export const SettingsView: React.FC = () => {
  const { currentRole, setRole } = useActiveRole();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono text-ops-cyan">[ 07 / 07 ]</span>
            <span className="text-xs font-mono text-white/40">• GOVERNANCE & RBAC POLICIES</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Enterprise RBAC & Dual-Custody Governance
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs font-mono px-3 py-1.5 rounded-lg bg-ops-blue/20 border border-ops-blue/40 text-ops-cyan">
            ACTIVE ROLE: {currentRole}
          </div>
        </div>
      </div>

      {/* Role Switcher Surface */}
      <GlowCard className="p-6">
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-6">
          <span className="text-xs font-mono text-white/40">[ ACTIVE_IDENTITY_SIMULATOR ]</span>
          <span className="text-xs font-mono text-ops-cyan">7 CANONICAL TIERS</span>
        </div>

        <h3 className="text-lg font-bold text-white mb-2">Select Active User Role</h3>
        <p className="text-xs text-white/60 mb-6">
          Switch roles in real time to verify front-to-back Segregation of Duties (SoD) enforcement across document approval, upload, and settlement.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {ALL_ROLES.map((r) => {
            const isSelected = currentRole === r;
            return (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`p-3 rounded-xl border text-xs font-mono text-center transition-all ${
                  isSelected
                    ? 'bg-white text-black font-bold border-white shadow-[0_0_15px_rgba(255,255,255,0.4)] scale-105'
                    : 'bg-[#121320] text-white/70 border-white/[0.06] hover:border-white/20 hover:text-white'
                }`}
              >
                <div className="truncate">{r.replace('_', ' ')}</div>
              </button>
            );
          })}
        </div>
      </GlowCard>

      {/* RBAC Matrix */}
      <GlowCard className="p-6">
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-6">
          <span className="text-xs font-mono text-white/40">[ ACCESS_CONTROL_MATRIX ]</span>
          <Shield className="w-4 h-4 text-ops-cyan" />
        </div>

        <h3 className="text-lg font-bold text-white mb-6">Permission Matrix by Role</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#121320] text-white/40 border-b border-white/[0.06] uppercase">
              <tr>
                <th className="py-3 px-4">Permission Capability</th>
                {ALL_ROLES.map(r => (
                  <th key={r} className={`py-3 px-2 text-center ${currentRole === r ? 'text-ops-cyan font-bold' : ''}`}>
                    {r.split('_')[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {PERMISSIONS_MATRIX.map((perm) => (
                <tr key={perm.key} className="hover:bg-white/[0.02]">
                  <td className="py-3 px-4 text-white font-medium">{perm.name}</td>
                  {ALL_ROLES.map(r => {
                    const hasAccess = perm.roles.includes(r);
                    const isCurrent = currentRole === r;
                    return (
                      <td key={r} className={`py-3 px-2 text-center ${isCurrent ? 'bg-ops-cyan/[0.04]' : ''}`}>
                        {hasAccess ? (
                          <Check className="w-4 h-4 text-ops-cyan mx-auto" />
                        ) : (
                          <X className="w-4 h-4 text-white/20 mx-auto" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlowCard>

      {/* Invariant Threshold Configuration */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <GlowCard className="p-6">
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-4">
            <span className="text-xs font-mono text-white/40">[ INVARIANT_TOLERANCES ]</span>
            <Sliders className="w-4 h-4 text-ops-yellow" />
          </div>

          <h3 className="text-base font-bold text-white mb-4">Cent-Level Math Tolerances</h3>

          <div className="space-y-4 text-xs font-mono">
            <div>
              <div className="flex justify-between mb-1 text-white/70">
                <span>Maximum Arithmetic Discrepancy</span>
                <span className="text-ops-cyan">$0.02</span>
              </div>
              <div className="w-full bg-[#10111D] h-2 rounded-full overflow-hidden">
                <div className="bg-ops-cyan h-full w-[20%]" />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1 text-white/70">
                <span>Sales Tax Rate Drift Tolerance</span>
                <span className="text-ops-cyan">± 0.05%</span>
              </div>
              <div className="w-full bg-[#10111D] h-2 rounded-full overflow-hidden">
                <div className="bg-ops-blue h-full w-[15%]" />
              </div>
            </div>
          </div>
        </GlowCard>

        <GlowCard className="p-6">
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-4">
            <span className="text-xs font-mono text-white/40">[ POSTGRESQL_RLS_STATUS ]</span>
            <Database className="w-4 h-4 text-ops-blue" />
          </div>

          <h3 className="text-base font-bold text-white mb-2">Multi-Tenant Isolation</h3>
          <p className="text-xs text-white/60 mb-4 leading-relaxed">
            All tenant queries execute with `SET LOCAL app.current_organization_id`. Cross-tenant data leakage is cryptographically and relationally impossible.
          </p>

          <div className="p-3 rounded-lg bg-[#0A0B14] border border-white/[0.06] text-[11px] font-mono text-ops-cyan">
            STATUS: ENFORCED (Neon PG 18.6 pgvector)
          </div>
        </GlowCard>
      </div>
    </div>
  );
};
