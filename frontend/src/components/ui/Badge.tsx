import React from "react";

export type BadgeVariant =
  | "verified"
  | "review"
  | "discrepancy"
  | "processing"
  | "ready"
  | "neutral"
  | "purple"
  | "teal"
  | "brand";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  withDot?: boolean;
  dot?: boolean;
  pulsing?: boolean;
  size?: "sm" | "md";
}

const variantStyles: Record<
  BadgeVariant,
  { container: string; dot: string }
> = {
  verified: {
    container: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    dot: "bg-emerald-400",
  },
  review: {
    container: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    dot: "bg-amber-400",
  },
  discrepancy: {
    container: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    dot: "bg-rose-400",
  },
  processing: {
    container: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    dot: "bg-sky-400",
  },
  ready: {
    container: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    dot: "bg-indigo-400",
  },
  neutral: {
    container: "bg-surface-elevated text-ink-secondary border-hairline",
    dot: "bg-slate-400",
  },
  purple: {
    container: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    dot: "bg-purple-400",
  },
  teal: {
    container: "bg-teal-500/10 text-teal-400 border-teal-500/20",
    dot: "bg-teal-400",
  },
  brand: {
    container: "bg-brand/10 text-brand-light border-brand/20",
    dot: "bg-brand-light",
  },
};

export function Badge({
  variant = "neutral",
  withDot = false,
  dot = false,
  pulsing = false,
  size = "sm",
  className = "",
  children,
  ...props
}: BadgeProps) {
  const meta = variantStyles[variant] || variantStyles.neutral;
  const showDot = withDot || dot;
  const sizeClasses =
    size === "sm"
      ? "text-[10px] px-2 py-0.5 gap-1.5"
      : "text-xs px-2.5 py-1 gap-1.5";

  return (
    <span
      className={`inline-flex items-center font-mono font-medium rounded-full border ${meta.container} ${sizeClasses} ${className}`}
      {...props}
    >
      {showDot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot} ${
            pulsing ? "animate-pulse" : ""
          }`}
        />
      )}
      <span>{children}</span>
    </span>
  );
}

export default Badge;
