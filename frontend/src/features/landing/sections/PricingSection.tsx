import React, { useState } from 'react';
import { SectionBadge } from '../../../components/ui/SectionBadge';
import { CategoryPill } from '../../../components/ui/CategoryPill';
import { GlowCard } from '../../../components/ui/GlowCard';
import { Button } from '../../../components/ui/Button';
import { Check, Sparkles, Zap, Shield, ArrowRight } from 'lucide-react';

interface PricingPlan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  popular?: boolean;
  features: string[];
  cta: string;
}

const PLANS: PricingPlan[] = [
  {
    id: 'starter',
    name: 'Starter Operations',
    description: 'Designed for high-growth finance teams transitioning from manual data entry.',
    monthlyPrice: 49,
    yearlyPrice: 39,
    popular: false,
    features: [
      'Up to 2,500 documents / month',
      '3 team seats with role isolation',
      'Standard arithmetic invariant engine',
      'Spatial bounding box citation viewer',
      'Direct S3 & SFTP hot-folder ingestion',
      'Email & Slack notifications'
    ],
    cta: 'Start Free Trial'
  },
  {
    id: 'pro',
    name: 'Pro Systems',
    description: 'The standard for autonomous enterprise accounts payable and multi-entity workflows.',
    monthlyPrice: 129,
    yearlyPrice: 99,
    popular: true,
    features: [
      'Up to 25,000 documents / month',
      '15 team seats + dual-custody SoD gates',
      'Three-Way PO ↔ GRN ↔ Invoice matching',
      'Local RTX 3050 GPU accelerated copilot',
      'Automated discrepancy triage queues',
      'Bidirectional SAP & NetSuite webhooks',
      '24/7 dedicated engineering SLA'
    ],
    cta: 'Deploy Pro Operations'
  },
  {
    id: 'enterprise',
    name: 'Enterprise Core',
    description: 'For global corporate enterprises requiring on-premise air-gapped guarantees.',
    monthlyPrice: 499,
    yearlyPrice: 399,
    popular: false,
    features: [
      'Unlimited documents & infinite volume',
      'Unlimited seats across 7 RBAC tiers',
      'Air-gapped on-premise deployment mode',
      'Custom fine-tuned invariant equations',
      'Direct ERP general ledger writeback',
      'Dedicated enterprise solutions architect',
      '99.99% guaranteed uptime SLA'
    ],
    cta: 'Contact Architecture Team'
  }
];

export const PricingSection: React.FC = () => {
  const [isYearly, setIsYearly] = useState<boolean>(true);

  return (
    <section id="pricing" className="relative py-28 px-4 sm:px-6 lg:px-8 border-t border-white/[0.05] overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-ops-blue/5 rounded-full blur-[180px] pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <SectionBadge number="08" total="11" label="PRICING PLANS" className="mb-4" />
          <CategoryPill label="AUTOMATION PLANS" className="mb-4" />
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white mb-6">
            Flexible Automation Plans for <span className="text-ops-gradient">Modern Teams</span>
          </h2>
          <p className="text-white/60 text-base sm:text-lg leading-relaxed mb-8">
            Transparent, deterministic pricing. No hidden fees or unexpected consumption surcharges.
          </p>

          {/* Billing Switch */}
          <div className="inline-flex items-center p-1.5 rounded-full bg-[#181924] border border-white/[0.08]">
            <button
              onClick={() => setIsYearly(false)}
              className={`px-5 py-2 rounded-full text-xs font-mono transition-all ${
                !isYearly ? 'bg-white text-black font-semibold shadow-md' : 'text-white/60 hover:text-white'
              }`}
            >
              MONTHLY BILLING
            </button>
            <button
              onClick={() => setIsYearly(true)}
              className={`px-5 py-2 rounded-full text-xs font-mono transition-all flex items-center gap-2 ${
                isYearly ? 'bg-white text-black font-semibold shadow-md' : 'text-white/60 hover:text-white'
              }`}
            >
              <span>ANNUAL BILLING</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-ops-cyan text-black font-bold">
                SAVE 20%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          {PLANS.map((plan) => {
            const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice;
            return (
              <GlowCard
                key={plan.id}
                className={`p-8 sm:p-10 flex flex-col justify-between relative ${
                  plan.popular
                    ? 'border-ops-cyan/40 bg-[#161726] shadow-[0_0_40px_rgba(0,255,204,0.1)]'
                    : 'border-white/[0.08]'
                }`}
                glowColor={plan.popular ? 'rgba(0, 255, 204, 0.25)' : undefined}
              >
                {/* Popular Pill */}
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-ops-cyan text-black font-mono text-[10px] font-bold tracking-widest uppercase flex items-center gap-1.5 shadow-lg">
                    <Sparkles className="w-3 h-3" />
                    RECOMMENDED CHOICE
                  </div>
                )}

                <div>
                  <div className="text-xs font-mono text-white/40 tracking-wider mb-2">
                    [ PLAN_{plan.id.toUpperCase()} ]
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                  <p className="text-xs text-white/50 leading-relaxed mb-6">
                    {plan.description}
                  </p>

                  {/* Price */}
                  <div className="flex items-baseline gap-1 mb-8 pb-8 border-b border-white/[0.08]">
                    <span className="text-4xl sm:text-5xl font-bold font-mono text-white">${price}</span>
                    <span className="text-sm font-mono text-white/40">/ month</span>
                  </div>

                  {/* Feature Checklist */}
                  <div className="space-y-3 mb-8">
                    {plan.features.map((feat, fIdx) => (
                      <div key={fIdx} className="flex items-start gap-3">
                        <Check className="w-4 h-4 text-ops-cyan shrink-0 mt-0.5" />
                        <span className="text-xs sm:text-sm text-white/70 font-sans">{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  variant={plan.popular ? 'primary' : 'outline'}
                  fullWidth
                  onClick={() => window.location.href = '/workspace'}
                  className="mt-4"
                >
                  {plan.cta}
                </Button>
              </GlowCard>
            );
          })}
        </div>
      </div>
    </section>
  );
};
