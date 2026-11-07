import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ShieldCheck, Database, Cpu } from 'lucide-react';

export const MegaFooter: React.FC = () => {
  const productSections = [
    { label: 'Spatial OCR Grounding', href: '#spatial-grounding' },
    { label: 'Deterministic Invariant Engine', href: '#invariant-engine' },
    { label: 'Three-Way Graph Reconciler', href: '#three-way-matching' },
    { label: 'Dual-Custody Segregation of Duties', href: '#dual-custody' },
    { label: 'Local Air-Gapped Copilot', href: '#air-gapped-copilot' },
    { label: 'Enterprise ERP Connectors', href: '#enterprise-integrations' },
    { label: 'Architecture FAQ', href: '#faq' },
  ];

  const workspaceLinks = [
    { label: 'Operational Dashboard', href: '/workspace' },
    { label: 'Document Studio Workstation', href: '/workspace/documents' },
    { label: 'Dual-Custody Review Queue', href: '/workspace/review' },
    { label: 'Three-Way Reconciler', href: '/workspace/matching' },
    { label: 'Financial AI Copilot', href: '/workspace/assistant' },
    { label: 'Spend Analytics Telemetry', href: '/workspace/analytics' },
    { label: '7-Tier RBAC Governance', href: '/workspace/settings' },
  ];

  const legalLinks = [
    { label: 'SOC 2 Type II Compliance', href: '#' },
    { label: 'PostgreSQL Row-Level Security (RLS)', href: '#' },
    { label: 'RTX 3050 CUDA 12.4 Air-Gap Architecture', href: '#' },
    { label: 'FastAPI OpenAPI Specifications', href: 'http://127.0.0.1:8000/docs' },
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
              Autonomous enterprise document intelligence platform reconciling invoices, purchase orders, and goods receipts with cent-level mathematical precision and dual-custody governance.
            </p>

            <div className="pt-2 flex flex-col gap-1.5 font-mono text-xs">
              <div className="flex items-center gap-2 text-white/70">
                <ShieldCheck className="w-4 h-4 text-ops-cyan" />
                <span>Zero-Tolerance Invariant Parity Active</span>
              </div>
              <div className="flex items-center gap-2 text-white/70">
                <Cpu className="w-4 h-4 text-ops-blue" />
                <span>Local CUDA 12.4 Hardware Inference Engine</span>
              </div>
            </div>
          </div>

          {/* Links Columns */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-8">
            {/* Column 1: Core Platform */}
            <div className="space-y-4">
              <span className="font-mono text-xs font-semibold uppercase tracking-widest text-white block">
                [ PLATFORM_CORE ]
              </span>
              <ul className="space-y-2.5 font-mono text-xs text-ops-textMuted">
                {productSections.map((item) => (
                  <li key={item.label}>
                    <a href={item.href} className="hover:text-ops-cyan transition-colors">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Column 2: Workspace */}
            <div className="space-y-4">
              <span className="font-mono text-xs font-semibold uppercase tracking-widest text-white block">
                [ WORKSPACE_APPS ]
              </span>
              <ul className="space-y-2.5 font-mono text-xs text-ops-textMuted">
                {workspaceLinks.map((item) => (
                  <li key={item.label}>
                    <Link to={item.href} className="hover:text-ops-cyan transition-colors">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Column 3: Security & Architecture */}
            <div className="space-y-4">
              <span className="font-mono text-xs font-semibold uppercase tracking-widest text-white block">
                [ GOVERNANCE ]
              </span>
              <ul className="space-y-2.5 font-mono text-xs text-ops-textMuted">
                {legalLinks.map((item) => (
                  <li key={item.label}>
                    <a href={item.href} className="hover:text-ops-cyan transition-colors">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs text-ops-textDim">
          <div>
            &copy; 2026 LedgerOne Technologies Inc. All rights reserved.
          </div>
          <div className="flex items-center gap-6">
            <span>[ SYSTEM_STATUS ]: OPERATIONAL (100.0%)</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
