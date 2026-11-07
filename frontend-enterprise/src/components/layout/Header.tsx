import React from "react";
import { useLocation } from "react-router-dom";
import {
  Search,
  Command,
  Bell,
  ShieldCheck,
  Building,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { Button, Badge } from "../ui";

interface HeaderProps {
  onOpenCommandPalette: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenCommandPalette }) => {
  const location = useLocation();

  const getBreadcrumbs = () => {
    const path = location.pathname;
    if (path.includes("/dashboard")) return ["Workspace", "Operational Dashboard"];
    if (path.includes("/documents") && path.includes("/review"))
      return ["Document Intelligence", "INV-2026-9041 Review"];
    if (path.includes("/documents")) return ["Document Library", "All Repository Assets"];
    if (path.includes("/review-queue")) return ["Verification", "Human Review Queue"];
    if (path.includes("/matching")) return ["Cross-Document", "3-Way Reconciliation"];
    if (path.includes("/assistant")) return ["AI Assistant", "Hybrid RRF Copilot"];
    if (path.includes("/analytics")) return ["Administration", "Spend & Risk Analytics"];
    if (path.includes("/settings")) return ["Governance", "RBAC & Tenant Security"];
    return ["Workspace", "Overview"];
  };

  const crumbs = getBreadcrumbs();

  return (
    <header className="h-12 border-b border-hairline bg-surface-primary/70 backdrop-blur-md px-5 flex items-center justify-between shrink-0 select-none z-30">
      {/* Breadcrumb Path */}
      <div className="flex items-center gap-1.5 text-xs">
        <Building className="w-3.5 h-3.5 text-ink-muted shrink-0" />
        <span className="text-ink-muted">{crumbs[0]}</span>
        <ChevronRight className="w-3 h-3 text-ink-muted shrink-0" />
        <span className="font-semibold text-ink-primary">{crumbs[1]}</span>
      </div>

      {/* Global Search and Actions */}
      <div className="flex items-center gap-3">
        {/* Command Palette Trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="flex items-center gap-2 h-7 px-2.5 rounded-lg bg-surface-subtle border border-hairline hover:border-hairline-strong text-xs text-ink-muted hover:text-ink-primary transition-colors shadow-subtle-card"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="text-[11px]">Search docs, invoices, POs...</span>
          <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-surface-elevated text-[10px] font-mono text-ink-muted border border-hairline ml-2">
            <Command className="w-2.5 h-2.5" /> K
          </kbd>
        </button>

        {/* Dual Custody Segregation of Duties Badge */}
        <Badge variant="verified" size="sm" dot>
          Dual Custody Active
        </Badge>

        {/* Notification Bell */}
        <button
          className="relative p-1.5 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-surface-hover transition-colors"
          aria-label="View notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-brand" />
        </button>
      </div>
    </header>
  );
};
