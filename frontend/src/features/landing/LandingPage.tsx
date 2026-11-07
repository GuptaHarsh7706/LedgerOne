import React from 'react';
import { FloatingNavbar } from '../../components/layout/FloatingNavbar';
import { MegaFooter } from '../../components/layout/MegaFooter';
import { HeroSection } from './sections/HeroSection';
import { WhoWeAreSection } from './sections/WhoWeAreSection';
import { WhyOpsayraSection } from './sections/WhyOpsayraSection';
import { HowItWorksSection } from './sections/HowItWorksSection';
import { ProcessSection } from './sections/ProcessSection';
import { CaseStudySection } from './sections/CaseStudySection';
import { TestimonialSection } from './sections/TestimonialSection';
import { PricingSection } from './sections/PricingSection';
import { FAQSection } from './sections/FAQSection';
import { InsightsSection } from './sections/InsightsSection';
import { CTASection } from './sections/CTASection';

export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0B0C15] text-white selection:bg-ops-cyan selection:text-black overflow-x-hidden font-sans">
      {/* Top Ambient Light Flare */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[450px] bg-gradient-to-b from-ops-blue/15 via-ops-cyan/5 to-transparent blur-[140px] pointer-events-none" />

      {/* Floating Pill Navigation */}
      <FloatingNavbar />

      {/* Main Sections 01 through 11 */}
      <main className="relative z-10">
        <HeroSection />
        <WhoWeAreSection />
        <WhyOpsayraSection />
        <HowItWorksSection />
        <ProcessSection />
        <CaseStudySection />
        <TestimonialSection />
        <PricingSection />
        <FAQSection />
        <InsightsSection />
        <CTASection />
      </main>

      {/* Mega Footer matching Opsyra */}
      <MegaFooter />
    </div>
  );
};
