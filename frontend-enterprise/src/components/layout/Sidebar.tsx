import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Files,
  CheckSquare,
  FileSearch,
  GitCompare,
  Bot,
  BarChart3,
  Settings,
  ShieldCheck,
  Cpu,
  Database,
  Building2,
  Lock,
  LogOut,
} from "lucide-react";
import { Badge } from "../ui";
import { api } from "../../services/api";
import { useActiveRole } from "../../services/permissions";

interface SidebarProps {
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onLogout }) => {
  const location = useLocation();
  const currentPath = location.pathname;
  const user = api.getCurrentUser();
  const { role, can } = useActiveRole();

  const navigationGroups = [
    {
      group: "Core Workspace",
      items: [
        {
          name: "Dashboard",
          href: "/dashboard",
          icon: LayoutDashboard,
          requiredPermission: "workspace.read",
          badge: undefined,
        },
        {
          name: "Document Library",
          href: "/documents",
          icon: Files,
          requiredPermission: "documents.read",
          badge: undefined,
        },
      ],
    },
    {
      group: "Verification & AI",
      items: [
        {
          name: "Review Queue",
          href: "/review-queue",
          icon: CheckSquare,
          requiredPermission: "review.read",
          badge: "6 Due",
          variant: "review" as const,
        },
        {
          name: "Document Intelligence",
          href: "/documents/a1000000-0000-0000-0000-000000009041/review",
          icon: FileSearch,
          requiredPermission: "documents.read",
          badge: "Forensics",
          variant: "brand" as const,
        },
        {
          name: "3-Way Matching",
          href: "/matching",
          icon: GitCompare,
          requiredPermission: "matching.read",
          badge: "1 Discrepancy",
          variant: "discrepancy" as const,
        },
        {
          name: "Evidence-Grounded AI",
          href: "/assistant",
          icon: Bot,
          requiredPermission: "assistant.use",
          badge: "RTX 3050",
          variant: "ready" as const,
        },
      ],
    },
    {
      group: "Administration & Forensics",
      items: [
        {
          name: "Spend Analytics",
          href: "/analytics",
          icon: BarChart3,
          requiredPermission: "analytics.read",
          badge: undefined,
        },
        {
          name: "Governance & RBAC",
          href: "/settings",
          icon: Settings,
          requiredPermission: "workspace.read",
          badge: undefined,
        },
      ],
    },
  ];

  return (
    <aside className="w-64 h-screen bg-sidebar border-r border-hairline flex flex-col justify-between select-none shrink-0 z-40">
      <div className="flex flex-col h-full overflow-hidden">
        {/* Workspace Brand Header */}
        <div className="p-4 border-b border-hairline flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center text-white font-bold text-sm shadow-hairline-glow">
              L1
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm tracking-tight text-ink-primary">
                  LedgerOne
                </span>
                <span className="text-[9px] font-mono px-1 rounded bg-brand/20 text-brand-light font-semibold">
                  v2.0
                </span>
              </div>
              <p className="text-[10px] text-ink-muted truncate max-w-[130px]">
                Apex Global Capital
              </p>
            </div>
          </Link>
          <Building2 className="w-4 h-4 text-ink-muted" />
        </div>

        {/* Navigation Item Tree */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {navigationGroups.map((group) => (
            <div key={group.group} className="space-y-1.5">
              <div className="px-2 text-[10px] font-mono uppercase tracking-wider text-ink-muted font-semibold">
                {group.group}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isAllowed = can(item.requiredPermission);
                  const isActive =
                    item.href === "/dashboard"
                      ? currentPath === "/dashboard"
                      : currentPath.startsWith(item.href);

                  if (!isAllowed) {
                    return (
                      <div
                        key={item.href}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium text-ink-muted/50 cursor-not-allowed opacity-60"
                        title={`Action requires permission: ${item.requiredPermission}`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Lock className="w-3.5 h-3.5 shrink-0 text-ink-muted/40" />
                          <span className="truncate">{item.name}</span>
                        </div>
                        <Badge variant="neutral" size="sm">
                          Restricted
                        </Badge>
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                        isActive
                          ? "bg-surface-elevated text-ink-primary shadow-subtle-card border border-hairline font-semibold"
                          : "text-ink-secondary hover:text-ink-primary hover:bg-surface-hover/50"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={`w-4 h-4 shrink-0 ${
                            isActive ? "text-brand-light" : "text-ink-muted"
                          }`}
                        />
                        <span className="truncate">{item.name}</span>
                      </div>
                      {item.badge && (
                        <Badge
                          variant={item.variant || "neutral"}
                          size="sm"
                          dot={item.variant === "review" || item.variant === "discrepancy"}
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Real Hardware & Cloud Infrastructure Telemetry */}
        <div className="px-3 py-2 border-t border-hairline bg-surface-subtle/50 text-[10px] font-mono space-y-1.5">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="flex items-center gap-1.5">
              <Database className="w-3 h-3 text-emerald-400" />
              <span>Neon Cloud PostgreSQL</span>
            </span>
            <span className="text-emerald-400 font-semibold">18.6 RLS</span>
          </div>
          <div className="flex items-center justify-between text-ink-muted">
            <span className="flex items-center gap-1.5">
              <Cpu className="w-3 h-3 text-brand-light" />
              <span>RTX 3050 CUDA Engine</span>
            </span>
            <span className="text-brand-light font-semibold">12.4 ACTIVE</span>
          </div>
        </div>

        {/* User Identity & Active Simulated Role */}
        <div className="p-3 border-t border-hairline flex items-center justify-between bg-surface-primary">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-brand/20 border border-brand/30 flex items-center justify-center text-xs font-mono font-bold text-brand-light shrink-0">
              {user?.name ? user.name[0] : "R"}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-ink-primary truncate">
                {user?.name || "Senior Reviewer"}
              </div>
              <div className="text-[10px] font-mono text-brand font-semibold truncate">
                {role}
              </div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="p-1 text-ink-muted hover:text-status-danger rounded hover:bg-surface-hover transition-colors"
            title="Log Out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};
