import React from "react";
import { clsx } from "clsx";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, leftIcon, rightIcon, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-ink-secondary">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-2.5 text-ink-muted pointer-events-none flex items-center">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            className={clsx(
              "w-full h-8 bg-surface-subtle border rounded-lg text-xs text-ink-primary placeholder:text-ink-muted transition-colors focus:outline-none focus:ring-1",
              leftIcon ? "pl-8" : "pl-3",
              rightIcon ? "pr-8" : "pr-3",
              error
                ? "border-status-danger/50 focus:border-status-danger focus:ring-status-danger/30"
                : "border-hairline focus:border-brand focus:ring-brand/30",
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-2.5 text-ink-muted flex items-center">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p className="text-[11px] text-status-danger">{error}</p>}
        {hint && !error && <p className="text-[11px] text-ink-muted">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
