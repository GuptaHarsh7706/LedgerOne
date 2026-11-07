import React from 'react';
import { ArrowUpRight } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'gradient';
  size?: 'sm' | 'md' | 'lg';
  withArrow?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  withArrow = false,
  icon,
  fullWidth = false,
  children,
  className = '',
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-full transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none select-none tracking-wide';

  const sizeStyles = {
    sm: 'text-xs px-4 py-2 gap-1.5',
    md: 'text-sm px-6 py-2.5 gap-2',
    lg: 'text-base px-8 py-3.5 gap-2.5 font-semibold',
  };

  const variantStyles = {
    primary: 'bg-white text-ops-dark hover:bg-white/90 shadow-lg shadow-white/10 hover:shadow-cyan-500/20',
    gradient: 'bg-ops-gradient text-ops-dark font-semibold shadow-glow-cyan hover:brightness-110',
    secondary: 'bg-ops-card border border-white/15 text-white hover:bg-ops-cardElevated hover:border-white/30 shadow-md',
    outline: 'border border-white/20 text-white hover:bg-white/10 hover:border-white/40',
    ghost: 'text-ops-textMuted hover:text-white hover:bg-white/5',
  };

  const widthStyle = fullWidth ? 'w-full' : '';

  return (
    <button
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${widthStyle} ${className}`}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
      {withArrow && <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />}
    </button>
  );
};
