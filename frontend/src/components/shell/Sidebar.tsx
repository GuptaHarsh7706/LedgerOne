"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  CheckSquare,
  GitCompare,
  Bot,
  BarChart3,
  Settings,
  ShieldCheck,
  Database,
  Search,
} from "lucide-react";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  badgeColor?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Document Library",
    href: "/documents",
    icon: FileText,
  },
  {
    name: "Review Queue",
    href: "/review-queue",
    icon: CheckSquare,
    badge: 3,
    badgeColor: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  },
  {
    name: "3-Way Matching",
    href: "/matching",
    icon: GitCompare,
    badge: "1 Issue",
    badgeColor: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  },
  {
    name: "AI Assistant",
    href: "/assistant",
    icon: Bot,
  },
  {
    name: "Spend Analytics",
    href: "/analytics",
    icon: BarChart3,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [showUserMenu, setShowUserMenu] = React.useState(false);

  return (
    <aside className="w-64 bg-surface-subtle border-r border-hairline flex flex-col h-screen select-none shrink-0 z-30">
      {/* Brand Header */}
      <div className="p-4 border-b border-hairline flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand to-brand-light flex items-center justify-center shadow-hairline-glow">
            <svg
              className="w-4 h-4 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-ink-primary tracking-tight text-sm">
                LedgerOne
              </span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-surface-elevated text-brand-light border border-hairline">
                v7.1
              </span>
            </div>
            <p className="text-[11px] text-ink-muted">Document Intelligence</p>
          </div>
        </Link>
      </div>

      {/* Workspace & Org Switcher */}
      <div className="p-3 border-b border-hairline">
        <WorkspaceSwitcher />
      </div>

      {/* Quick Search Launcher Trigger */}
      <div className="px-3 pt-3">
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent("open-command-palette"));
          }}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md bg-surface-card border border-hairline text-ink-muted hover:text-ink-secondary hover:border-hairline-strong transition text-xs"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5" />
            <span>Search or command...</span>
          </div>
          <kbd className="px-1.5 py-0.5 rounded bg-surface-elevated text-[10px] font-mono border border-hairline text-ink-muted">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="px-2 py-1 text-[10px] uppercase tracking-wider font-semibold text-ink-disabled">
          Intelligence Core
        </div>
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname?.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-2.5 py-2 rounded-md text-xs font-medium transition-all ${
                isActive
                  ? "bg-brand/10 text-brand-light border border-brand/20 shadow-sm"
                  : "text-ink-secondary hover:text-ink-primary hover:bg-surface-hover"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon
                  className={`w-4 h-4 ${
                    isActive ? "text-brand-light" : "text-ink-muted"
                  }`}
                />
                <span>{item.name}</span>
              </div>
              {item.badge !== undefined && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                    item.badgeColor || "bg-surface-elevated text-ink-secondary"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}

        <div className="pt-4 px-2 py-1 text-[10px] uppercase tracking-wider font-semibold text-ink-disabled">
          Governance & Settings
        </div>
        <Link
          href="/settings"
          className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-all ${
            pathname === "/settings"
              ? "bg-brand/10 text-brand-light border border-brand/20"
              : "text-ink-secondary hover:text-ink-primary hover:bg-surface-hover"
          }`}
        >
          <Settings className="w-4 h-4 text-ink-muted" />
          <span>Workspace RBAC</span>
        </Link>
      </nav>

      {/* System Status & Infrastructure Bar */}
      <div className="p-3 border-t border-hairline bg-surface-subtle/50 space-y-2">
        <div className="flex items-center justify-between text-[11px] text-ink-muted">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>Neon DB & S3 Storage</span>
          </div>
          <span className="font-mono text-[10px] text-emerald-400">LIVE</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-ink-muted">
          <div className="flex items-center gap-1.5">
            <Database className="w-3 h-3 text-ink-muted" />
            <span>PostgreSQL RLS</span>
          </div>
          <span className="font-mono text-[10px] text-ink-secondary">FORCED</span>
        </div>
      </div>

      {/* User & SoD Footer */}
      <div className="p-3 border-t border-hairline relative bg-surface-card/60">
        <button
          onClick={() => setShowUserMenu(!showUserMenu)}
          className="w-full flex items-center justify-between p-1 rounded-lg hover:bg-surface-hover transition text-left group"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-surface-elevated border border-hairline flex items-center justify-center font-medium text-xs text-brand-light">
              AP
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink-primary truncate">
                Senior Reviewer
              </p>
              <div className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="text-[10px] text-ink-muted truncate">
                  WORKSPACE_ADMIN
                </span>
              </div>
            </div>
          </div>
        </button>

        {showUserMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowUserMenu(false)}
            />
            <div className="absolute bottom-full left-3 right-3 mb-2 p-3 bg-surface-elevated border border-hairline-strong rounded-xl shadow-2xl z-50 text-xs space-y-2 animate-in fade-in zoom-in-95 duration-100">
              <div className="border-b border-hairline pb-2">
                <p className="font-semibold text-ink-primary">Senior Reviewer</p>
                <p className="text-[10px] text-ink-muted font-mono">reviewer@apexcapital.internal</p>
              </div>
              <div className="space-y-1 font-mono text-[10px] text-ink-secondary">
                <div className="flex justify-between">
                  <span>Role:</span>
                  <span className="text-brand-light font-bold">WORKSPACE_ADMIN</span>
                </div>
                <div className="flex justify-between">
                  <span>SoD Status:</span>
                  <span className="text-emerald-400">Dual-Control Eligible</span>
                </div>
                <div className="flex justify-between">
                  <span>Session:</span>
                  <span className="text-ink-muted">JWT 15m Rotated</span>
                </div>
              </div>
              <div className="pt-2 border-t border-hairline flex gap-2">
                <Link
                  href="/settings"
                  onClick={() => setShowUserMenu(false)}
                  className="flex-1 text-center py-1 rounded bg-surface-card hover:bg-surface-hover text-ink-primary text-[11px] font-medium border border-hairline transition"
                >
                  Manage RBAC
                </Link>
                <button
                  onClick={() => {
                    alert("Session logged out under zero-trust credential cycle.");
                    setShowUserMenu(false);
                  }}
                  className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-[11px] font-medium transition"
                >
                  Logout
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
