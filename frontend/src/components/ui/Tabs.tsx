import React from "react";

export interface TabItem {
  id: string;
  label: string;
  badge?: string | number;
  badgeVariant?: "neutral" | "brand" | "amber" | "rose" | "emerald";
  icon?: React.ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ items, activeId, onChange, className = "" }: TabsProps) {
  return (
    <div className={`inline-flex items-center gap-1 p-0.5 rounded-lg bg-surface-subtle border border-hairline select-none ${className}`}>
      {items.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 ${
              isActive
                ? "bg-surface-elevated text-ink-primary shadow-subtle-card border border-hairline-strong font-semibold"
                : "text-ink-secondary hover:text-ink-primary hover:bg-surface-hover/50 border border-transparent"
            }`}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full leading-none ${
                  isActive
                    ? "bg-brand/20 text-brand-light"
                    : "bg-surface-card text-ink-muted"
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
