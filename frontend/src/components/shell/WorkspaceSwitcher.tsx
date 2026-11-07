"use client";

import React, { useState } from "react";
import { Check, ChevronsUpDown, Building2, Layers } from "lucide-react";
import { MOCK_ORGANIZATION, MOCK_WORKSPACE, Organization, Workspace } from "@/lib/api-client";

export function WorkspaceSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentOrg] = useState<Organization>(MOCK_ORGANIZATION);
  const [currentWs, setCurrentWs] = useState<Workspace>(MOCK_WORKSPACE);

  const availableWorkspaces: Workspace[] = [
    MOCK_WORKSPACE,
    {
      id: "ws-sec-8821",
      organization_id: MOCK_ORGANIZATION.id,
      name: "Q4 Auditing & Tax Sandbox",
      description: "Isolated workspace for fiscal year-end verification",
      created_at: "2026-11-04T10:00:00Z",
    },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-2 rounded-lg bg-surface-card border border-hairline hover:border-hairline-strong transition text-left group"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded bg-brand/10 border border-brand/20 flex items-center justify-center shrink-0">
            <Building2 className="w-3.5 h-3.5 text-brand-light" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-ink-primary truncate leading-tight">
              {currentWs.name}
            </div>
            <div className="text-[10px] text-ink-muted truncate">
              {currentOrg.name}
            </div>
          </div>
        </div>
        <ChevronsUpDown className="w-3.5 h-3.5 text-ink-muted group-hover:text-ink-secondary shrink-0" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 right-0 mt-1.5 p-1.5 bg-surface-elevated border border-hairline rounded-lg shadow-floating-panel z-50 animate-in fade-in zoom-in-95 duration-100">
            <div className="px-2 py-1 text-[10px] uppercase font-semibold text-ink-muted tracking-wider">
              Workspaces (Tenant RLS)
            </div>
            {availableWorkspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => {
                  setCurrentWs(ws);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition ${
                  ws.id === currentWs.id
                    ? "bg-brand/10 text-brand-light font-medium"
                    : "text-ink-secondary hover:text-ink-primary hover:bg-surface-hover"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Layers className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{ws.name}</span>
                </div>
                {ws.id === currentWs.id && (
                  <Check className="w-3.5 h-3.5 text-brand-light shrink-0" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
