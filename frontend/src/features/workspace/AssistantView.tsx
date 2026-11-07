import React, { useState } from 'react';
import { api } from '../../services/api';
import { GlowCard } from '../../components/ui/GlowCard';
import { Button } from '../../components/ui/Button';
import { 
  Bot, 
  Send, 
  Cpu, 
  Sparkles, 
  FileText, 
  CheckCircle2, 
  ArrowRight,
  Database,
  ExternalLink
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  citations?: {
    docId: string;
    docNumber: string;
    page: number;
    bbox: number[];
  }[];
  timestamp: string;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-1',
    sender: 'assistant',
    text: 'Hello. I am the LedgerOne Local Copilot, powered by local RTX 3050 CUDA acceleration. All queries are grounded in your repository documents with exact spatial bounding-box citations. How can I assist with your financial operations?',
    timestamp: 'Just now'
  }
];

export const AssistantView: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText || input;
    if (!textToSend.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const resp = await api.askAssistant(textToSend);
      const assistantMsg: ChatMessage = {
        id: `asst-${Date.now()}`,
        sender: 'assistant',
        text: resp.answer,
        citations: resp.citations,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.error('Assistant query failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono text-ops-cyan">[ 05 / 07 ]</span>
            <span className="text-xs font-mono text-white/40">• LOCAL INTELLIGENCE COPILOT</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Spatial-Grounded Financial AI Assistant
          </h1>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#141524] border border-white/[0.08] text-xs font-mono text-white/70">
          <Cpu className="w-3.5 h-3.5 text-ops-cyan" />
          <span>CUDA 12.4 • HNSW INDEX VRAM: 4.8 GB</span>
        </div>
      </div>

      {/* Suggested Quick Queries */}
      <div className="flex flex-wrap gap-2">
        {[
          "What is the total spend with Global Logistics Corp?",
          "Are there any invoices with tax rate violations?",
          "Show unreconciled purchase orders above $10,000",
          "Explain the discrepancy in invoice INV-2024-8841"
        ].map((q, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(q)}
            className="px-3.5 py-1.5 rounded-full bg-[#121320] border border-white/[0.08] hover:border-ops-cyan/40 hover:text-white text-xs font-mono text-white/60 transition-all text-left"
          >
            "{q}"
          </button>
        ))}
      </div>

      {/* Chat Messages Surface */}
      <GlowCard className="p-6 h-[520px] flex flex-col justify-between">
        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'assistant' && (
                <div className="w-8 h-8 rounded-lg bg-ops-blue/20 border border-ops-blue/40 flex items-center justify-center text-ops-cyan shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div className={`max-w-xl rounded-2xl p-4 text-xs sm:text-sm font-sans leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-ops-blue text-white ml-12 rounded-tr-sm'
                  : 'bg-[#131422] border border-white/[0.08] text-white/90 rounded-tl-sm'
              }`}>
                <p className="whitespace-pre-wrap">{msg.text}</p>

                {/* Spatial Citations */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-white/[0.08] space-y-1.5 font-mono text-xs">
                    <div className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-ops-cyan" />
                      VERIFIED SPATIAL GROUNDING CITATIONS:
                    </div>
                    {msg.citations.map((cite, cIdx) => (
                      <div
                        key={cIdx}
                        className="p-2 rounded bg-[#0A0B14] border border-white/[0.06] flex items-center justify-between text-white/70 hover:border-ops-cyan/40 cursor-pointer transition-colors"
                      >
                        <span className="text-ops-cyan">#{cite.docNumber} (Page {cite.page})</span>
                        <span className="text-[10px] text-white/40">
                          bbox: [{cite.bbox.map(n => n.toFixed(2)).join(', ')}]
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className={`text-[10px] font-mono mt-2 text-right ${
                  msg.sender === 'user' ? 'text-white/60' : 'text-white/30'
                }`}>
                  {msg.timestamp}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3.5 items-center text-xs font-mono text-ops-cyan animate-pulse">
              <Bot className="w-4 h-4" />
              <span>Querying local vector store & generating spatial citations...</span>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="pt-4 border-t border-white/[0.08] flex items-center gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask anything about invoices, tax equations, line items, or vendor history..."
            className="flex-1 bg-[#0A0B14] border border-white/[0.1] focus:border-ops-cyan/60 rounded-xl px-4 py-3 text-xs sm:text-sm text-white placeholder-white/30 focus:outline-none transition-colors font-sans"
          />
          <Button
            variant="primary"
            size="md"
            disabled={loading || !input.trim()}
            onClick={() => handleSend()}
            icon={<Send className="w-4 h-4" />}
          >
            Send
          </Button>
        </div>
      </GlowCard>
    </div>
  );
};
