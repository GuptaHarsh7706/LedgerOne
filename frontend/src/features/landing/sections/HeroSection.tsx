import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Sparkles, CheckCircle2, ArrowRight, ShieldCheck, FileText, Cpu, RefreshCw } from 'lucide-react';
import { SectionBadge } from '../../../components/ui/SectionBadge';
import { Button } from '../../../components/ui/Button';
import { HeroInteractiveCanvas } from '../../../components/3d/HeroInteractiveCanvas';
import { Marquee } from '../../../components/ui/Marquee';

export const HeroSection: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'extraction' | 'invariants' | 'matching'>('extraction');

  const partnerLogos = [
    { name: 'NORTHLINE LOGISTICS', icon: '✦' },
    { name: 'CARELOOP HEALTH', icon: '◈' },
    { name: 'FINOVA CAPITAL', icon: '▲' },
    { name: 'MOTIONGRID STUDIO', icon: '■' },
    { name: 'PURESTORAGE CORP', icon: '◆' },
    { name: 'CLOUDSCALE INFRA', icon: '●' },
  ];

  return (
    <section id="hero" className="relative min-h-screen pt-32 sm:pt-40 pb-20 overflow-hidden flex flex-col justify-between">
      {/* Three.js Interactive 3D Canvas Background */}
      <HeroInteractiveCanvas />

      {/* Atmospheric Radial Gradient Lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[550px] bg-gradient-to-b from-ops-blue/20 via-ops-cyan/10 to-transparent blur-[140px] pointer-events-none z-0" />

      {/* Vertical Hairline Grid Guides */}
      <div className="absolute inset-0 max-w-7xl mx-auto px-6 pointer-events-none flex justify-between z-0">
        <div className="w-[1px] h-full bg-white/[0.04]" />
        <div className="w-[1px] h-full bg-white/[0.04]" />
        <div className="w-[1px] h-full bg-white/[0.04]" />
        <div className="w-[1px] h-full bg-white/[0.04]" />
      </div>

      <div className="max-w-6xl mx-auto px-6 relative z-10 text-center flex flex-col items-center">
        {/* Top Tag Pill */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="mb-6"
        >
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full border border-ops-cyan/30 bg-ops-cyan/5 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-ops-cyan animate-pulse" />
            <span className="font-mono text-xs font-semibold tracking-widest uppercase text-ops-cyan">
              AI-POWERED BUSINESS AUTOMATION
            </span>
          </div>
        </motion.div>

        {/* Master Two-Line Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }}
          className="text-4xl sm:text-6xl md:text-7xl lg:text-[80px] font-normal tracking-tight text-white leading-[1.08] max-w-4xl"
        >
          Turn Manual Work into{' '}
          <span className="text-ops-gradient font-medium block sm:inline">
            Intelligent Systems
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
          className="mt-6 text-base sm:text-xl text-ops-textMuted max-w-2xl leading-relaxed"
        >
          We design intelligent automation systems that streamline workflows, eliminate manual financial audits, and help enterprise teams operate with complete clarity.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
          className="mt-10 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto"
        >
          <Button
            size="lg"
            variant="primary"
            withArrow
            onClick={() => navigate('/workspace')}
            className="w-full sm:w-auto text-sm font-mono uppercase tracking-wider group"
          >
            Get Started
          </Button>

          <Button
            size="lg"
            variant="secondary"
            onClick={() => navigate('/workspace')}
            className="w-full sm:w-auto text-sm font-mono uppercase tracking-wider text-white"
          >
            Book a Demo
          </Button>
        </motion.div>

        {/* Interactive Automation Preview Card (Hero Showcase) */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.45, ease: 'easeOut' }}
          className="mt-16 w-full max-w-4xl rounded-2xl bg-ops-card border border-white/15 p-4 sm:p-6 shadow-2xl relative overflow-hidden backdrop-blur-xl"
        >
          {/* Top Bar of Preview Card */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10 text-xs font-mono">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
              </div>
              <span className="text-ops-textDim">INV-2026-9041 // REAL-TIME INGESTION STREAM</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] uppercase tracking-wider flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Live Ingestion Active
              </span>
            </div>
          </div>

          {/* Tab Selector inside card */}
          <div className="flex items-center gap-2 mt-4 mb-5">
            <button
              onClick={() => setActiveTab('extraction')}
              className={`px-3 py-1.5 rounded-lg font-mono text-xs transition-colors flex items-center gap-1.5 ${
                activeTab === 'extraction'
                  ? 'bg-ops-cyan/15 text-ops-cyan border border-ops-cyan/40 font-medium'
                  : 'text-ops-textMuted hover:text-white bg-white/5 border border-transparent'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Spatial Extraction (99.8%)</span>
            </button>

            <button
              onClick={() => setActiveTab('invariants')}
              className={`px-3 py-1.5 rounded-lg font-mono text-xs transition-colors flex items-center gap-1.5 ${
                activeTab === 'invariants'
                  ? 'bg-ops-blue/20 text-ops-blue border border-ops-blue/40 font-medium'
                  : 'text-ops-textMuted hover:text-white bg-white/5 border border-transparent'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Invariant Engine (INV-001)</span>
            </button>

            <button
              onClick={() => setActiveTab('matching')}
              className={`px-3 py-1.5 rounded-lg font-mono text-xs transition-colors flex items-center gap-1.5 ${
                activeTab === 'matching'
                  ? 'bg-ops-yellow/20 text-ops-yellow border border-ops-yellow/40 font-medium'
                  : 'text-ops-textMuted hover:text-white bg-white/5 border border-transparent'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>3-Way Match Reconciler</span>
            </button>
          </div>

          {/* Interactive Card Viewport */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 text-left">
            {/* Left mini preview */}
            <div className="md:col-span-5 bg-ops-dark/80 rounded-xl border border-white/10 p-4 font-mono text-xs space-y-3">
              <div className="flex items-center justify-between text-ops-textDim">
                <span>DOCUMENT SOURCE</span>
                <span className="text-ops-cyan">PAGE 1 / 1</span>
              </div>
              <div className="h-40 rounded-lg bg-ops-card border border-white/10 relative p-3 overflow-hidden flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="h-2 w-28 bg-white/20 rounded" />
                  <div className="h-2 w-40 bg-white/10 rounded" />
                </div>
                {/* Simulated Bounding Box Pulse */}
                <div className="absolute top-12 left-6 right-6 border border-ops-cyan bg-ops-cyan/15 rounded p-2 text-[10px] text-ops-cyan flex items-center justify-between animate-pulse">
                  <span>TOTAL: $11,220.00</span>
                  <span className="text-[9px]">CONF 0.99</span>
                </div>
                <div className="flex justify-between text-[10px] text-ops-textDim">
                  <span>VENDOR: PureStorage Corp</span>
                  <span className="text-emerald-400">VERIFIED</span>
                </div>
              </div>
            </div>

            {/* Right breakdown */}
            <div className="md:col-span-7 bg-ops-dark/80 rounded-xl border border-white/10 p-4 font-mono text-xs flex flex-col justify-between">
              <div className="space-y-2.5">
                <div className="flex justify-between items-center text-ops-textDim pb-2 border-b border-white/5">
                  <span>METRIC / INVARIANT</span>
                  <span>EVIDENCE STATUS</span>
                </div>

                <div className="flex justify-between items-center py-1">
                  <span className="text-white">Line Item Summation (INV-001)</span>
                  <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> $10,200.00 MATCH
                  </span>
                </div>

                <div className="flex justify-between items-center py-1">
                  <span className="text-white">Tax Recalculation (INV-004)</span>
                  <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> 10% EXACT ($1,020.00)
                  </span>
                </div>

                <div className="flex justify-between items-center py-1">
                  <span className="text-white">Master Header Equation (INV-005)</span>
                  <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> TOTAL $11,220.00 ZERO DELTA
                  </span>
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-white/5 flex items-center justify-between text-[11px]">
                <span className="text-ops-textMuted">Dual-Custody Gate: AUTH_SOD_001</span>
                <span className="text-ops-cyan font-bold">READY FOR SETTLEMENT</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Marquee Header & Infinite Logo Ribbon */}
      <div className="mt-20 pt-10 border-t border-white/5 relative z-10">
        <p className="text-center font-mono text-xs uppercase tracking-widest text-ops-textDim mb-6">
          Trusted by Leading Space & Technology Organizations
        </p>

        <Marquee speed="normal">
          {partnerLogos.map((partner, i) => (
            <div key={i} className="flex items-center gap-3 opacity-60 hover:opacity-100 transition-opacity cursor-pointer">
              <span className="text-ops-cyan text-sm">{partner.icon}</span>
              <span className="font-mono text-sm tracking-wider font-semibold text-white whitespace-nowrap">
                {partner.name}
              </span>
            </div>
          ))}
        </Marquee>
      </div>
    </section>
  );
};
