import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus } from 'lucide-react';

export interface AccordionItem {
  id: string;
  question?: string;
  title?: string;
  answer?: string;
  content?: string;
  badge?: string;
}

interface AccordionProps {
  items: AccordionItem[];
  defaultOpenId?: string;
  className?: string;
}

export const Accordion: React.FC<AccordionProps> = ({
  items,
  defaultOpenId,
  className = '',
}) => {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId || null);

  const toggle = (id: string) => {
    setOpenId(openId === id ? null : id);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {items.map((item) => {
        const isOpen = openId === item.id;
        const heading = item.question || item.title || '';
        const body = item.answer || item.content || '';
        return (
          <div
            key={item.id}
            className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
              isOpen
                ? 'bg-ops-card border-ops-cyan/30 shadow-glow-cyan/10'
                : 'bg-ops-cardSubtle border-white/10 hover:border-white/20'
            }`}
          >
            <button
              onClick={() => toggle(item.id)}
              className="w-full px-6 py-5 flex items-center justify-between text-left text-white font-medium text-base sm:text-lg gap-4"
            >
              <div className="flex items-center gap-3">
                {item.badge && (
                  <span className="font-mono text-xs px-2.5 py-0.5 rounded-full border border-white/10 text-ops-cyan bg-ops-cyan/5">
                    {item.badge}
                  </span>
                )}
                <span>{heading}</span>
              </div>
              <div className={`w-8 h-8 rounded-full border border-white/10 flex items-center justify-center shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180 bg-white/10 border-ops-cyan/40 text-ops-cyan' : 'text-ops-textMuted'}`}>
                {isOpen ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              </div>
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                >
                  <div className="px-6 pb-6 text-sm sm:text-base text-ops-textMuted leading-relaxed font-sans border-t border-white/5 pt-4">
                    {body}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
};
