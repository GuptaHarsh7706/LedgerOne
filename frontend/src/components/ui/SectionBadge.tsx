import React from 'react';

interface SectionBadgeProps {
  number: string; // e.g. "01"
  title?: string; // e.g. "HERO"
  label?: string; // alias for title
  total?: string | number; // default "11"
  className?: string;
}

export const SectionBadge: React.FC<SectionBadgeProps> = ({ 
  number, 
  title, 
  label, 
  total = '11', 
  className = '' 
}) => {
  const displayTitle = label || title || 'MODULE';
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-ops-card/80 backdrop-blur-md font-mono text-xs tracking-wider uppercase text-ops-textMuted ${className}`}>
      <span className="text-ops-cyan">[ {number} / {total} ]</span>
      <span className="w-1.5 h-1.5 rounded-full bg-ops-cyan animate-pulse"></span>
      <span className="text-white font-medium">{displayTitle}</span>
    </div>
  );
};
