import React from "react";
import { clsx } from "clsx";
import { FileQuestion } from "lucide-react";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
}) => {
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-dashed border-hairline bg-surface-subtle/40",
        className
      )}
    >
      <div className="w-10 h-10 rounded-xl bg-surface-elevated border border-hairline flex items-center justify-center text-ink-muted mb-3 shadow-subtle-card">
        {icon || <FileQuestion className="w-5 h-5 text-brand-light" />}
      </div>
      <h3 className="text-xs font-semibold text-ink-primary mb-1">{title}</h3>
      <p className="text-xs text-ink-muted max-w-sm mb-4 leading-relaxed">
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  );
};
