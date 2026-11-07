import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: 'cyan' | 'blue' | 'yellow' | 'gradient' | string;
  onClick?: () => void;
}

export const GlowCard: React.FC<GlowCardProps> = ({
  children,
  className = '',
  glowColor = 'cyan',
  onClick,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: -1000, y: -1000 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const glowStyles: Record<string, string> = {
    cyan: 'rgba(0, 255, 204, 0.15)',
    blue: 'rgba(12, 113, 255, 0.18)',
    yellow: 'rgba(255, 239, 20, 0.15)',
    gradient: 'rgba(0, 255, 204, 0.12)',
  };

  const activeColor = glowStyles[glowColor] || glowColor;

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setMousePos({ x: -1000, y: -1000 });
      }}
      onClick={onClick}
      whileHover={{ y: -4, transition: { duration: 0.25, ease: 'easeOut' } }}
      className={`relative rounded-2xl bg-ops-card border border-white/10 overflow-hidden shadow-card-elevated transition-colors duration-300 hover:border-white/20 ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {/* Radial Spotlight Overlay */}
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, ${activeColor}, transparent 40%)`,
        }}
      />

      {/* Card Content Surface */}
      <div className="relative z-10 h-full">
        {children}
      </div>
    </motion.div>
  );
};
