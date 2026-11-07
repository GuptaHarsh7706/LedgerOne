"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  FileText,
  CheckSquare,
  GitCompare,
  Bot,
  BarChart3,
  Upload,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    const handleCustomOpen = () => setIsOpen(true);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("open-command-palette", handleCustomOpen);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("open-command-palette", handleCustomOpen);
    };
  }, []);

  if (!isOpen) return null;

  const actions = [
    {
      id: "act-upload",
      title: "Upload New Document",
      sub: "Ingest PDF, XLSX, or image into S3 with OCR",
      icon: Upload,
      handler: () => {
        router.push("/documents?action=upload");
        setIsOpen(false);
      },
    },
    {
      id: "act-review",
      title: "Review Queue",
      sub: "3 pending invoices requiring dual-custody verification",
      icon: CheckSquare,
      badge: "3 pending",
      handler: () => {
        router.push("/review-queue");
        setIsOpen(false);
      },
    },
    {
      id: "act-match",
      title: "Run 3-Way Match Reconciler",
      sub: "Audit PO ↔ GRN ↔ Invoice price and quantity discrepancies",
      icon: GitCompare,
      badge: "MATCH-002",
      handler: () => {
        router.push("/matching");
        setIsOpen(false);
      },
    },
    {
      id: "act-assistant",
      title: "Ask AI Financial Assistant",
      sub: "Evidence-grounded queries with bounding-box citations",
      icon: Bot,
      handler: () => {
        router.push("/assistant");
        setIsOpen(false);
      },
    },
    {
      id: "act-inv-9041",
      title: "Open Invoice INV-2026-9041 (DataCore Enterprise)",
      sub: "Discrepancy detected: +$600.00 unit price variance",
      icon: FileText,
      badge: "$11,220.00",
      handler: () => {
        router.push("/documents/doc-inv-9041/review");
        setIsOpen(false);
      },
    },
    {
      id: "act-analytics",
      title: "View Spend Analytics & Top Vendors",
      sub: "Vendor concentration and open financial discrepancy exposure",
      icon: BarChart3,
      handler: () => {
        router.push("/analytics");
        setIsOpen(false);
      },
    },
  ];

  const filtered = actions.filter(
    (a) =>
      a.title.toLowerCase().includes(query.toLowerCase()) ||
      a.sub.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="fixed inset-0 -z-10"
        onClick={() => setIsOpen(false)}
      />
      <div className="w-full max-w-xl bg-surface-elevated border border-hairline-strong rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 border-b border-hairline bg-surface-subtle">
          <Search className="w-4 h-4 text-ink-muted mr-3 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search documents (e.g. 'review', 'INV-2026', 'upload')..."
            autoFocus
            className="w-full py-3.5 bg-transparent text-sm text-ink-primary placeholder-ink-muted focus:outline-none"
          />
          <kbd className="px-2 py-0.5 text-[10px] font-mono rounded bg-surface-card border border-hairline text-ink-muted">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          <div className="px-2 py-1 text-[10px] uppercase font-semibold text-ink-muted tracking-wider flex items-center justify-between">
            <span>Suggested Actions</span>
            <span className="flex items-center gap-1 text-[10px] text-brand-light">
              <Sparkles className="w-3 h-3" /> Quick Navigation
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-ink-muted">
              No matching actions or documents found for &quot;{query}&quot;
            </div>
          ) : (
            filtered.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={item.handler}
                  className="w-full flex items-center justify-between p-2.5 rounded-lg text-left text-xs text-ink-secondary hover:text-ink-primary hover:bg-surface-hover transition group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-md bg-surface-card border border-hairline flex items-center justify-center shrink-0 group-hover:border-brand/40 group-hover:text-brand-light transition">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-ink-primary truncate">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-ink-muted truncate">
                        {item.sub}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {item.badge && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface-card border border-hairline text-ink-secondary">
                        {item.badge}
                      </span>
                    )}
                    <ArrowRight className="w-3.5 h-3.5 text-ink-disabled group-hover:text-ink-secondary group-hover:translate-x-0.5 transition" />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-surface-subtle border-t border-hairline flex items-center justify-between text-[11px] text-ink-muted">
          <span>Navigate with arrow keys</span>
          <div className="flex items-center gap-2 font-mono text-[10px]">
            <span>Select: ↵</span>
            <span>Close: Esc</span>
          </div>
        </div>
      </div>
    </div>
  );
}
