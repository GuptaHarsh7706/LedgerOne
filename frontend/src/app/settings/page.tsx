"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  Users,
  Database,
  Key,
  Lock,
  Check,
  UserPlus,
  Copy,
  RefreshCw,
  Download,
  Trash2,
  AlertCircle,
  X,
  FileCheck,
} from "lucide-react";

interface Member {
  name: string;
  email: string;
  role: string;
  isSelf?: boolean;
}

export function SettingsPage() {
  const roles = [
    {
      name: "WORKSPACE_ADMIN",
      desc: "Full administrative governance, dual-custody document approval, user management",
      badge: "Highest Authority",
      color: "text-brand-light bg-brand/10 border-brand/20",
    },
    {
      name: "DOCUMENT_MANAGER",
      desc: "Upload documents, manage metadata, manage jobs (strictly barred from approval)",
      badge: "Ingestion Lead",
      color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    },
    {
      name: "REVIEWER",
      desc: "Inspect extractions, correct cell values, request overrides (SoD gated from approval)",
      badge: "Verification Specialist",
      color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    },
    {
      name: "ANALYST",
      desc: "Execute hybrid search, converse with AI assistant, view spend analytics",
      badge: "Read & Query",
      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    },
    {
      name: "VIEWER",
      desc: "Read-only document access, cannot initiate matches or edits (HTTP 403 barred)",
      badge: "Auditor Read-Only",
      color: "text-ink-muted bg-surface-elevated border-hairline",
    },
  ];

  const [members, setMembers] = useState<Member[]>([
    {
      name: "Senior Reviewer (You)",
      email: "reviewer@apexcapital.internal",
      role: "WORKSPACE_ADMIN",
      isSelf: true,
    },
    {
      name: "Alex Morgan",
      email: "alex.m@apexcapital.internal",
      role: "DOCUMENT_MANAGER",
    },
    {
      name: "Sarah Jenkins",
      email: "sarah.j@apexcapital.internal",
      role: "REVIEWER",
    },
    {
      name: "David Chen",
      email: "david.c@apexcapital.internal",
      role: "ANALYST",
    },
  ]);

  const [apiKey, setApiKey] = useState("l1_live_948f2a1b660e48dfa2e99d12a9bc21a4");
  const [copiedKey, setCopiedKey] = useState(false);
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Invite Form State
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("REVIEWER");

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3500);
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopiedKey(true);
    showToast("API Key copied to clipboard.");
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleRotateKey = () => {
    const randomHex = Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
    const newKey = `l1_live_${randomHex}`;
    setApiKey(newKey);
    setShowRotateConfirm(false);
    showToast("Production API key rotated successfully. Previous key revoked.");
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) return;

    const newMember: Member = {
      name: inviteName.trim(),
      email: inviteEmail.trim(),
      role: inviteRole,
    };

    setMembers((prev) => [...prev, newMember]);
    setShowInviteModal(false);
    setInviteName("");
    setInviteEmail("");
    showToast(`Invitation sent to ${newMember.email} with role ${newMember.role}.`);
  };

  const handleRemoveMember = (email: string) => {
    setMembers((prev) => prev.filter((m) => m.email !== email));
    showToast(`Member access revoked for ${email}.`);
  };

  const handleExportAuditTrail = () => {
    const auditData = {
      tenant_id: "6c885eec-bed8-4060-8215-a50eb442bf5d",
      tenant_name: "Apex Global Capital",
      workspace_id: "9b2b92c0-56a0-4568-8d42-9d2681d30fc9",
      workspace_name: "Production Financial Core",
      exported_at: new Date().toISOString(),
      standards_conformance: ["SOC2_TYPE_II", "ISO_27001", "EU_AI_ACT_HIGH_RISK"],
      events_count: 1420,
      active_members: members.map((m) => ({ email: m.email, role: m.role })),
      dual_custody_enforcement: "AUTH_SOD_002_ACTIVE",
      rls_mode: "FORCE_ROW_LEVEL_SECURITY",
    };

    const blob = new Blob([JSON.stringify(auditData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `LedgerOne-Compliance-Audit-Trail-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Compliance audit trail exported (.json).");
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-surface-elevated border border-brand/30 shadow-2xl text-xs text-ink-primary animate-in slide-in-from-bottom-3 duration-200">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 text-ink-muted hover:text-ink-primary"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="pb-4 border-b border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink-primary">
            Workspace Governance & Access Control
          </h1>
          <p className="text-xs text-ink-muted">
            5-Tier Canonical Role-Based Access Control (RBAC) & PostgreSQL Row-Level Security
          </p>
        </div>

        <button
          onClick={handleExportAuditTrail}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-card hover:bg-surface-hover text-ink-primary border border-hairline text-xs font-medium transition self-start sm:self-auto"
        >
          <Download className="w-3.5 h-3.5 text-brand-light" />
          <span>Export Audit Trail</span>
        </button>
      </div>

      {/* Tenancy Security Card */}
      <div className="p-4 rounded-xl bg-surface-card border border-hairline shadow-subtle-card space-y-3">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold text-ink-primary">
              Neon PostgreSQL Tenancy Enforcement
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 font-bold">
            FORCE ROW LEVEL SECURITY
          </span>
        </div>
        <p className="text-xs text-ink-secondary leading-relaxed">
          All document relations, extracted fields, chunks, and discrepancies enforce compound foreign keys{" "}
          <code className="font-mono text-brand-light bg-surface-subtle px-1.5 py-0.5 rounded border border-hairline">
            (organization_id, workspace_id, id)
          </code>{" "}
          ensuring zero cross-tenant data leakage.
        </p>
      </div>

      {/* API Keys & ETL Authentication Card */}
      <div className="p-4 rounded-xl bg-surface-card border border-hairline shadow-subtle-card space-y-3">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-brand-light" />
            <span className="font-semibold text-ink-primary">
              Production Workspace API Credentials
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-ink-muted bg-surface-subtle border border-hairline">
            Lease: 365 Days
          </span>
        </div>

        <p className="text-xs text-ink-muted">
          Use this secret key to authenticate ETL pipelines, S3 upload workers, and webhook integrations.
        </p>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
          <div className="flex-1 font-mono text-xs bg-surface-subtle px-3 py-2 rounded-lg border border-hairline text-ink-secondary truncate">
            {apiKey.slice(0, 12)}••••••••••••••••••••{apiKey.slice(-4)}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyKey}
              className="px-3 py-2 rounded-lg bg-surface-card hover:bg-surface-hover text-ink-primary border border-hairline text-xs font-medium transition flex items-center gap-1.5"
            >
              {copiedKey ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-ink-muted" />
                  <span>Copy Key</span>
                </>
              )}
            </button>

            <button
              onClick={() => setShowRotateConfirm(true)}
              className="px-3 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 text-xs font-medium transition flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Rotate Key</span>
            </button>
          </div>
        </div>
      </div>

      {/* Role Hierarchy Matrix */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-primary flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-brand-light" />
          <span>Canonical RBAC Role Hierarchy</span>
        </h2>

        <div className="grid grid-cols-1 gap-2.5">
          {roles.map((r) => (
            <div
              key={r.name}
              className="p-3 rounded-lg bg-surface-subtle border border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-ink-primary">
                    {r.name}
                  </span>
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${r.color}`}
                  >
                    {r.badge}
                  </span>
                </div>
                <p className="text-[11px] text-ink-muted mt-0.5">{r.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Workspace Members Table */}
      <div className="rounded-xl border border-hairline bg-surface-card shadow-subtle-card overflow-hidden">
        <div className="p-3.5 bg-surface-subtle border-b border-hairline flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-brand-light" />
            <span className="font-semibold text-ink-primary">
              Active Workspace Members ({members.length})
            </span>
          </div>

          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand hover:bg-brand-light text-white text-xs font-semibold shadow-hairline-glow transition"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Invite Member</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-hairline bg-surface-subtle/50 text-[10px] font-mono uppercase text-ink-muted">
                <th className="py-2.5 px-4">Member Name</th>
                <th className="py-2.5 px-4">Email</th>
                <th className="py-2.5 px-4">Assigned Role</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {members.map((m) => (
                <tr key={m.email} className="hover:bg-surface-hover/80 transition group">
                  <td className="py-2.5 px-4 font-medium text-ink-primary">
                    {m.name}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-ink-secondary">
                    {m.email}
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-brand/10 text-brand-light border border-brand/20 font-semibold">
                      {m.role}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    {!m.isSelf ? (
                      <button
                        onClick={() => handleRemoveMember(m.email)}
                        className="p-1 rounded text-ink-muted hover:text-rose-400 hover:bg-rose-500/10 transition"
                        title={`Revoke access for ${m.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="text-[10px] font-mono text-ink-muted">Owner</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="fixed inset-0 -z-10" onClick={() => setShowInviteModal(false)} />
          <div className="w-full max-w-md bg-surface-elevated border border-hairline-strong rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-4 border-b border-hairline bg-surface-subtle">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-brand-light" />
                <h3 className="text-sm font-semibold text-ink-primary">
                  Invite Member to Workspace
                </h3>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-ink-muted hover:text-ink-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="p-4 space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-ink-secondary mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="e.g. Elena Rostova"
                  className="w-full px-3 py-2 rounded-lg bg-surface-card border border-hairline text-ink-primary focus:border-brand-light focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-secondary mb-1">
                  Corporate Email
                </label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="e.g. elena.r@apexcapital.internal"
                  className="w-full px-3 py-2 rounded-lg bg-surface-card border border-hairline text-ink-primary focus:border-brand-light focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-secondary mb-1">
                  Assigned RBAC Authority
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-card border border-hairline text-ink-primary focus:border-brand-light focus:outline-none"
                >
                  <option value="WORKSPACE_ADMIN">WORKSPACE_ADMIN (Highest Authority)</option>
                  <option value="DOCUMENT_MANAGER">DOCUMENT_MANAGER (Ingestion Lead)</option>
                  <option value="REVIEWER">REVIEWER (Verification Specialist)</option>
                  <option value="ANALYST">ANALYST (Read & Query)</option>
                  <option value="VIEWER">VIEWER (Auditor Read-Only)</option>
                </select>
              </div>

              <div className="p-3 rounded-lg bg-surface-subtle border border-hairline text-[11px] text-ink-muted">
                Dual-Control policy requires that Reviewers and Ingestion leads maintain strict segregation of duties (SoD).
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-ink-secondary hover:text-ink-primary hover:bg-surface-hover transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-md bg-brand hover:bg-brand-light text-white text-xs font-semibold shadow-hairline-glow transition"
                >
                  Send Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rotate Key Confirmation Dialog */}
      {showRotateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="fixed inset-0 -z-10" onClick={() => setShowRotateConfirm(false)} />
          <div className="w-full max-w-sm bg-surface-elevated border border-hairline-strong rounded-xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink-primary">
                  Rotate Production API Key?
                </h3>
                <p className="text-xs text-ink-muted">
                  This action will invalidate the active key immediately.
                </p>
              </div>
            </div>

            <p className="text-[11px] text-ink-secondary bg-surface-subtle p-2.5 rounded-lg border border-hairline">
              Any background ETL workers or webhooks using the current key will receive HTTP 401 Unauthorized until reconfigured.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowRotateConfirm(false)}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-ink-secondary hover:text-ink-primary hover:bg-surface-hover transition"
              >
                Cancel
              </button>
              <button
                onClick={handleRotateKey}
                className="px-3.5 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-hairline-glow transition"
              >
                Confirm Rotation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsPage;
