"use client";

import React, { useState } from "react";
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
  Cpu,
  LogOut,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { Badge } from "@/components/ui/Badge";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  badgeVariant?: "neutral" | "review" | "discrepancy" | "verified";
}

const PRIMARY_NAV: NavItem[] = [
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
];

const INTELLIGENCE_NAV: NavItem[] = [
  {
    name: "Review Queue",
    href: "/review-queue",
    icon: CheckSquare,
    badge: 2,
    badgeVariant: "review",
  },
  {
    name: "3-Way Matching",
    href: "/matching",
    icon: GitCompare,
    badge: "$2,200",
    badgeVariant: "discrepancy",
  },
  {
    name: "AI Copilot",
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
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <aside className="w-64 bg-surface-subtle border-r border-hairline flex flex-col h-screen select-none shrink-0 z-30">
      {/* Brand Header */}
      <div className="h-14 px-4 border-b border-hairline flex items-center justify-between shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand to-brand-light flex items-center justify-center shadow-hairline-glow border border-brand-light/40 group-hover:scale-105 transition-transform duration-150">
            <svg
              className="w-3.5 h-3.5 text-white"
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
              <span className="font-semibold text-ink-primary tracking-tight text-xs">
                LedgerOne
              </span>
              <span className="text-[9px] uppercase font-mono px-1 py-0.2 rounded bg-surface-elevated text-brand-light border border-hairline">
                PRO 7.1
              </span>
            </div>
            <p className="text-[10px] text-ink-muted">Document Intelligence</p>
          </div>
        </Link>
      </div>

      {/* Workspace & Org Context */}
      <div className="p-3 border-b border-hairline bg-surface-card/40">
        <WorkspaceSwitcher />
      </div>

      {/* Keyboard Quick Launcher */}
      <div className="px-3 pt-3">
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent("open-command-palette"));
          }}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md bg-surface-card border border-hairline hover:border-hairline-strong hover:bg-surface-hover text-ink-muted hover:text-ink-secondary transition-all duration-150 text-xs shadow-subtle-card"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-ink-muted" />
            <span className="text-[11px]">Command or search...</span>
          </div>
          <kbd className="px-1.5 py-0.5 rounded bg-surface-elevated text-[10px] font-mono border border-hairline text-ink-muted shadow-sm">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Nav List */}
      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
        {/* Core Workspace Section */}
        <div>
          <div className="px-2 pb-1.5 text-[9px] uppercase tracking-wider font-semibold text-ink-disabled font-mono">
            Core Workspace
          </div>
          <div className="space-y-0.5">
            {PRIMARY_NAV.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname?.startsWith(item.href));
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${
                    isActive
                      ? "bg-brand/10 text-brand-light border border-brand/20 shadow-sm"
                      : "text-ink-secondary hover:text-ink-primary hover:bg-surface-hover border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon
                      className={`w-3.5 h-3.5 ${
                        isActive ? "text-brand-light" : "text-ink-muted"
                      }`}
                    />
                    <span>{item.name}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Financial Verification & Matching */}
        <div>
          <div className="px-2 pb-1.5 text-[9px] uppercase tracking-wider font-semibold text-ink-disabled font-mono">
            Verification & AI
          </div>
          <div className="space-y-0.5">
            {INTELLIGENCE_NAV.map((item) => {
              const isActive =
                pathname === item.href ||
                pathname?.startsWith(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${
                    isActive
                      ? "bg-brand/10 text-brand-light border border-brand/20 shadow-sm"
                      : "text-ink-secondary hover:text-ink-primary hover:bg-surface-hover border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon
                      className={`w-3.5 h-3.5 ${
                        isActive ? "text-brand-light" : "text-ink-muted"
                      }`}
                    />
                    <span>{item.name}</span>
                  </div>
                  {item.badge !== undefined && (
                    <Badge
                      variant={item.badgeVariant || "neutral"}
                      withDot={item.badgeVariant === "discrepancy"}
                      pulsing={item.badgeVariant === "discrepancy"}
                    >
                      {item.badge}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Governance */}
        <div>
          <div className="px-2 pb-1.5 text-[9px] uppercase tracking-wider font-semibold text-ink-disabled font-mono">
            Administration
          </div>
          <div className="space-y-0.5">
            <Link
              href="/settings"
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${
                pathname === "/settings"
                  ? "bg-brand/10 text-brand-light border border-brand/20 shadow-sm"
                  : "text-ink-secondary hover:text-ink-primary hover:bg-surface-hover border border-transparent"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Settings
                  className={`w-3.5 h-3.5 ${
                    pathname === "/settings" ? "text-brand-light" : "text-ink-muted"
                  }`}
                />
                <span>Workspace Governance</span>
              </div>
              <span className="text-[10px] font-mono text-ink-muted">RBAC</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* System Status & Infrastructure Footprint */}
      <div className="p-3 border-t border-hairline bg-surface-subtle/70 space-y-2">
        <div className="flex items-center justify-between text-[10px] font-mono text-ink-muted">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>Neon DB & Private S3</span>
          </div>
          <span className="text-emerald-400 font-semibold">CONNECTED</span>
        </div>
        <div className="flex items-center justify-between text-[10px] font-mono text-ink-muted">
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3 h-3 text-sky-400" />
            <span>RTX 3050 CUDA 12.4</span>
          </div>
          <span className="text-sky-400 font-semibold">ACCELERATED</span>
        </div>
      </div>

      {/* User Identity & SoD Popover */}
      <div className="p-2.5 border-t border-hairline relative bg-surface-card/60">
        <button
          onClick={() => setShowUserMenu(!showUserMenu)}
          className="w-full flex items-center justify-between p-1.5 rounded-lg hover:bg-surface-hover transition-colors text-left group"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-surface-elevated border border-hairline flex items-center justify-center font-mono font-semibold text-xs text-brand-light shadow-sm">
              AR
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink-primary truncate leading-tight">
                Senior Reviewer
              </p>
              <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono mt-0.5">
                <ShieldCheck className="w-3 h-3 shrink-0" />
                <span className="truncate">SoD Authorized</span>
              </div>
            </div>
          </div>
          <ChevronRight className={`w-3.5 h-3.5 text-ink-muted transition-transform duration-150 ${showUserMenu ? "rotate-90" : ""}`} />
        </button>

        {showUserMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowUserMenu(false)}
            />
            <div className="absolute bottom-full left-2.5 right-2.5 mb-2 p-3 bg-surface-elevated border border-hairline-strong rounded-xl shadow-floating-panel z-50 text-xs space-y-2.5 animate-in fade-in zoom-in-95 duration-100">
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
                  <span>Segregation of Duties:</span>
                  <span className="text-emerald-400">Dual-Control Eligible</span>
                </div>
                <div className="flex justify-between">
                  <span>Auth Session:</span>
                  <span className="text-ink-muted">JWT 15m Rotated</span>
                </div>
              </div>
              <div className="pt-2 border-t border-hairline flex gap-2">
                <Link
                  href="/settings"
                  onClick={() => setShowUserMenu(false)}
                  className="flex-1 text-center py-1 rounded-md bg-surface-card hover:bg-surface-hover text-ink-primary text-[11px] font-medium border border-hairline transition"
                >
                  Manage RBAC
                </Link>
                <button
                  onClick={() => {
                    localStorage.removeItem("ledgerone_access_token");
                    localStorage.removeItem("ledgerone_token_exp");
                    window.location.reload();
                  }}
                  className="px-2 py-1 rounded-md bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-[11px] font-medium transition flex items-center gap-1"
                >
                  <LogOut className="w-3 h-3" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

export default Sidebar;
