import React, { forwardRef } from "react";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, leftIcon, rightIcon, error, className = "", id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-[11px] font-medium text-ink-secondary">
            {label}
          </label>
        )}
        <div className="relative w-full">
          {leftIcon && (
            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            className={`w-full h-8 px-2.5 rounded-md bg-surface-subtle border border-hairline text-xs text-ink-primary placeholder:text-ink-muted transition-all duration-150 focus:outline-none focus:border-brand-light focus:ring-1 focus:ring-brand-light/30 disabled:opacity-50 disabled:cursor-not-allowed ${
              leftIcon ? "pl-8" : ""
            } ${rightIcon ? "pr-8" : ""} ${
              error ? "border-rose-500/50 focus:border-rose-500" : ""
            } ${className}`}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted">
              {rightIcon}
            </div>
          )}
        </div>
        {error ? (
          <p className="text-[11px] text-rose-400 leading-tight">
            {error}
          </p>
        ) : hint ? (
          <p className="text-[10px] text-ink-muted leading-tight">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";
export default Input;
