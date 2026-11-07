import React, { forwardRef } from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "subtle";

export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  icon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-brand hover:bg-brand-light text-white font-semibold shadow-hairline-glow border border-brand/50 hover:border-brand-light active:scale-[0.98]",
  secondary:
    "bg-surface-card hover:bg-surface-hover text-ink-primary border border-hairline hover:border-hairline-strong active:scale-[0.98]",
  outline:
    "bg-transparent hover:bg-surface-subtle text-ink-primary border border-hairline-strong hover:border-white/20 active:scale-[0.98]",
  ghost:
    "bg-transparent hover:bg-surface-hover text-ink-secondary hover:text-ink-primary border border-transparent",
  danger:
    "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 hover:border-rose-500/40 active:scale-[0.98]",
  subtle:
    "bg-surface-subtle hover:bg-surface-hover text-ink-secondary hover:text-ink-primary border border-hairline",
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: "h-6 px-2 text-[10px] gap-1 rounded",
  sm: "h-7 px-2.5 text-[11px] gap-1.5 rounded-md",
  md: "h-8 px-3 text-xs gap-2 rounded-md",
  lg: "h-9 px-4 text-sm gap-2 rounded-lg",
  icon: "h-7 w-7 p-0 flex items-center justify-center rounded-md",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "secondary",
      size = "md",
      isLoading = false,
      loading,
      leftIcon,
      rightIcon,
      icon,
      className = "",
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const isBusy = isLoading || !!loading;
    const effectiveLeftIcon = leftIcon || icon;

    return (
      <button
        ref={ref}
        disabled={disabled || isBusy}
        className={`inline-flex items-center justify-center font-medium transition-all duration-150 select-none focus:outline-none focus:ring-1 focus:ring-brand-light/50 disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {isBusy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          effectiveLeftIcon && <span className="shrink-0">{effectiveLeftIcon}</span>
        )}
        {children && <span>{children}</span>}
        {!isBusy && rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = "Button";
export default Button;
