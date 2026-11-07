import React from 'react';
import { SectionBadge } from '../../../components/ui/SectionBadge';
import { CategoryPill } from '../../../components/ui/CategoryPill';
import { Accordion } from '../../../components/ui/Accordion';

const FAQ_ITEMS = [
  {
    id: 'invariants',
    title: 'How does the invariant engine guarantee zero arithmetic errors?',
    content: 'LedgerOne executes deterministic double-entry mathematical checksums on every processed document. Instead of trusting raw LLM text generation, our engine parses line-item prices, quantities, taxes, and discounts into formal numeric types and tests formal equations: Σ(quantity × unit_price) = subtotal, and subtotal + tax = total. Any discrepancy exceeding specified cent tolerances immediately flags the document for human review with an exact arithmetic diff.'
  },
  {
    id: 'airgap',
    title: 'Can LedgerOne run completely on-premise or in an air-gapped private cloud?',
    content: 'Yes. LedgerOne is fully containerized and supports local GPU acceleration (NVIDIA RTX/A-series with CUDA 12.4). All OCR layout analysis, HNSW vector indexing, and embedding pipelines execute within your secure VPC or on-premise server. Zero confidential vendor or financial data ever leaves your defined network boundary.'
  },
  {
    id: 'matching',
    title: 'How does the 3-way matching reconciler handle price variances and partial shipments?',
    content: 'Our three-way reconciler builds a topological graph linking Purchase Orders (PO), Goods Receipt Notes (GRN), and Invoices. Configurable business rules specify acceptable tolerance thresholds (e.g. ±1% or $10.00). If a vendor delivers 80 of 100 units, LedgerOne automatically splits the PO line, clears the delivered amount for settlement, and creates an open accrual for the remaining balance.'
  },
  {
    id: 'sod',
    title: 'What segregation of duties (SoD) controls are enforced for dual-custody approval?',
    content: 'LedgerOne enforces a 7-tier Role-Based Access Control (RBAC) model backed by PostgreSQL Row-Level Security (RLS). Under our dual-custody policy, the user who uploads or edits an invoice cannot approve or release payment on that same document. Every action is cryptographically logged with user identity, timestamp, and IP address for audit compliance.'
  },
  {
    id: 'erp',
    title: 'Which ERP systems are supported for bidirectional writeback?',
    content: 'LedgerOne provides certified REST and webhook connectors for SAP S/4HANA, NetSuite, Microsoft Dynamics 365, Workday Financials, and Oracle Fusion. Reconciled invoices automatically generate validated journal entries and payment vouchers via your ERP’s native APIs without manual CSV imports.'
  },
  {
    id: 'grounding',
    title: 'How does spatial bounding-box grounding eliminate AI hallucinations?',
    content: 'Every extracted key-value pair is tied to 2D normalized coordinates [x1, y1, x2, y2] referencing the source document page. When viewing an extracted value in the LedgerOne workstation, hovering highlights the exact physical pixels on the PDF, allowing reviewers and external auditors to visually verify the origin of every number in milliseconds.'
  }
];

export const FAQSection: React.FC = () => {
  return (
    <section id="faq" className="relative py-28 px-4 sm:px-6 lg:px-8 border-t border-white/[0.05] overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/4 w-96 h-96 bg-ops-blue/5 rounded-full blur-[160px] pointer-events-none" />

      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <SectionBadge number="06" total="07" label="TECHNICAL ARCHITECTURE FAQ" className="mb-4" />
          <CategoryPill label="SYSTEM VERIFICATION" className="mb-4" />
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white mb-6">
            Frequently Asked <span className="text-ops-gradient">Technical Questions</span>
          </h2>
          <p className="text-white/60 text-base sm:text-lg leading-relaxed">
            Detailed specifications on LedgerOne’s mathematical invariants, security boundaries, and enterprise ERP integrations.
          </p>
        </div>

        {/* Accordion */}
        <Accordion items={FAQ_ITEMS} defaultOpenId="invariants" />

        {/* Footer Support Prompt */}
        <div className="mt-12 text-center text-xs font-mono text-white/40">
          REQUIRE CUSTOM INVARIANT EQUATIONS OR ON-PREM AIR-GAP ASSISTANCE?{' '}
          <a href="/login" className="text-ops-cyan hover:underline ml-1">
            OPEN ARCHITECTURE WORKSPACE →
          </a>
        </div>
      </div>
    </section>
  );
};
