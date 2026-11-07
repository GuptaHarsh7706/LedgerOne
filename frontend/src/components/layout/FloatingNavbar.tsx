import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Menu, X, Shield, Cpu } from 'lucide-react';
import { Button } from '../ui/Button';

export const FloatingNavbar: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLinks = [
    { label: 'about', href: '#who-we-are' },
    { label: 'Why LedgerOne', href: '#why-opsayra' },
    { label: 'How It Works', href: '#how-it-works' },
    { label: 'Process', href: '#process' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'Case Studies', href: '#case-studies' },
    { label: 'FAQ', href: '#faq' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 sm:px-6 pt-4 sm:pt-6 transition-all duration-300">
      <nav
        className={`w-full max-w-6xl mx-auto flex items-center justify-between px-5 sm:px-7 py-3 rounded-full border transition-all duration-300 ${
          scrolled
            ? 'bg-ops-card/85 backdrop-blur-xl border-white/15 shadow-2xl shadow-black/80'
            : 'bg-ops-card/60 backdrop-blur-lg border-white/10'
        }`}
      >
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-ops-blue via-ops-cyan to-ops-yellow p-[1px] flex items-center justify-center transition-transform group-hover:scale-105">
            <div className="w-full h-full bg-ops-bg rounded-[7px] flex items-center justify-center">
              <span className="font-mono font-bold text-xs text-ops-cyan">L1</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-bold tracking-tight text-white text-base leading-none">LedgerOne</span>
            <span className="font-mono text-[9px] text-ops-textDim tracking-widest uppercase">Autonomous AI</span>
          </div>
        </Link>

        {/* Desktop Nav Links */}
        <div className="hidden lg:flex items-center gap-7">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-xs font-mono tracking-wider uppercase text-ops-textMuted hover:text-white transition-colors duration-150"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Action Button & App Access */}
        <div className="hidden sm:flex items-center gap-3">
          <button
            onClick={() => navigate('/workspace')}
            className="px-4 py-2 rounded-full border border-white/15 text-xs font-mono uppercase tracking-wider text-ops-cyan bg-ops-cyan/5 hover:bg-ops-cyan/15 hover:border-ops-cyan/40 transition-all flex items-center gap-1.5"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Workspace</span>
          </button>

          <Button
            size="sm"
            variant="primary"
            withArrow
            onClick={() => navigate('/workspace')}
            className="text-xs tracking-wider uppercase font-mono font-semibold"
          >
            Book Strategy Call
          </Button>
        </div>

        {/* Mobile Menu Trigger */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden p-1.5 text-ops-textMuted hover:text-white"
          aria-label="Toggle Navigation"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </nav>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-x-4 top-20 bg-ops-card border border-white/15 rounded-3xl p-6 shadow-2xl backdrop-blur-2xl flex flex-col gap-4 z-50">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm font-mono tracking-wider uppercase text-ops-textMuted hover:text-white py-2 border-b border-white/5"
            >
              {link.label}
            </a>
          ))}
          <div className="pt-2 flex flex-col gap-3">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                navigate('/workspace');
              }}
              className="w-full py-3 rounded-full border border-ops-cyan/40 text-ops-cyan font-mono text-xs uppercase tracking-wider text-center"
            >
              Open Enterprise Workspace
            </button>
            <Button
              variant="primary"
              className="w-full text-xs font-mono uppercase"
              onClick={() => {
                setMobileMenuOpen(false);
                navigate('/workspace');
              }}
            >
              Book Strategy Call
            </Button>
          </div>
        </div>
      )}
    </header>
  );
};
