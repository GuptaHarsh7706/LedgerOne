import React from 'react';
import { FloatingNavbar } from '../../components/layout/FloatingNavbar';
import { MegaFooter } from '../../components/layout/MegaFooter';
import { HeroSection } from './sections/HeroSection';
import { SpatialExtractionSection } from './sections/SpatialExtractionSection';
import { InvariantEngineSection } from './sections/InvariantEngineSection';
import { ThreeWayMatchingSection } from './sections/ThreeWayMatchingSection';
import { DualCustodyGovernanceSection } from './sections/DualCustodyGovernanceSection';
import { LocalCopilotSection } from './sections/LocalCopilotSection';
import { EnterpriseIntegrationsSection } from './sections/EnterpriseIntegrationsSection';
import { FAQSection } from './sections/FAQSection';
import { PlatformCTASection } from './sections/PlatformCTASection';

export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0B0C15] text-white selection:bg-ops-cyan selection:text-black overflow-x-hidden font-sans">
      {/* Top Ambient Light Flare */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[450px] bg-gradient-to-b from-ops-blue/15 via-ops-cyan/5 to-transparent blur-[140px] pointer-events-none" />

      {/* Floating Pill Navigation */}
      <FloatingNavbar />

      {/* Main Core Platform Capabilities */}
      <main className="relative z-10">
        <HeroSection />
        <SpatialExtractionSection />
        <InvariantEngineSection />
        <ThreeWayMatchingSection />
        <DualCustodyGovernanceSection />
        <LocalCopilotSection />
        <EnterpriseIntegrationsSection />
        <FAQSection />
        <PlatformCTASection />
      </main>

      {/* Product-Centric Footer */}
      <MegaFooter />
    </div>
  );
};
