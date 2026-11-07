import React from "react";

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="py-12 px-4 text-center flex flex-col items-center justify-center space-y-2.5">
      <div className="w-10 h-10 rounded-xl bg-surface-elevated border border-hairline flex items-center justify-center text-ink-muted shadow-subtle-card">
        {icon}
      </div>
      <div className="space-y-1 max-w-sm">
        <h4 className="font-semibold text-ink-primary text-xs tracking-tight">{title}</h4>
        <p className="text-[11px] text-ink-muted leading-relaxed">{description}</p>
      </div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

export default EmptyState;
