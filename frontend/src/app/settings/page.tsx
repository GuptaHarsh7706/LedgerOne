"use client";

import React from "react";
import { ShieldCheck, Users, Database, Key, Lock, Check } from "lucide-react";

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

  const members = [
    { name: "Senior Reviewer (You)", email: "reviewer@apexcapital.internal", role: "WORKSPACE_ADMIN" },
    { name: "Alex Morgan", email: "alex.m@apexcapital.internal", role: "DOCUMENT_MANAGER" },
    { name: "Sarah Jenkins", email: "sarah.j@apexcapital.internal", role: "REVIEWER" },
    { name: "David Chen", email: "david.c@apexcapital.internal", role: "ANALYST" },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-hairline">
        <h1 className="text-xl font-bold tracking-tight text-ink-primary">
          Workspace Governance & Access Control
        </h1>
        <p className="text-xs text-ink-muted">
          5-Tier Canonical Role-Based Access Control (RBAC) & PostgreSQL Row-Level Security
        </p>
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
          All document relations, extracted fields, chunks, and discrepancies enforce compound foreign keys <code className="font-mono text-brand-light bg-surface-subtle px-1.5 py-0.5 rounded border border-hairline">(organization_id, workspace_id, id)</code> ensuring zero cross-tenant data leakage.
        </p>
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
          <span className="text-[11px] font-mono text-ink-muted">
            Production Tenant
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-hairline bg-surface-subtle/50 text-[10px] font-mono uppercase text-ink-muted">
                <th className="py-2.5 px-4">Member Name</th>
                <th className="py-2.5 px-4">Email</th>
                <th className="py-2.5 px-4 text-right">Assigned Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {members.map((m) => (
                <tr key={m.email} className="hover:bg-surface-hover/80 transition">
                  <td className="py-2.5 px-4 font-medium text-ink-primary">
                    {m.name}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-ink-secondary">
                    {m.email}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-brand/10 text-brand-light border border-brand/20 font-semibold">
                      {m.role}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
