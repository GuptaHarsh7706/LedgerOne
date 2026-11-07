import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
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
  Plus,
  Database,
  Copy,
  Check,
  CornerDownLeft,
  Search,
  SlidersHorizontal,
  ChevronDown,
  User
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

  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedDocContext, setSelectedDocContext] = useState<string>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize and load sessions from PostgreSQL
  useEffect(() => {
    async function initSessions() {
      try {
        const list = await api.listAssistantSessions();
        setSessions(list);
        let targetId: string;
        if (list && list.length > 0) {
          targetId = list[0].id;
        } else {
          const newSession = await api.createAssistantSession('Financial Invariant Session');
          setSessions([newSession]);
          targetId = newSession.id;
        }
        setActiveSessionId(targetId);

        // Load messages from PostgreSQL
        const detail = await api.getSessionDetail(targetId);
        if (detail?.messages && detail.messages.length > 0) {
          const mapped: ChatMessage[] = detail.messages.map((m: any) => ({
            id: m.id,
            sender: m.sender_role === 'USER' ? 'user' : 'assistant',
            text: m.content,
            citations: (m.citations || []).map((c: any) => ({
              docId: c.document_id,
              docNumber: c.document_id,
              page: c.page_number,
              bbox: c.bounding_box ? [c.bounding_box.x0, c.bounding_box.y0, c.bounding_box.x1, c.bounding_box.y1] : [0.12, 0.42, 0.38, 0.46],
              excerpt: c.quote,
            })),
            timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          }));
          setMessages(mapped);
        } else {
          setMessages(INITIAL_MESSAGES);
        }
      } catch (err) {
        console.warn('Failed to load assistant sessions from PostgreSQL:', err);
        setMessages(INITIAL_MESSAGES);
      }
    }
    initSessions();
  }, []);

  const handleSwitchSession = async (sessionId: string) => {
    setActiveSessionId(sessionId);
    try {
      setLoading(true);
      const detail = await api.getSessionDetail(sessionId);
      if (detail?.messages && detail.messages.length > 0) {
        const mapped: ChatMessage[] = detail.messages.map((m: any) => ({
          id: m.id,
          sender: m.sender_role === 'USER' ? 'user' : 'assistant',
          text: m.content,
          citations: (m.citations || []).map((c: any) => ({
            docId: c.document_id,
            docNumber: c.document_id,
            page: c.page_number,
            bbox: c.bounding_box ? [c.bounding_box.x0, c.bounding_box.y0, c.bounding_box.x1, c.bounding_box.y1] : [0.12, 0.42, 0.38, 0.46],
            excerpt: c.quote,
          })),
          timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }));
        setMessages(mapped);
      } else {
        setMessages(INITIAL_MESSAGES);
      }
    } catch (err) {
      console.error('Failed to load session history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewSession = async () => {
    try {
      const title = `Inquiry ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      const newSession = await api.createAssistantSession(title);
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
      setMessages(INITIAL_MESSAGES);
    } catch (err) {
      console.error('Failed to create new session:', err);
    }
  };

  // Smooth auto-scroll restricted to the chat scroll container (does NOT jump page window)
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior
      });
    }
  };

  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages, loading]);

  // Auto-resize textarea like ChatGPT
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText || input;
    if (!textToSend.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setLoading(true);

    try {
      // Append context if document filter is selected
      const contextualQuery = selectedDocContext === 'ALL'
        ? textToSend
        : `[Context: Document ${selectedDocContext}] ${textToSend}`;

      let currentSessionId = activeSessionId;
      if (!currentSessionId) {
        const created = await api.createAssistantSession('Document Intelligence Session');
        setSessions(prev => [created, ...prev]);
        currentSessionId = created.id;
        setActiveSessionId(created.id);
      }

      const resp = await api.askAssistant(currentSessionId, contextualQuery);

      // Determine smart follow-ups based on query content
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

      const rawCitations = resp?.citations || [];
      const citations: Citation[] = rawCitations.map((c: any) => ({
        docId: c.docId || c.document_id || 'doc-001',
        docNumber: c.docNumber || c.document_id || 'Document',
        page: c.page || c.page_number || 1,
        bbox: Array.isArray(c.bbox) ? c.bbox : (c.bounding_box ? [c.bounding_box.x0, c.bounding_box.y0, c.bounding_box.x1, c.bounding_box.y1] : [0.12, 0.42, 0.38, 0.46]),
        excerpt: c.excerpt || c.quote || c.snippet || ''
      }));

      const assistantMsg: ChatMessage = {
        id: `asst-${Date.now()}`,
        sender: 'assistant',
        text: resp?.answer || resp?.content || '',
        citations,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        followUps
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('Assistant query failed:', err);
      const errorMsg: ChatMessage = {
        id: `asst-err-${Date.now()}`,
        sender: 'assistant',
        text: `Error from backend RAG service: ${err?.message || 'Local vector retrieval failed. Please check network/service connectivity.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {
      console.warn('Failed to copy text:', e);
    }
  };

  // Helper to render markdown-like text with paragraphs, bolding, and lists
  const renderFormattedText = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, idx) => {
      // Heading 3
      if (line.startsWith('### ')) {
        return <h3 key={idx} className="text-base font-bold text-ops-cyan mt-3 mb-1.5">{line.replace('### ', '')}</h3>;
      }
      // Bullet items
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return (
          <div key={idx} className="flex items-start gap-2.5 ml-2 my-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-ops-cyan mt-2 shrink-0 shadow-[0_0_8px_rgba(0,255,204,0.6)]" />
            <span className="text-white/90 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(line.slice(2)) }} />
          </div>
        );
      }
      // Numbered lists
      if (/^\d+\.\s/.test(line)) {
        return (
          <div key={idx} className="flex items-start gap-2.5 ml-2 my-1.5 font-sans text-sm">
            <span className="text-ops-cyan font-mono font-bold">{line.match(/^\d+\./)?.[0]}</span>
            <span className="text-white/90 leading-relaxed" dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(line.replace(/^\d+\.\s/, '')) }} />
          </div>
        );
      }
      if (line.trim() === '') {
        return <div key={idx} className="h-2" />;
      }
      return (
        <p key={idx} className="my-1.5 text-white/90 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(line) }} />
      );
    });
  };

  const formatInlineMarkdown = (str: string) => {
    return str
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="text-white/80">$1</em>')
      .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-black/50 border border-white/10 font-mono text-ops-cyan text-xs">$1</code>');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7.5rem)] min-h-[620px] bg-[#0A0B14] rounded-2xl border border-white/[0.08] overflow-hidden shadow-2xl relative">
      {/* ChatGPT-Style Sticky Top Bar */}
      <header className="h-14 px-4 sm:px-6 border-b border-white/[0.08] bg-[#0E101E]/90 backdrop-blur-md flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-ops-blue to-ops-cyan p-[1px] flex items-center justify-center shadow-[0_0_12px_rgba(0,255,204,0.3)]">
            <div className="w-full h-full bg-[#0B0C15] rounded-[7px] flex items-center justify-center">
              <Bot className="w-4 h-4 text-ops-cyan" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-bold text-white tracking-tight">LedgerOne Financial Copilot</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Ready & Online" />
            </div>
            <div className="text-[10px] font-mono text-white/40 hidden sm:block">
              RTX 3050 CUDA 12.4 • HNSW PGVECTOR • SPATIAL CITATIONS
            </div>
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Active Session Selector */}
          {sessions.length > 0 && (
            <div className="flex items-center gap-1.5 bg-[#141524] px-2.5 py-1 rounded-lg border border-white/[0.08] text-xs font-mono">
              <span className="text-white/50 text-[11px] hidden md:inline">Session:</span>
              <select
                value={activeSessionId || ''}
                onChange={(e) => handleSwitchSession(e.target.value)}
                className="bg-transparent text-white text-xs font-mono focus:outline-none cursor-pointer max-w-[160px] truncate"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id} className="bg-[#141524] text-white">
                    {s.title || `Session ${s.id.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* New Chat Button */}
          <button
            onClick={handleCreateNewSession}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-mono text-white/70 hover:text-white transition-all shadow-sm"
            title="Start New Chat Session in PostgreSQL"
          >
            <Plus className="w-3.5 h-3.5 text-ops-cyan" />
            <span className="hidden sm:inline">New Chat</span>
          </button>
        </div>
      </header>

      {/* ChatGPT-Style Chat Message Feed (Dedicated Scroll Container) */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent select-text"
      >
        <div className="max-w-3xl lg:max-w-4xl mx-auto space-y-6">
          {messages.map((msg) => (
            <div key={msg.id} className="space-y-3">
              {msg.sender === 'user' ? (
                /* User Message Bubble - Aligned Right with User Accent */
                <div className="flex justify-end items-start gap-2.5 pl-10">
                  <div className="max-w-2xl rounded-2xl rounded-tr-sm bg-gradient-to-r from-ops-blue to-ops-blue/80 text-white p-4 shadow-lg border border-ops-cyan/20">
                    <p className="text-sm font-sans leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    <div className="text-[10px] font-mono mt-1.5 text-white/60 text-right">
                      {msg.timestamp}
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center shrink-0 text-white/80 mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                </div>
              ) : (
                /* Assistant Message Block - Aligned Left with Bot Identity */
                <div className="flex items-start gap-3.5 pr-6 sm:pr-12">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-ops-blue/30 to-ops-cyan/20 border border-ops-cyan/30 flex items-center justify-center text-ops-cyan shrink-0 mt-1 shadow-[0_0_14px_rgba(0,255,204,0.2)]">
                    <Bot className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Assistant Metadata & Copy Action */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white font-mono">LedgerOne Copilot</span>
                        <span className="text-[10px] font-mono text-white/35">• {msg.timestamp}</span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(msg.text, msg.id)}
                        className="text-white/40 hover:text-white transition-colors p-1 rounded hover:bg-white/[0.06] flex items-center gap-1 text-[11px] font-mono"
                        title="Copy message to clipboard"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Assistant Body Container */}
                    <div className="p-4 sm:p-5 rounded-2xl rounded-tl-sm bg-[#121322] border border-white/[0.08] text-white/90 shadow-md">
                      <div className="space-y-1">
                        {renderFormattedText(msg.text)}
                      </div>

                      {/* Verified Spatial Grounding Citations */}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="mt-4 pt-3.5 border-t border-white/[0.08] space-y-2 font-mono text-xs">
                          <div className="text-[10px] text-white/45 uppercase tracking-wider flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-ops-cyan" />
                            VERIFIED SPATIAL GROUNDING CITATIONS ({msg.citations.length}):
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                            {msg.citations.map((cite, cIdx) => (
                              <div
                                key={cIdx}
                                onClick={() => navigate(`/workspace/documents/doc-001`)}
                                className="p-2.5 rounded-lg bg-[#0A0B14] border border-white/[0.08] hover:border-ops-cyan/50 flex items-center justify-between gap-2 text-white/80 cursor-pointer transition-all group shadow-sm hover:shadow-[0_0_12px_rgba(0,255,204,0.1)]"
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <FileText className="w-3.5 h-3.5 text-ops-cyan shrink-0 group-hover:scale-110 transition-transform" />
                                  <span className="text-white font-semibold group-hover:text-ops-cyan transition-colors truncate text-xs">
                                    #{cite.docNumber} (P.{cite.page})
                                  </span>
                                </div>
                                <span className="text-ops-cyan text-[10px] flex items-center gap-0.5 shrink-0">
                                  Inspect <ExternalLink className="w-2.5 h-2.5" />
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ChatGPT-Style Follow-Up Suggestion Chips */}
                      {msg.followUps && msg.followUps.length > 0 && (
                        <div className="mt-4 pt-3.5 border-t border-white/[0.06] flex flex-wrap gap-2">
                          {msg.followUps.map((chip, chipIdx) => (
                            <button
                              key={chipIdx}
                              onClick={() => handleSend(chip)}
                              className="text-xs font-mono px-3 py-1.5 rounded-full bg-white/[0.03] hover:bg-ops-cyan/15 hover:border-ops-cyan/40 border border-white/[0.08] text-white/70 hover:text-white transition-all text-left flex items-center gap-1.5"
                            >
                              <span className="text-ops-cyan">+</span>
                              <span>"{chip}"</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Assistant Thinking / Loading Indicator */}
          {loading && (
            <div className="flex items-start gap-3.5 pr-12 animate-in fade-in duration-200">
              <div className="w-8 h-8 rounded-xl bg-ops-blue/20 border border-ops-blue/40 flex items-center justify-center text-ops-cyan shrink-0 shadow-[0_0_15px_rgba(0,255,204,0.3)]">
                <Bot className="w-4 h-4 animate-spin" />
              </div>
              <div className="p-4 rounded-2xl rounded-tl-sm bg-[#121322] border border-white/[0.08] text-xs font-mono text-ops-cyan flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-ops-cyan animate-ping" />
                <span>Scanning pgvector index & auditing mathematical invariants...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ChatGPT-Style Pinned Bottom Input Dock */}
      <div className="sticky bottom-0 z-20 px-4 sm:px-6 lg:px-8 pb-4 pt-2 bg-gradient-to-t from-[#0A0B14] via-[#0A0B14]/95 to-transparent shrink-0">
        <div className="max-w-3xl lg:max-w-4xl mx-auto w-full">
          {/* Input Box Card */}
          <div className="rounded-2xl bg-[#121324] border border-white/15 focus-within:border-ops-cyan/60 focus-within:shadow-[0_0_25px_rgba(0,255,204,0.15)] transition-all p-3 shadow-xl">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about invoices, tax equations, line items, 3-way matching, or spend..."
              className="w-full bg-transparent text-white placeholder-white/35 text-xs sm:text-sm focus:outline-none resize-none min-h-[38px] max-h-[160px] font-sans leading-relaxed px-1"
            />

            {/* Bottom Input Controls Bar */}
            <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] mt-1 text-xs">
              <div className="flex items-center gap-2 text-[11px] font-mono text-white/40">
                <span className="hidden sm:inline">Press</span>
                <kbd className="px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-white/60 text-[10px]">Enter</kbd>
                <span className="hidden sm:inline">to send,</span>
                <kbd className="hidden sm:inline px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-white/60 text-[10px]">Shift + Enter</kbd>
                <span className="hidden sm:inline">for new line</span>
              </div>

              <button
                disabled={loading || !input.trim()}
                onClick={() => handleSend()}
                className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                  input.trim() && !loading
                    ? 'bg-ops-cyan text-black hover:scale-105 shadow-[0_0_15px_rgba(0,255,204,0.4)]'
                    : 'bg-white/[0.06] text-white/20 cursor-not-allowed'
                }`}
                aria-label="Send Message"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Subtitle Disclaimer */}
          <p className="text-[10px] font-mono text-center text-white/30 mt-2">
            LedgerOne Copilot is grounded on pgvector embeddings. Verify equations and spatial bounding boxes in Document Studio.
          </p>
        </div>
      </div>
    </div>
  );
};
