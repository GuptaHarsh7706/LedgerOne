import React from 'react';
import { SectionBadge } from '../../../components/ui/SectionBadge';
import { CategoryPill } from '../../../components/ui/CategoryPill';
import { GlowCard } from '../../../components/ui/GlowCard';
import { Database, Link, CheckCircle2, Terminal, ArrowUpRight } from 'lucide-react';

const INTEGRATIONS = [
  {
    name: 'SAP S/4HANA',
    type: 'BAPI & OData v4',
    desc: 'Direct posting to SAP General Ledger (BKPF/BSEG) and Purchase Order History (EKBE) with document parking.',
    latency: '< 180ms',
    tag: 'CERTIFIED CONNECTOR'
  },
  {
    name: 'Oracle NetSuite',
    type: 'SuiteTalk REST Web Services',
    desc: 'Bi-directional synchronization of Vendor Bills, Bill Credits, Purchase Orders, and Item Receipts.',
    latency: '< 120ms',
    tag: 'REST API'
  },
  {
    name: 'Workday Financials',
    type: 'Enterprise Interface Builder (EIB)',
    desc: 'Automated settlement vouchers, multi-entity cost center allocation, and supplier contract tracking.',
    latency: '< 210ms',
    tag: 'EIB INTEGRATION'
  },
  {
    name: 'Microsoft Dynamics 365',
    type: 'OData REST Endpoint',
    desc: 'Touchless Accounts Payable automation, invoice journal creation, and 3-way match validation.',
    latency: '< 95ms',
    tag: 'NATIVE WEBHOOKS'
  }
];

export const EnterpriseIntegrationsSection: React.FC = () => {
  return (
    <section id="enterprise-integrations" className="relative py-28 px-4 sm:px-6 lg:px-8 border-t border-white/[0.05] overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 right-1/4 w-96 h-96 bg-ops-cyan/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
          <div>
            <SectionBadge number="06" total="07" label="ERP CONNECTIVITY" className="mb-4" />
            <CategoryPill label="BIDIRECTIONAL WRITEBACK" className="mb-4" />
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white max-w-2xl leading-[1.15]">
              Seamless Commit to <span className="text-ops-gradient">Enterprise General Ledgers</span>
            </h2>
          </div>
          <p className="text-white/60 text-base sm:text-lg max-w-md font-sans leading-relaxed">
            Eliminate manual CSV export and copy-pasting. Validated transactions generate structured accounting payloads committed directly to your enterprise system of record.
          </p>
        </div>

        {/* Integration Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {INTEGRATIONS.map((integ, idx) => (
            <GlowCard key={idx} className="p-6 flex flex-col justify-between group">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-mono text-ops-cyan px-2 py-0.5 rounded bg-ops-cyan/10 border border-ops-cyan/30">
                    {integ.tag}
                  </span>
                  <span className="text-[10px] font-mono text-white/40">{integ.latency}</span>
                </div>

                <h3 className="text-lg font-bold text-white mb-1">{integ.name}</h3>
                <div className="text-xs font-mono text-ops-blue mb-4">{integ.type}</div>

                <p className="text-xs text-white/60 leading-relaxed font-sans mb-6">
                  {integ.desc}
                </p>
              </div>

              <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono text-white/40">
                <span>STATUS: OPERATIONAL</span>
                <CheckCircle2 className="w-4 h-4 text-ops-cyan" />
              </div>
            </GlowCard>
          ))}
        </div>

        {/* Code payload banner */}
        <div className="p-6 rounded-2xl bg-[#090A12] border border-white/[0.08] font-mono text-xs text-white/70 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Terminal className="w-5 h-5 text-ops-cyan shrink-0" />
            <span>Standardized JSON Journal Payload Parity across SAP BKPF, NetSuite VendorBill, and Dynamics JournalEntry.</span>
          </div>
          <a
            href="/login"
            className="text-ops-cyan hover:underline shrink-0 text-xs flex items-center gap-1"
          >
            Inspect API Schema →
          </a>
        </div>
      </div>
    </section>
  );
};
