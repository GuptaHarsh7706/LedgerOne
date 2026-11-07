import React from 'react';

interface MarqueeProps {
  children?: React.ReactNode;
  speed?: 'normal' | 'fast';
  pauseOnHover?: boolean;
  className?: string;
}

const DEFAULT_BRANDS = [
  { name: 'SAP S/4HANA', code: 'SAP BAPI v4' },
  { name: 'Oracle NetSuite', code: 'SuiteTalk REST' },
  { name: 'Workday Financials', code: 'EIB Connector' },
  { name: 'Microsoft Dynamics 365', code: 'OData API' },
  { name: 'Amazon S3 Vault', code: 'SigV4 Storage' },
  { name: 'Neon PostgreSQL', code: 'pgvector RLS' },
  { name: 'NVIDIA CUDA 12.4', code: 'Local GPU Tensor' },
];

export const Marquee: React.FC<MarqueeProps> = ({
  children,
  speed = 'normal',
  pauseOnHover = true,
  className = '',
}) => {
  const animClass = speed === 'fast' ? 'animate-marquee-fast' : 'animate-marquee';

  const defaultContent = (
    <div className="flex items-center gap-12 sm:gap-16">
      {DEFAULT_BRANDS.map((b, i) => (
        <div key={i} className="flex items-center gap-3 font-mono text-xs text-white/50 hover:text-white transition-colors">
          <span className="w-1.5 h-1.5 rounded-full bg-ops-cyan" />
          <span className="font-bold tracking-wider">{b.name}</span>
          <span className="text-[10px] text-white/30 font-light">[{b.code}]</span>
        </div>
      ))}
    </div>
  );

  const content = children || defaultContent;

  return (
    <div className={`overflow-hidden flex w-full select-none ${pauseOnHover ? 'hover:[&>div]:pause' : ''} ${className}`}>
      <div className={`flex shrink-0 items-center gap-12 sm:gap-16 ${animClass}`}>
        {content}
      </div>
      <div className={`flex shrink-0 items-center gap-12 sm:gap-16 ${animClass}`} aria-hidden="true">
        {content}
      </div>
    </div>
  );
};
