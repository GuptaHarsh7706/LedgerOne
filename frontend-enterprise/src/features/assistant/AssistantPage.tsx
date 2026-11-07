import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Bot,
  Send,
  Sparkles,
  Database,
  Cpu,
  ShieldCheck,
  FileText,
  ExternalLink,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import { Button, Input, Badge, PageTransition } from "../../components/ui";
import { api } from "../../services/api";
import { AssistantCitation, AssistantMessage } from "../../services/types";
import { useActiveRole } from "../../services/permissions";

export const AssistantPage: React.FC = () => {
  const { can, role } = useActiveRole();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: "msg-welcome",
      role: "assistant",
      content:
        "Welcome to the LedgerOne Evidence-Grounded AI Assistant. I operate under strict hybrid RRF retrieval (dense pgvector + lexical tsvector) backed by local RTX 3050 CUDA acceleration. Every statement is verified with 1:1 spatial document bounding-box citations.",
      timestamp: new Date().toLocaleTimeString(),
      grounded: true,
    },
  ]);
  const [inputQuery, setInputQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const initSession = async () => {
      try {
        const session = await api.createAssistantSession("Audit Session");
        setSessionId(session.session_id);
      } catch {
        // Fallback session
        setSessionId("sess-dev-fallback");
      }
    };
    initSession();
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim() || isLoading) return;

    const userText = inputQuery.trim();
    setInputQuery("");

    const userMessage: AssistantMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: userText,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const activeSession = sessionId || "sess-dev-fallback";
      const res = await api.askAssistant(activeSession, userText);

      const botMessage: AssistantMessage = {
        id: `msg-resp-${Date.now()}`,
        role: "assistant",
        content: res.answer,
        citations: res.citations,
        grounded: res.grounded,
        timestamp: new Date().toLocaleTimeString(),
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (err: any) {
      const errorMessage: AssistantMessage = {
        id: `msg-err-${Date.now()}`,
        role: "assistant",
        content: `Error dispatching retrieval: ${err.message || "Failed to query vector store"}`,
        timestamp: new Date().toLocaleTimeString(),
        grounded: false,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PageTransition className="p-6 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-hairline">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center text-white shadow-hairline-glow">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-ink-primary">
                Evidence-Grounded AI Assistant
              </h1>
              <Badge variant="brand" size="sm">
                Hybrid RRF Search
              </Badge>
            </div>
            <p className="text-xs text-ink-muted">
              Multimodal document intelligence with verified 1:1 spatial citations
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-ink-muted font-mono bg-surface-primary px-3 py-1.5 rounded-lg border border-hairline">
          <Database className="w-3.5 h-3.5 text-emerald-400" />
          <span>pgvector HNSW + tsvector GIN</span>
        </div>
      </div>

      {/* Safety & Prompt Injection Guardrail Banner */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-surface-primary border border-hairline text-xs">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-ink-primary">
            Security Guardrails Active
          </span>
          <span className="text-ink-muted text-[11px]">
            Zero-shot prompt injection interception & delimiter sandboxing enforced
          </span>
        </div>
        <Badge variant="verified" size="sm" dot>
          PROTECTED
        </Badge>
      </div>

      {/* Interactive Chat Conversation History */}
      <div className="h-[480px] rounded-2xl bg-surface-primary border border-hairline p-4 overflow-y-auto space-y-4 shadow-subtle-card">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? "items-end" : "items-start"} space-y-1.5`}
            >
              <div className="flex items-center gap-2 text-[10px] font-mono text-ink-muted px-1">
                <span>{isUser ? "You (Auditor)" : "LedgerOne Assistant"}</span>
                <span>•</span>
                <span>{msg.timestamp}</span>
              </div>

              <div
                className={`max-w-[85%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                  isUser
                    ? "bg-brand text-white rounded-br-none shadow-hairline-glow"
                    : "bg-surface-elevated text-ink-primary border border-hairline rounded-bl-none shadow-subtle-card"
                }`}
              >
                <p>{msg.content}</p>

                {/* Spatial Evidence Citations */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-hairline space-y-1.5">
                    <div className="text-[10px] font-mono uppercase text-ink-muted font-semibold flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-brand-light" />
                      <span>Verified Document Evidence Citations ({msg.citations.length})</span>
                    </div>

                    <div className="grid grid-cols-1 gap-1.5">
                      {msg.citations.map((cite) => (
                        <Link
                          key={cite.id}
                          to={`/documents/${cite.document_id}/review`}
                          className="flex items-center justify-between p-2 rounded-lg bg-surface-subtle hover:bg-surface-hover/80 border border-hairline transition-colors group"
                        >
                          <div className="flex items-center gap-2 text-[11px] font-mono text-brand-light group-hover:underline">
                            <FileText className="w-3 h-3 shrink-0" />
                            <span>
                              [{cite.id}] {cite.filename} — Page {cite.page_number}
                            </span>
                          </div>
                          <ExternalLink className="w-3 h-3 text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-ink-muted font-mono p-2">
            <Sparkles className="w-4 h-4 text-brand-light animate-spin" />
            <span>Executing HNSW Vector Retrieval & Forensic Synthesis on CUDA...</span>
          </div>
        )}
      </div>

      {/* Query Dispatch Input Form or RBAC Restricted State */}
      {can("assistant.use") ? (
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <Input
            placeholder="Ask document questions (e.g., 'What is the invoiced unit price for SAN nodes vs PO commitment?')..."
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={!inputQuery.trim() || isLoading}
            isLoading={isLoading}
            icon={<Send className="w-3.5 h-3.5" />}
          >
            Query Assistant
          </Button>
        </form>
      ) : (
        <div className="p-3 rounded-xl border border-hairline bg-surface-subtle flex items-center justify-between text-xs text-ink-muted">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span>AI Interaction Restricted: Role '{role}' possesses read-only document browsing privileges.</span>
          </div>
          <Badge variant="neutral" size="sm">RBAC Gated</Badge>
        </div>
      )}
    </PageTransition>
  );
};
