import React from 'react';

interface MarqueeProps {
  children: React.ReactNode;
  speed?: 'normal' | 'fast';
  pauseOnHover?: boolean;
  className?: string;
}

export const Marquee: React.FC<MarqueeProps> = ({
  children,
  speed = 'normal',
  pauseOnHover = true,
  className = '',
}) => {
  const animClass = speed === 'fast' ? 'animate-marquee-fast' : 'animate-marquee';

  return (
    <div className={`overflow-hidden flex w-full select-none ${pauseOnHover ? 'hover:[&>div]:pause' : ''} ${className}`}>
      <div className={`flex shrink-0 items-center gap-12 sm:gap-16 ${animClass}`}>
        {children}
      </div>
      <div className={`flex shrink-0 items-center gap-12 sm:gap-16 ${animClass}`} aria-hidden="true">
        {children}
      </div>
    </div>
  );
};
