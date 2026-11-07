"use client";

import React, { useState } from "react";
import {
  Send,
  Bot,
  User,
  Sparkles,
  AlertCircle,
  RotateCcw,
  Download,
  Check,
  X,
} from "lucide-react";
import { CitationCard, Citation } from "./CitationCard";
import { CitationDetailModal } from "./CitationDetailModal";
import { api, MOCK_ASSISTANT_SESSION } from "@/lib/api-client";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  citations?: Citation[];
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>(
    MOCK_ASSISTANT_SESSION.messages as Message[]
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3000);
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const prompt = input.trim();
    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: prompt,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await api.assistant.ask(prompt);
      const assistantMsg: Message = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: res.answer,
        created_at: new Date().toISOString(),
        citations: res.citations,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: Message = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: `Error querying document intelligence index: ${err?.message || "Service unavailable"}.`,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestion = (prompt: string) => {
    setInput(prompt);
  };

  const handleClearThread = () => {
    setMessages([
      {
        id: "msg-welcome",
        role: "assistant",
        content:
          "Thread reset. I am your Evidence-Grounded Document Copilot. Ask any question regarding ingested invoices, POs, or contract invariants.",
        created_at: new Date().toISOString(),
      },
    ]);
    showToast("Conversation thread reset.");
  };

  const handleExportTranscript = () => {
    const transcript = messages
      .map((m) => {
        let text = `[${m.role.toUpperCase()}] (${m.created_at})\n${m.content}\n`;
        if (m.citations && m.citations.length > 0) {
          text += `CITATIONS:\n` + m.citations.map((c) => `- ${c.citation_id}: ${c.document_name} (Page ${c.page_number}) -> "${c.quote}"`).join("\n") + "\n";
        }
        return text;
      })
      .join("\n--------------------\n\n");

    const blob = new Blob([transcript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `LedgerOne-Assistant-Thread-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Exported verified conversation transcript.");
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] bg-surface-card border border-hairline rounded-xl shadow-subtle-card overflow-hidden relative">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="absolute top-12 right-4 z-40 flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-elevated border border-brand/30 shadow-xl text-xs text-ink-primary animate-in fade-in slide-in-from-top-1 duration-150">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="ml-1 text-ink-muted">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Top Action Bar */}
      <div className="px-4 py-2 border-b border-hairline bg-surface-subtle flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 font-mono text-[11px] text-ink-muted">
          <Sparkles className="w-3.5 h-3.5 text-brand-light" />
          <span>Active Context: 248 Indexed Documents</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportTranscript}
            className="px-2.5 py-1 rounded bg-surface-card hover:bg-surface-hover text-ink-secondary hover:text-ink-primary border border-hairline text-xs font-medium transition flex items-center gap-1.5"
            title="Export Thread with Citations"
          >
            <Download className="w-3 h-3 text-brand-light" />
            <span>Export Thread</span>
          </button>

          <button
            onClick={handleClearThread}
            className="px-2.5 py-1 rounded bg-surface-card hover:bg-surface-hover text-ink-secondary hover:text-rose-400 border border-hairline text-xs font-medium transition flex items-center gap-1.5"
            title="Reset conversation"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex items-start gap-3 text-xs ${
              m.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {m.role === "assistant" && (
              <div className="w-8 h-8 rounded-lg bg-brand/10 border border-brand/20 text-brand-light flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-2xl rounded-xl p-3.5 space-y-2.5 ${
                m.role === "user"
                  ? "bg-brand text-white ml-12"
                  : "bg-surface-subtle border border-hairline text-ink-primary mr-12"
              }`}
            >
              <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p>

              {/* Citations Grid */}
              {m.citations && m.citations.length > 0 && (
                <div className="pt-2 border-t border-hairline space-y-2">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-ink-muted font-semibold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-brand-light" />
                    <span>Verifiable Spatial Citations ({m.citations.length})</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {m.citations.map((c) => (
                      <CitationCard
                        key={c.citation_id}
                        citation={c}
                        onClickCitation={(cit) => setActiveCitation(cit)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {m.role === "user" && (
              <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-hairline text-ink-secondary flex items-center justify-center shrink-0">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            <div className="w-6 h-6 rounded-md bg-brand/10 flex items-center justify-center text-brand-light">
              <Bot className="w-3.5 h-3.5 animate-pulse" />
            </div>
            <span>Evaluating document chunks with pgvector cosine similarity...</span>
          </div>
        )}
      </div>

      {/* Suggested Inquiries */}
      <div className="p-2 border-t border-hairline bg-surface-subtle flex items-center gap-2 overflow-x-auto scrollbar-none">
        <span className="text-[10px] font-semibold text-ink-muted uppercase shrink-0 pl-2">
          Suggestions:
        </span>
        <button
          onClick={() =>
            handleSuggestion(
              "Check for unit price inflation between PO-2026-4412 and INV-2026-9041."
            )
          }
          className="px-2.5 py-1 rounded-full bg-surface-card border border-hairline text-[11px] text-ink-secondary hover:text-ink-primary hover:border-brand/40 whitespace-nowrap transition"
        >
          Audit Price Inflation (MATCH-002)
        </button>
        <button
          onClick={() =>
            handleSuggestion(
              "Was the full quantity of SAN Storage Nodes physically received on GRN-2026-1109?"
            )
          }
          className="px-2.5 py-1 rounded-full bg-surface-card border border-hairline text-[11px] text-ink-secondary hover:text-ink-primary hover:border-brand/40 whitespace-nowrap transition"
        >
          Verify Goods Receipt (MATCH-001)
        </button>
      </div>

      {/* Input Box */}
      <div className="p-3 border-t border-hairline bg-surface-card flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder="Ask a question grounded strictly in workspace documents..."
          className="flex-1 px-3.5 py-2.5 rounded-lg bg-surface-subtle border border-hairline text-xs text-ink-primary placeholder-ink-muted focus:border-brand-light focus:outline-none"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="px-4 py-2.5 rounded-lg bg-brand hover:bg-brand-light disabled:bg-surface-elevated disabled:text-ink-disabled text-white text-xs font-semibold shadow-hairline-glow transition flex items-center gap-1.5"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Send</span>
        </button>
      </div>

      {/* Citation Spatial Inspection Modal */}
      {activeCitation && (
        <CitationDetailModal
          citation={activeCitation}
          onClose={() => setActiveCitation(null)}
        />
      )}
    </div>
  );
}
