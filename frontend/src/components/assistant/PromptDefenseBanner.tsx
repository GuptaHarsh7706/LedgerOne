"use client";

import React from "react";
import { ShieldCheck, Lock, Sparkles } from "lucide-react";

export function PromptDefenseBanner() {
  return (
    <div className="p-3 rounded-lg bg-surface-card border border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink-primary">
              Strict Evidence-Grounding Active
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Zero-Hallucination
            </span>
          </div>
          <p className="text-[11px] text-ink-muted">
            The assistant answers exclusively from indexed document chunks with mandatory spatial citations.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[10px] font-mono text-ink-secondary self-start sm:self-auto">
        <span className="flex items-center gap-1 px-2 py-1 rounded bg-surface-subtle border border-hairline">
          <Lock className="w-3 h-3 text-brand-light" />
          <span>Prompt Injection Immune</span>
        </span>
      </div>
    </div>
  );
}
