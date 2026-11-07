import React from "react";
import { clsx } from "clsx";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "subtle";
  size?: "xs" | "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "secondary",
      size = "md",
      isLoading = false,
      loading = false,
      leftIcon,
      rightIcon,
      icon,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const isBusy = isLoading || loading;
    const actualLeftIcon = leftIcon || icon;

    const baseStyles =
      "inline-flex items-center justify-center font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-40 select-none active:scale-[0.98]";

    const sizeStyles = {
      xs: "h-6 px-2 text-[11px] rounded gap-1",
      sm: "h-7 px-2.5 text-xs rounded-md gap-1.5",
      md: "h-8 px-3 text-xs rounded-lg gap-2",
      lg: "h-9 px-4 text-sm rounded-lg gap-2",
      icon: "h-8 w-8 rounded-lg p-0",
    };

    const variantStyles = {
      primary:
        "bg-brand hover:bg-brand-light text-white font-semibold shadow-hairline-glow hover:shadow-spotlight",
      secondary:
        "bg-surface-elevated hover:bg-surface-secondary text-ink-primary border border-hairline hover:border-hairline-strong shadow-subtle-card",
      outline:
        "bg-transparent hover:bg-surface-subtle text-ink-primary border border-hairline hover:border-hairline-strong",
      ghost:
        "bg-transparent hover:bg-surface-subtle text-ink-secondary hover:text-ink-primary",
      danger:
        "bg-status-danger/10 hover:bg-status-danger/20 text-status-danger border border-status-danger/30",
      subtle:
        "bg-surface-subtle hover:bg-surface-hover text-ink-secondary hover:text-ink-primary border border-hairline",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isBusy}
        className={clsx(baseStyles, sizeStyles[size], variantStyles[variant], className)}
        {...props}
      >
        {isBusy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
        ) : (
          actualLeftIcon && <span className="shrink-0">{actualLeftIcon}</span>
        )}
        {children && <span>{children}</span>}
        {!isBusy && rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = "Button";
