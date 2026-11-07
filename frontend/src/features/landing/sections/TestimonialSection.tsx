import React from 'react';
import { SectionBadge } from '../../../components/ui/SectionBadge';
import { CategoryPill } from '../../../components/ui/CategoryPill';
import { GlowCard } from '../../../components/ui/GlowCard';
import { Star, ShieldCheck } from 'lucide-react';

interface Testimonial {
  quote: string;
  name: string;
  role: string;
  company: string;
  rating: number;
  highlight: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote: "The zero-tolerance mathematical invariant engine is what won us over. It catches discrepancies that escaped two layers of human review.",
    name: "Elena Rostova",
    role: "VP of Global Financial Operations",
    company: "Apex Global Logistics",
    rating: 5,
    highlight: "Zero Invariant Errors"
  },
  {
    quote: "Being able to click on any field and see the bounding box directly on the source PDF gives our audit committee 100% confidence.",
    name: "Marcus Vance",
    role: "Chief Accounting Officer",
    company: "Stratos Manufacturing Group",
    rating: 5,
    highlight: "Spatial Auditability"
  },
  {
    quote: "We consolidated 14 international legal entities into LedgerOne. Segregation of duties and multi-tenant RLS are genuinely enterprise-grade.",
    name: "Dr. Sarah Lin",
    role: "Director of Corporate Treasury",
    company: "OmniTech Ventures",
    rating: 5,
    highlight: "Multi-Tenant Isolation"
  },
  {
    quote: "Our month-end AP close dropped from 9 days down to 6 hours. The 3-way matching engine automatically reconciled 88% of our recurring invoices.",
    name: "Thomas Becker",
    role: "Head of Financial Systems",
    company: "Kruger Industrial",
    rating: 5,
    highlight: "88% STP Rate"
  },
  {
    quote: "The on-premise GPU option was the deciding factor. Zero confidential pricing data leaves our air-gapped infrastructure.",
    name: "Priya Nair",
    role: "Chief Information Security Officer",
    company: "Nova Defense Systems",
    rating: 5,
    highlight: "Air-Gapped Compliance"
  },
  {
    quote: "The AI assistant doesn't invent answers. If a document doesn't explicitly state a payment clause, it tells you directly and highlights the gap.",
    name: "Julian Thorne",
    role: "Senior Partner, Financial Advisory",
    company: "Thorne & Prescott LLP",
    rating: 5,
    highlight: "Verifiable AI Grounding"
  }
];

export const TestimonialSection: React.FC = () => {
  return (
    <section id="testimonials" className="relative py-28 px-4 sm:px-6 lg:px-8 border-t border-white/[0.05] overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 right-10 w-96 h-96 bg-ops-cyan/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-20">
          <SectionBadge number="07" total="11" label="TESTIMONIALS" className="mb-4" />
          <CategoryPill label="CLIENTS FEEDBACKS" className="mb-4" />
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white mb-6">
            Trusted by Teams Who Value <span className="text-ops-gradient">Clarity & Control</span>
          </h2>
          <p className="text-white/60 text-base sm:text-lg leading-relaxed">
            See how enterprise leaders in finance, accounting, and supply chain achieve touchless reconciliation with LedgerOne.
          </p>
        </div>

        {/* 6 Testimonial Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {TESTIMONIALS.map((item, idx) => (
            <GlowCard key={idx} className="p-8 flex flex-col justify-between group">
              <div>
                {/* Rating & Highlight */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-1 text-ops-yellow">
                    {Array.from({ length: item.rating }).map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-current" />
                    ))}
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.08] text-ops-cyan">
                    {item.highlight}
                  </span>
                </div>

                <p className="text-sm sm:text-base text-white/80 leading-relaxed mb-6 font-sans">
                  "{item.quote}"
                </p>
              </div>

              {/* Author footer */}
              <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">{item.name}</div>
                  <div className="text-xs text-white/50">{item.role}</div>
                  <div className="text-[11px] font-mono text-ops-blue">{item.company}</div>
                </div>
                <ShieldCheck className="w-4 h-4 text-ops-cyan/50" />
              </div>
            </GlowCard>
          ))}
        </div>
      </div>
    </section>
  );
};
