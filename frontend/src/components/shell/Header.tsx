"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Upload,
  Cpu,
  ChevronRight,
  Bell,
  X,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";

interface NotificationItem {
  id: string;
  type: "CRITICAL" | "WARNING" | "INFO";
  title: string;
  message: string;
  timestamp: string;
  link?: string;
  read: boolean;
}

export function Header() {
  const pathname = usePathname();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: "notif-1",
      type: "CRITICAL",
      title: "Unit Price Inflation Detected (MATCH-002)",
      message: "Invoice INV-2026-9041 billed $3,600.00 vs PO rate $3,000.00 (+$1,200.00 exposure).",
      timestamp: "5 mins ago",
      link: "/documents/doc-inv-9041/review",
      read: false,
    },
    {
      id: "notif-2",
      type: "WARNING",
      title: "Quantity Overbilling (MATCH-001)",
      message: "Invoice INV-2026-7721 billed for 10 units vs 7 received on GRN-2026-1109.",
      timestamp: "25 mins ago",
      link: "/review-queue",
      read: false,
    },
    {
      id: "notif-3",
      type: "INFO",
      title: "Dual-Custody Approval Finalized",
      message: "Purchase Order PO-2026-4412 approved by Senior Reviewer under SoD rules.",
      timestamp: "2 hours ago",
      read: true,
    },
  ]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const dismissNotif = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const segments = pathname?.split("/").filter(Boolean) || [];
  const breadcrumbMap: Record<string, string> = {
    dashboard: "Executive Dashboard",
    documents: "Document Library",
    "review-queue": "Human Review Queue",
    matching: "3-Way Matching Engine",
    assistant: "Grounded AI Assistant",
    analytics: "Financial Spend Analytics",
    settings: "Workspace Settings",
    review: "Document Intelligence Studio",
  };

  return (
    <header className="h-14 bg-surface-subtle border-b border-hairline flex items-center justify-between px-6 shrink-0 z-20 relative">
      {/* Breadcrumb Path */}
      <div className="flex items-center gap-1.5 text-xs">
        <Link
          href="/dashboard"
          className="text-ink-muted hover:text-ink-secondary transition font-medium"
        >
          LedgerOne
        </Link>
        {segments.map((seg, idx) => (
          <React.Fragment key={seg}>
            <ChevronRight className="w-3 h-3 text-ink-disabled shrink-0" />
            <span
              className={
                idx === segments.length - 1
                  ? "text-ink-primary font-semibold"
                  : "text-ink-muted"
              }
            >
              {breadcrumbMap[seg] || seg}
            </span>
          </React.Fragment>
        ))}
      </div>

      {/* Right Controls & Telemetry */}
      <div className="flex items-center gap-3">
        {/* Hardware & Cloud Telemetry Pill */}
        <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-full bg-surface-card border border-hairline text-[11px] text-ink-muted">
          <div className="flex items-center gap-1 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-mono text-[10px] font-semibold">NEON CLOUD</span>
          </div>
          <span className="text-ink-disabled">|</span>
          <div className="flex items-center gap-1 text-ink-secondary">
            <Cpu className="w-3 h-3 text-brand-light" />
            <span className="font-mono text-[10px]">RTX 3050 CUDA</span>
          </div>
        </div>

        {/* Notifications Button */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            title="Discrepancy Notifications"
            className="relative p-2 rounded-md bg-surface-card border border-hairline text-ink-muted hover:text-ink-primary hover:border-hairline-strong transition"
          >
            <Bell className="w-3.5 h-3.5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            )}
          </button>

          {/* Interactive Notifications Popover Dropdown */}
          {showNotifications && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowNotifications(false)}
              />
              <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 p-3 bg-surface-elevated border border-hairline-strong rounded-xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between pb-2 border-b border-hairline mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-ink-primary">
                      Discrepancy & Audit Alerts
                    </span>
                    {unreadCount > 0 && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-[10px] text-brand-light hover:underline font-medium"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-6 text-center text-xs text-ink-muted">
                      No active alerts or discrepancy notifications
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`p-2.5 rounded-lg border text-xs transition relative group ${
                          n.type === "CRITICAL"
                            ? "bg-rose-500/5 border-rose-500/20"
                            : n.type === "WARNING"
                            ? "bg-amber-500/5 border-amber-500/20"
                            : "bg-surface-subtle border-hairline"
                        } ${!n.read ? "ring-1 ring-brand-light/30" : "opacity-80"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-semibold text-ink-primary text-xs">
                            {n.type === "CRITICAL" && (
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                            )}
                            {n.type === "WARNING" && (
                              <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            )}
                            {n.type === "INFO" && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            )}
                            <span>{n.title}</span>
                          </div>
                          <button
                            onClick={() => dismissNotif(n.id)}
                            className="p-0.5 rounded text-ink-muted hover:text-ink-primary transition opacity-0 group-hover:opacity-100"
                            title="Dismiss"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-[11px] text-ink-secondary mt-1 leading-relaxed">
                          {n.message}
                        </p>
                        <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-ink-muted">
                          <span>{n.timestamp}</span>
                          {n.link && (
                            <Link
                              href={n.link}
                              onClick={() => setShowNotifications(false)}
                              className="text-brand-light hover:underline flex items-center gap-0.5 font-medium"
                            >
                              <span>Inspect</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </Link>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Upload Document Primary CTA */}
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent("open-upload-modal"));
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand hover:bg-brand-light text-white text-xs font-semibold shadow-hairline-glow transition"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Upload Document</span>
        </button>
      </div>
    </header>
  );
}
