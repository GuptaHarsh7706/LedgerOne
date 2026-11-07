import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Menu, X, Shield, Cpu, ExternalLink } from 'lucide-react';
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
    { label: 'Spatial OCR', href: '#spatial-grounding' },
    { label: 'Invariant Engine', href: '#invariant-engine' },
    { label: '3-Way Match', href: '#three-way-matching' },
    { label: 'Dual Custody', href: '#dual-custody' },
    { label: 'Air-Gapped AI', href: '#air-gapped-copilot' },
    { label: 'ERP Connectors', href: '#enterprise-integrations' },
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
        <Link to="/" className="flex items-center gap-2.5 group mr-6 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-ops-blue via-ops-cyan to-ops-yellow p-[1px] flex items-center justify-center transition-transform group-hover:scale-105">
            <div className="w-full h-full bg-ops-bg rounded-[7px] flex items-center justify-center">
              <span className="font-mono font-bold text-xs text-ops-cyan">L1</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-bold tracking-tight text-white text-base leading-none">LedgerOne</span>
            <span className="font-mono text-[9px] text-ops-textDim tracking-widest uppercase">FINANCIAL AI</span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <div className="hidden lg:flex items-center gap-5 xl:gap-6">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-xs font-mono tracking-wider uppercase text-ops-textMuted hover:text-white transition-colors duration-200"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Action Controls */}
        <div className="hidden sm:flex items-center gap-3">
          <Button
            size="sm"
            variant="primary"
            onClick={() => navigate('/login')}
            icon={<ArrowRight className="w-3.5 h-3.5" />}
          >
            Launch Core
          </Button>
        </div>

        {/* Mobile Menu Trigger */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden p-2 rounded-full text-ops-textMuted hover:text-white focus:outline-none"
          aria-label="Toggle Navigation"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </nav>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-x-4 top-24 rounded-2xl bg-ops-card border border-white/15 p-6 shadow-2xl flex flex-col gap-4 lg:hidden z-50">
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
          <Button
            size="md"
            variant="primary"
            onClick={() => {
              setMobileMenuOpen(false);
              navigate('/login');
            }}
            className="w-full mt-2"
          >
            Launch Enterprise Workspace
          </Button>
        </div>
      )}
    </header>
  );
};
