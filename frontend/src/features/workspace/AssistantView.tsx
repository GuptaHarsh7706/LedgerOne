import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, SEED_STUDIO_DOCUMENTS } from '../../services/api';
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
  RotateCcw, 
  ExternalLink,
  MessageSquare,
  Plus,
  HelpCircle,
  Database
} from 'lucide-react';

interface Citation {
  docId: string;
  docNumber: string;
  page: number;
  bbox: number[];
  excerpt?: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
  timestamp: string;
  followUps?: string[];
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-welcome',
    sender: 'assistant',
    text: `Hello! I am the **LedgerOne Local Financial Copilot**, powered by on-premise RTX 3050 CUDA 12.4 acceleration and pgvector HNSW indexing.

I can dynamically inspect documents, audit arithmetic equations, cross-reference 3-way matching records, and explain Segregation of Duties (SoD) policies.

How can I assist your financial operations today?`,
    timestamp: 'Just now',
    followUps: [
      "What is the total spend across all vendors?",
      "Why is invoice INV-2024-9022 quarantined?",
      "Show 3-way matching status for Purchase Orders",
      "What documents are currently in the repository?"
    ]
  }
];

export const AssistantView: React.FC = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedDocContext, setSelectedDocContext] = useState<string>('ALL');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

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
      // Append context if document filter is selected
      const contextualQuery = selectedDocContext === 'ALL'
        ? textToSend
        : `[Context: Document ${selectedDocContext}] ${textToSend}`;

      const resp = await api.askAssistant(contextualQuery);

      // Determine smart follow-ups based on the user's topic
      const followUps: string[] = [];
      const lower = textToSend.toLowerCase();
      if (lower.includes('9022') || lower.includes('vortex') || lower.includes('tax')) {
        followUps.push("Who can approve an override for INV-9022?");
        followUps.push("What is the jurisdictional tax rate standard?");
      } else if (lower.includes('8841') || lower.includes('global logistics') || lower.includes('shipping')) {
        followUps.push("Open INV-2024-8841 in Document Studio");
        followUps.push("Show Purchase Order PO-2024-0019 parity");
      } else if (lower.includes('spend') || lower.includes('analytics') || lower.includes('total')) {
        followUps.push("Which supplier has the highest exposure?");
        followUps.push("What is our touchless STP velocity?");
      } else {
        followUps.push("List all repository documents");
        followUps.push("Are there any unfulfilled Purchase Orders?");
      }

      const assistantMsg: ChatMessage = {
        id: `asst-${Date.now()}`,
        sender: 'assistant',
        text: resp.answer,
        citations: resp.citations,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        followUps
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.error('Assistant query failed:', err);
      const errorMsg: ChatMessage = {
        id: `asst-err-${Date.now()}`,
        sender: 'assistant',
        text: 'An error occurred during local vector retrieval. Please verify your query syntax.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleResetChat = () => {
    setMessages(INITIAL_MESSAGES);
  };

  // Helper to render markdown-like text with paragraphs, bolding, and lists
  const renderFormattedText = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, idx) => {
      // Heading 3
      if (line.startsWith('### ')) {
        return <h3 key={idx} className="text-base font-bold text-ops-cyan mt-2 mb-1">{line.replace('### ', '')}</h3>;
      }
      // Bullet items
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return (
          <div key={idx} className="flex items-start gap-2 ml-2 my-1">
            <span className="w-1.5 h-1.5 rounded-full bg-ops-cyan mt-1.5 shrink-0" />
            <span dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(line.slice(2)) }} />
          </div>
        );
      }
      // Numbered lists
      if (/^\d+\.\s/.test(line)) {
        return (
          <div key={idx} className="flex items-start gap-2 ml-2 my-1 font-mono text-xs">
            <span className="text-ops-cyan font-bold">{line.match(/^\d+\./)?.[0]}</span>
            <span dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(line.replace(/^\d+\.\s/, '')) }} />
          </div>
        );
      }
      if (line.trim() === '') {
        return <div key={idx} className="h-2" />;
      }
      return (
        <p key={idx} className="my-1" dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(line) }} />
      );
    });
  };

  const formatInlineMarkdown = (str: string) => {
    return str
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="text-white/80">$1</em>')
      .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-black/40 border border-white/10 font-mono text-ops-cyan text-[11px]">$1</code>');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono text-ops-cyan">[ 05 / 07 ]</span>
            <span className="text-xs font-mono text-white/40">• LOCAL INTELLIGENCE COPILOT</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Financial Intelligence Chatbot
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#141524] border border-white/[0.08] text-xs font-mono text-white/70">
            <Cpu className="w-3.5 h-3.5 text-ops-cyan" />
            <span>RTX 3050 CUDA 12.4 • HNSW PGVECTOR</span>
          </div>

          <button
            onClick={handleResetChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 text-xs font-mono text-white/60 hover:text-white transition-all"
            title="Start New Chat Session"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Session</span>
          </button>
        </div>
      </div>

      {/* Scope Filter Bar */}
      <div className="p-3 rounded-xl bg-[#10111D] border border-white/[0.08] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-2 text-white/50">
          <Database className="w-3.5 h-3.5 text-ops-cyan" />
          <span>SCOPE REPOSITORY CONTEXT:</span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          {['ALL', 'INV-2024-8841', 'INV-2024-9022', 'INV-2024-7719'].map((docNum) => (
            <button
              key={docNum}
              onClick={() => setSelectedDocContext(docNum)}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                selectedDocContext === docNum
                  ? 'bg-ops-cyan text-black font-bold shadow-sm'
                  : 'bg-white/[0.04] text-white/60 hover:text-white'
              }`}
            >
              {docNum === 'ALL' ? 'All Invoices' : `#${docNum}`}
            </button>
          ))}
        </div>
      </div>

      {/* Main Chat Display Window */}
      <GlowCard className="p-6 h-[560px] flex flex-col justify-between bg-[#0C0D18]">
        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-3 select-text">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'assistant' && (
                <div className="w-8 h-8 rounded-lg bg-ops-blue/20 border border-ops-blue/40 flex items-center justify-center text-ops-cyan shrink-0 mt-0.5 shadow-[0_0_15px_rgba(0,255,204,0.15)]">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div className={`max-w-2xl rounded-2xl p-4 text-xs sm:text-sm font-sans leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-ops-blue text-white ml-12 rounded-tr-sm shadow-md'
                  : 'bg-[#141525] border border-white/[0.08] text-white/90 rounded-tl-sm'
              }`}>
                {/* Formatted Message Body */}
                <div className="space-y-1">
                  {renderFormattedText(msg.text)}
                </div>

                {/* Spatial Citations Cards */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-white/[0.08] space-y-2 font-mono text-xs">
                    <div className="text-[10px] text-white/40 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-ops-cyan" />
                      VERIFIED SPATIAL GROUNDING RECEIPT:
                    </div>
                    {msg.citations.map((cite, cIdx) => (
                      <div
                        key={cIdx}
                        onClick={() => navigate(`/workspace/documents/doc-001`)}
                        className="p-3 rounded-lg bg-[#0A0B14] border border-white/[0.08] hover:border-ops-cyan/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-white/80 cursor-pointer transition-all group"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-ops-cyan group-hover:scale-110 transition-transform" />
                          <span className="text-white font-semibold group-hover:text-ops-cyan transition-colors">
                            #{cite.docNumber} (Page {cite.page})
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-white/40">
                            bbox: [{cite.bbox.map(n => n.toFixed(2)).join(', ')}]
                          </span>
                          <span className="text-ops-cyan text-[10px] flex items-center gap-1">
                            Inspect <ExternalLink className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Follow-Up Suggestion Chips */}
                {msg.followUps && msg.followUps.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-white/[0.06] flex flex-wrap gap-2">
                    {msg.followUps.map((chip, chipIdx) => (
                      <button
                        key={chipIdx}
                        onClick={() => handleSend(chip)}
                        className="text-[11px] font-mono px-3 py-1 rounded-full bg-white/[0.04] hover:bg-ops-cyan/15 hover:border-ops-cyan/40 border border-white/[0.08] text-white/70 hover:text-white transition-all text-left"
                      >
                        + "{chip}"
                      </button>
                    ))}
                  </div>
                )}

                {/* Timestamp */}
                <div className={`text-[10px] font-mono mt-2 text-right ${
                  msg.sender === 'user' ? 'text-white/60' : 'text-white/30'
                }`}>
                  {msg.timestamp}
                </div>
              </div>
            </div>
          ))}

          {/* Loading Indicator */}
          {loading && (
            <div className="flex gap-3.5 items-center text-xs font-mono text-ops-cyan animate-pulse pl-2">
              <Bot className="w-4 h-4" />
              <span>Analyzing document vector index & verifying arithmetic invariants...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="pt-4 border-t border-white/[0.08] flex items-center gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask anything about invoices, tax equations, line items, 3-way matching, or spend..."
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
