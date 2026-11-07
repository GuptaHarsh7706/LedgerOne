import React, { useState } from 'react';
import { SectionBadge } from '../../../components/ui/SectionBadge';
import { CategoryPill } from '../../../components/ui/CategoryPill';
import { GlowCard } from '../../../components/ui/GlowCard';
import { Lock, Unlock, ShieldAlert, CheckCircle2, User, ArrowRight } from 'lucide-react';

interface Actor {
  id: string;
  name: string;
  role: string;
  badge: string;
  isUploader: boolean;
  isCorrector: boolean;
}

const ACTORS: Actor[] = [
  {
    id: 'usr-1',
    name: 'Alice Cooper',
    role: 'DOCUMENT_MANAGER',
    badge: 'Original Uploader',
    isUploader: true,
    isCorrector: false
  },
  {
    id: 'usr-2',
    name: 'Bob Martinez',
    role: 'REVIEWER',
    badge: 'Line-Item Corrector',
    isUploader: false,
    isCorrector: true
  },
  {
    id: 'usr-3',
    name: 'Carol Vance',
    role: 'WORKSPACE_ADMIN',
    badge: 'Independent Controller',
    isUploader: false,
    isCorrector: false
  }
];

export const DualCustodyGovernanceSection: React.FC = () => {
  const [selectedActorId, setSelectedActorId] = useState<string>('usr-1');

  const actor = ACTORS.find(a => a.id === selectedActorId) || ACTORS[0];

  // Evaluate SoD rules
  const rule1Violated = actor.isUploader;
  const rule2Violated = actor.isCorrector;
  const isBlocked = rule1Violated || rule2Violated || actor.role === 'DOCUMENT_MANAGER';

  return (
    <section id="dual-custody" className="relative py-28 px-4 sm:px-6 lg:px-8 border-t border-white/[0.05] overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 right-1/4 w-96 h-96 bg-ops-cyan/5 rounded-full blur-[160px] pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
          <div>
            <SectionBadge number="04" total="05" label="DUAL-CUSTODY AUDIT GATE" className="mb-4" />
            <CategoryPill label="SEGREGATION OF DUTIES" className="mb-4" />
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white max-w-2xl leading-[1.15]">
              Enterprise <span className="text-ops-gradient">Dual-Custody Governance</span>
            </h2>
          </div>
          <p className="text-white/60 text-base sm:text-lg max-w-md font-sans leading-relaxed">
            Financial regulations (SOX & SOC 2) strictly forbid single-party invoice processing. LedgerOne enforces cryptographic Segregation of Duties: the user who uploads or edits a document cannot approve its payment.
          </p>
        </div>

        {/* Dual-Custody Interactive Simulator */}
        <GlowCard className="p-8 sm:p-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-8 border-b border-white/[0.08] gap-4">
            <div>
              <div className="text-xs font-mono text-ops-cyan uppercase tracking-wider mb-1">
                INTERACTIVE SOD POLICY EVALUATOR
              </div>
              <h3 className="text-xl font-bold text-white">
                Simulate Sign-Off with Different Identities
              </h3>
            </div>

            {/* Actor Switcher */}
            <div className="flex items-center gap-2 bg-[#141524] p-1 rounded-xl border border-white/[0.06] text-xs font-mono">
              {ACTORS.map((act) => (
                <button
                  key={act.id}
                  onClick={() => setSelectedActorId(act.id)}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    selectedActorId === act.id
                      ? 'bg-white text-black font-semibold shadow-sm'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {act.name.split(' ')[0]} ({act.badge})
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left: Active Identity Card */}
            <div className="lg:col-span-6 space-y-4 font-mono text-xs">
              <div className="p-6 rounded-xl bg-[#090A12] border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-ops-blue/20 border border-ops-blue/40 flex items-center justify-center text-ops-cyan font-bold">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm">{actor.name}</div>
                      <div className="text-[10px] text-white/50">{actor.role}</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded bg-white/[0.05] border border-white/10 text-white/70">
                    {actor.badge}
                  </span>
                </div>

                <div className="pt-3 border-t border-white/[0.06] space-y-2 text-white/70">
                  <div className="flex justify-between">
                    <span>Uploaded this document?</span>
                    <span className={actor.isUploader ? 'text-amber-400 font-bold' : 'text-emerald-400'}>
                      {actor.isUploader ? 'YES (Barred by AUTH_SOD_001)' : 'NO'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Corrected line items?</span>
                    <span className={actor.isCorrector ? 'text-amber-400 font-bold' : 'text-emerald-400'}>
                      {actor.isCorrector ? 'YES (Barred by AUTH_SOD_002)' : 'NO'}
                    </span>
                  </div>
                </div>
              </div>

              {/* SoD Rule Checklist */}
              <div className="space-y-2">
                <div className={`p-3 rounded-lg border text-[11px] flex items-center justify-between ${
                  rule1Violated ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300'
                }`}>
                  <span>AUTH_SOD_001: Original Uploader Barred from Approval</span>
                  <span>{rule1Violated ? 'TRIGGERED (FAIL)' : 'PASSED'}</span>
                </div>
                <div className={`p-3 rounded-lg border text-[11px] flex items-center justify-between ${
                  rule2Violated ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300'
                }`}>
                  <span>AUTH_SOD_002: Line Corrector Barred from Release</span>
                  <span>{rule2Violated ? 'TRIGGERED (FAIL)' : 'PASSED'}</span>
                </div>
              </div>
            </div>

            {/* Right: Simulated Release Gate */}
            <div className="lg:col-span-6 p-6 rounded-xl bg-[#090A12] border border-white/[0.08] text-center space-y-6">
              <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center transition-all duration-300"
                style={{
                  backgroundColor: isBlocked ? 'rgba(245, 158, 11, 0.1)' : 'rgba(0, 255, 204, 0.1)',
                  borderColor: isBlocked ? 'rgba(245, 158, 11, 0.3)' : 'rgba(0, 255, 204, 0.3)',
                  borderWidth: '1px'
                }}
              >
                {isBlocked ? (
                  <Lock className="w-8 h-8 text-amber-400" />
                ) : (
                  <Unlock className="w-8 h-8 text-ops-cyan" />
                )}
              </div>

              <div>
                <h4 className="text-lg font-bold text-white mb-2">
                  {isBlocked ? 'Release Gate Blocked (SoD Violation)' : 'Dual-Custody Gate Unlocked'}
                </h4>
                <p className="text-xs text-white/60 font-sans max-w-sm mx-auto leading-relaxed">
                  {isBlocked
                    ? `${actor.name} cannot authorize invoice settlement because Segregation of Duties policy requires an independent second party to verify.`
                    : `${actor.name} is an independent workspace controller with zero conflict of interest. Authorization will generate cryptographic audit receipt.`}
                </p>
              </div>

              <button
                disabled={isBlocked}
                className={`w-full py-3 rounded-xl font-mono text-xs font-semibold uppercase tracking-wider transition-all border ${
                  isBlocked
                    ? 'bg-white/[0.02] border-white/10 text-white/30 cursor-not-allowed'
                    : 'bg-ops-cyan text-black border-ops-cyan shadow-[0_0_20px_rgba(0,255,204,0.3)] hover:brightness-110'
                }`}
              >
                {isBlocked ? 'Approval Authorization Blocked' : 'Sign & Post General Ledger Journal'}
              </button>
            </div>
          </div>
        </GlowCard>
      </div>
    </section>
  );
};
