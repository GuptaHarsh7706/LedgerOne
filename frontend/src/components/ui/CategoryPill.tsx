import React from 'react';

interface CategoryPillProps {
  children?: React.ReactNode;
  label?: string;
  variant?: 'cyan' | 'blue' | 'yellow';
  className?: string;
}

export const CategoryPill: React.FC<CategoryPillProps> = ({ 
  children, 
  label, 
  variant = 'cyan', 
  className = '' 
}) => {
  const content = label || children;
  const colorMap = {
    cyan: 'text-ops-cyan border-ops-cyan/30 bg-ops-cyan/5',
    blue: 'text-ops-blue border-ops-blue/30 bg-ops-blue/5',
    yellow: 'text-ops-yellow border-ops-yellow/30 bg-ops-yellow/5',
  };

  return (
    <span className={`inline-flex items-center font-mono text-[11px] font-semibold tracking-widest uppercase px-3 py-1 rounded-full border ${colorMap[variant]} ${className}`}>
      &#123; {content} &#125;
    </span>
  );
};
