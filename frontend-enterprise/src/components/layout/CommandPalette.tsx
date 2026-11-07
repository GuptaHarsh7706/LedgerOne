import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  LayoutDashboard,
  Files,
  CheckSquare,
  FileSearch,
  GitCompare,
  Bot,
  BarChart3,
  Settings,
  ArrowRight,
} from "lucide-react";
import { Modal } from "../ui";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const commands = [
    {
      title: "Operational Dashboard",
      category: "Navigation",
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Document Repository Library",
      category: "Navigation",
      href: "/documents",
      icon: Files,
    },
    {
      title: "Human Verification Queue (6 items)",
      category: "Actions",
      href: "/review-queue",
      icon: CheckSquare,
    },
    {
      title: "Inspect INV-2026-9041 (DataCore SAN)",
      category: "Documents",
      href: "/documents/a1000000-0000-0000-0000-000000009041/review",
      icon: FileSearch,
    },
    {
      title: "Autonomous 3-Way Match Reconciler",
      category: "Cross-Document",
      href: "/matching",
      icon: GitCompare,
    },
    {
      title: "Evidence-Grounded AI Assistant (RTX 3050)",
      category: "AI Copilot",
      href: "/assistant",
      icon: Bot,
    },
    {
      title: "Spend & Exposure Analytics",
      category: "Analytics",
      href: "/analytics",
      icon: BarChart3,
    },
    {
      title: "Workspace Governance & RBAC Roles",
      category: "Administration",
      href: "/settings",
      icon: Settings,
    },
  ];

  const filtered = commands.filter((c) =>
    c.title.toLowerCase().includes(query.toLowerCase()) ||
    c.category.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (href: string) => {
    navigate(href);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Global Command Palette"
      description="Quick navigation and forensic search across documents and queues"
      maxWidth="lg"
    >
      <div className="space-y-3">
        {/* Search Input */}
        <div className="relative flex items-center">
          <Search className="absolute left-3 w-4 h-4 text-ink-muted pointer-events-none" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands, document IDs, or vendors..."
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-surface-subtle border border-hairline text-xs text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>

        {/* Results List */}
        <div className="max-h-72 overflow-y-auto space-y-1">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-xs text-ink-muted">
              No matching commands or documents found.
            </div>
          ) : (
            filtered.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.href}
                  onClick={() => handleSelect(item.href)}
                  className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-surface-hover/80 text-left transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-surface-elevated border border-hairline flex items-center justify-center text-ink-muted group-hover:text-brand-light">
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-ink-primary group-hover:text-brand-light">
                        {item.title}
                      </div>
                      <div className="text-[10px] font-mono text-ink-muted">
                        {item.category}
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
};
