import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

export const MegaFooter: React.FC = () => {
  const quickLinks = [
    { label: 'about', href: '#who-we-are' },
    { label: 'how it works', href: '#how-it-works' },
    { label: 'process', href: '#process' },
    { label: 'pricing', href: '#pricing' },
    { label: 'case Study', href: '#case-studies' },
    { label: 'FAQ', href: '#faq' },
    { label: 'Insights', href: '#insights' },
    { label: 'Reviews', href: '#testimonials' },
  ];

  const legalLinks = [
    { label: 'Privacy Policy', href: '#' },
    { label: 'Terms of Service', href: '#' },
    { label: 'SOC 2 Type II Certification', href: '#' },
    { label: 'Security & Privacy Architecture', href: '#' },
  ];

  const socialLinks = [
    { label: '[ X / TWITTER ]', href: 'https://x.com' },
    { label: '[ LINKEDIN ]', href: 'https://linkedin.com' },
    { label: '[ GITHUB ]', href: 'https://github.com/GuptaHarsh7706/autonomous-ai-engineering-ecosystem' },
    { label: '[ DISCORD ]', href: 'https://discord.com' },
  ];

  return (
    <footer className="relative bg-ops-dark border-t border-white/10 pt-20 pb-12 overflow-hidden">
      {/* Background Radial Glow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-gradient-to-t from-ops-blue/15 via-ops-cyan/10 to-transparent blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10">
        {/* Top Branding & Direct Contact */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 pb-16 border-b border-white/10">
          <div className="lg:col-span-5 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-ops-blue via-ops-cyan to-ops-yellow p-[1px] flex items-center justify-center">
                <div className="w-full h-full bg-ops-bg rounded-[11px] flex items-center justify-center">
                  <span className="font-mono font-bold text-sm text-ops-cyan">L1</span>
                </div>
              </div>
              <div>
                <span className="text-xl font-bold tracking-tight text-white block">LedgerOne</span>
                <span className="font-mono text-[10px] text-ops-cyan tracking-widest uppercase">Autonomous Financial Operations</span>
              </div>
            </div>

            <p className="text-ops-textMuted text-sm max-w-sm leading-relaxed">
              Autonomous AI-powered document intelligence and financial operations platform. Reconciling invoices, purchase orders, and goods receipts with zero human cognitive fatigue.
            </p>

            <div className="pt-2 flex flex-col gap-1.5 font-mono text-xs">
              <a href="mailto:hello@ledgerone.internal" className="text-white hover:text-ops-cyan transition-colors flex items-center gap-2">
                <span>hello@ledgerone.internal</span>
                <ArrowUpRight className="w-3.5 h-3.5 opacity-60" />
              </a>
              <span className="text-ops-textMuted">+1 (415) 245-8890 • San Francisco, CA</span>
            </div>
          </div>

          {/* Navigation Links Column */}
          <div className="lg:col-span-3 space-y-4">
            <span className="font-mono text-xs font-semibold uppercase tracking-widest text-ops-cyan block">
              [ NAVIGATION ]
            </span>
            <ul className="space-y-2.5">
              {quickLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="font-mono text-xs uppercase tracking-wider text-ops-textMuted hover:text-white transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links Column */}
          <div className="lg:col-span-2 space-y-4">
            <span className="font-mono text-xs font-semibold uppercase tracking-widest text-ops-cyan block">
              [ LEGAL & TRUST ]
            </span>
            <ul className="space-y-2.5">
              {legalLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="font-mono text-xs uppercase tracking-wider text-ops-textMuted hover:text-white transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Socials & Community */}
          <div className="lg:col-span-2 space-y-4">
            <span className="font-mono text-xs font-semibold uppercase tracking-widest text-ops-cyan block">
              [ COMMUNITY ]
            </span>
            <ul className="space-y-2.5">
              {socialLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs uppercase tracking-wider text-ops-textMuted hover:text-ops-cyan transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Copyright & Status */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs text-ops-textDim">
          <div className="flex items-center gap-3">
            <span className="inline-block w-2 h-2 rounded-full bg-ops-cyan animate-pulse" />
            <span>Systems Normal: Neon Cloud + RTX 3050 CUDA 12.4 Operational</span>
          </div>

          <div>
            &copy; {new Date().getFullYear()} LedgerOne Platform Inc. Inspired by Opsyra Design Language.
          </div>
        </div>
      </div>
    </footer>
  );
};
