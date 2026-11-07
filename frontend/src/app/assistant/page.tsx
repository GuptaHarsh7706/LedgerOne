"use client";

import React from "react";
import { ChatInterface } from "@/components/assistant/ChatInterface";
import { PromptDefenseBanner } from "@/components/assistant/PromptDefenseBanner";
import { Bot, Sparkles, Database } from "lucide-react";

export function AssistantPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-hairline">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand to-brand-light flex items-center justify-center text-white shadow-hairline-glow">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-ink-primary">
                Evidence-Grounded AI Assistant
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-brand/10 text-brand-light border border-brand/20">
                Hybrid RRF Search
              </span>
            </div>
            <p className="text-xs text-ink-muted">
              Multimodal document intelligence with verified 1:1 spatial citations
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-ink-muted font-mono bg-surface-card px-3 py-1.5 rounded-lg border border-hairline">
          <Database className="w-3.5 h-3.5 text-emerald-400" />
          <span>pgvector HNSW + tsvector GIN</span>
        </div>
      </div>

      {/* Safety & Prompt Injection Guardrail Banner */}
      <PromptDefenseBanner />

      {/* Interactive Chat Copilot Interface */}
      <ChatInterface />
    </div>
  );
}

export default AssistantPage;
