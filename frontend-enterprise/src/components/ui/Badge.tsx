import React from "react";
import { clsx } from "clsx";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "verified" | "review" | "discrepancy" | "processing" | "ready" | "neutral" | "brand";
  size?: "sm" | "md";
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = "neutral",
  size = "sm",
  dot = false,
  children,
  ...props
}) => {
  const baseStyles =
    "inline-flex items-center font-mono font-medium uppercase tracking-wider rounded-full select-none";

  const sizeStyles = {
    sm: "px-2 py-0.5 text-[10px] gap-1.5",
    md: "px-2.5 py-1 text-xs gap-1.5",
  };

  const variantStyles = {
    verified: "bg-status-success/10 text-status-success border border-status-success/20",
    review: "bg-status-warning/10 text-status-warning border border-status-warning/20",
    discrepancy: "bg-status-danger/10 text-status-danger border border-status-danger/25",
    processing: "bg-status-info/10 text-status-info border border-status-info/20",
    ready: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    neutral: "bg-surface-elevated text-ink-secondary border border-hairline",
    brand: "bg-brand/10 text-brand-light border border-brand/20",
  };

  const dotColor = {
    verified: "bg-status-success",
    review: "bg-status-warning",
    discrepancy: "bg-status-danger",
    processing: "bg-status-info animate-pulse",
    ready: "bg-emerald-400",
    neutral: "bg-ink-muted",
    brand: "bg-brand-light",
  };

  return (
    <span
      className={clsx(baseStyles, sizeStyles[size], variantStyles[variant], className)}
      {...props}
    >
      {dot && (
        <span
          className={clsx("w-1.5 h-1.5 rounded-full shrink-0", dotColor[variant])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
};
