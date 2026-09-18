/**
 * TutorTab — Grounded AI Tutor Chat Interface
 *
 * Features:
 * - Multi-turn conversation with server-side persistence
 * - Server-validated page-level citations (never hallucinated)
 * - Insufficient-evidence handling with guidance
 * - Conversation history sidebar with session switching
 * - Animated streaming-style appearance for responses
 * - Verified Sources sidebar panel
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
} from "lucide-react";
import {
  askTutorStreamApi,
  getConversationApi,
  getConversationsApi,
} from "@/lib/api";
import type {
  ChatTurn,
  TutorCitation,
  TutorConversationSummary,
} from "@/types";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const CitationCard: React.FC<{ citation: TutorCitation; index: number }> = ({
  citation,
  index,
}) => (
  <a
    href="#"
    onClick={(e) => e.preventDefault()}
    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium
      bg-indigo-500/10 text-indigo-300 border border-indigo-500/20
      hover:bg-indigo-500/20 transition-colors cursor-default"
    title={`${citation.filename}, page ${citation.page_number}`}
  >
    <FileText className="w-2.5 h-2.5 shrink-0" />
    <span>
      [{index + 1}] {citation.filename} · p.{citation.page_number}
    </span>
  </a>
);

const InsufficientEvidenceBadge: React.FC = () => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium
    bg-amber-500/10 text-amber-400 border border-amber-500/20">
    <AlertTriangle className="w-2.5 h-2.5" />
    Outside material scope
  </span>
);

const GroundedBadge: React.FC = () => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium
    bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
    <ShieldCheck className="w-2.5 h-2.5" />
    Grounded
  </span>
);

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

const MessageBubble: React.FC<{ turn: ChatTurn }> = ({ turn }) => {
  const isUser = turn.role === "user";
  const isPending = turn.isPending;

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} group`}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="shrink-0 w-8 h-8 rounded-xl bg-accent text-white flex items-center justify-center shadow-md shadow-accent/20 mt-0.5">
          <Bot className="w-4 h-4 text-white" />
        </div>
      )}

      <div className={`flex flex-col gap-1.5 max-w-[82%] ${isUser ? "items-end" : "items-start"}`}>
        {/* Bubble */}
        <div
          className={`rounded-2xl px-4.5 py-3.5 text-sm leading-relaxed
            ${isUser
              ? "bg-accent text-white rounded-tr-sm shadow-md shadow-accent/15"
              : "bg-surface-muted/50 dark:bg-slate-800/40 border border-border/40 text-text-primary rounded-tl-sm"
            }
            ${isPending ? "opacity-70" : ""}`}
        >
          {isPending && !turn.content ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
              <span className="text-text-muted text-xs">Consulting learning materials…</span>
            </span>
          ) : (
            <div>
              <span className="whitespace-pre-wrap break-words">{turn.content}</span>
              {isPending && (
                <span className="inline-block w-1.5 h-3.5 ml-1 bg-accent animate-pulse align-middle" />
              )}
            </div>
          )}
        </div>

        {/* Metadata badges — only for assistant responses */}
        {!isUser && !isPending && (
          <div className="flex flex-wrap items-center gap-1.5 px-1 pt-0.5">
            {turn.grounded && <GroundedBadge />}
            {turn.insufficient_evidence && <InsufficientEvidenceBadge />}
            {turn.citations.map((c, i) => (
              <CitationCard key={c.chunk_id} citation={c} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Conversation Sidebar item
// ---------------------------------------------------------------------------

const ConvSidebarItem: React.FC<{
  conv: TutorConversationSummary;
  active: boolean;
  onClick: () => void;
}> = ({ conv, active, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full text-left px-3 py-2.5 rounded-xl transition-all border
      ${active
        ? "bg-accent-soft border-accent/30 text-accent font-semibold shadow-sm"
        : "border-transparent hover:bg-surface-muted text-text-secondary hover:text-text-primary"
      }`}
  >
    <div className="flex items-start gap-2">
      <MessageCircle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${active ? "text-accent" : "text-text-muted"}`} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate leading-snug">{conv.title}</p>
        <p className="text-[10px] text-text-muted mt-0.5 flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" />
          {conv.message_count} messages
        </p>
      </div>
    </div>
  </button>
);

// ---------------------------------------------------------------------------
// Main TutorTab
// ---------------------------------------------------------------------------

interface TutorTabProps {
  projectId: string;
}

const MAX_QUESTION_LENGTH = 2000;

export const TutorTab: React.FC<TutorTabProps> = ({ projectId }) => {
  // Conversation state
  const [conversations, setConversations] = useState<TutorConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatTurn[]>([]);

  // UI state
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convLoading, setConvLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Refs
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ---------------------------------------------------------------------------
  // Scroll to latest message
  // ---------------------------------------------------------------------------
  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ---------------------------------------------------------------------------
  // Load conversation list
  // ---------------------------------------------------------------------------
  const loadConversations = useCallback(async () => {
    try {
      const convs = await getConversationsApi(projectId);
      setConversations(convs);
    } catch {
      // Silently ignore conversation list errors
    }
  }, [projectId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // ---------------------------------------------------------------------------
  // Load selected conversation messages
  // ---------------------------------------------------------------------------
  const loadConversation = useCallback(async (convId: string) => {
    setConvLoading(true);
    setError(null);
    try {
      const conv = await getConversationApi(convId);
      const turns: ChatTurn[] = conv.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        grounded: m.grounded,
        insufficient_evidence: m.insufficient_evidence,
        citations: m.citations,
        created_at: m.created_at,
      }));
      setMessages(turns);
      setActiveConvId(convId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load conversation";
      setError(msg);
    } finally {
      setConvLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Abort controller for streaming
  // ---------------------------------------------------------------------------
  const abortControllerRef = useRef<AbortController | null>(null);

  // ---------------------------------------------------------------------------
  // Start a new conversation (clear chat)
  // ---------------------------------------------------------------------------
  const startNewConversation = () => {
    setActiveConvId(undefined);
    setMessages([]);
    setError(null);
    textareaRef.current?.focus();
  };

  // ---------------------------------------------------------------------------
  // Cancel active stream
  // ---------------------------------------------------------------------------
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setSubmitting(false);
    setMessages((prev) => prev.filter((m) => !m.isPending || m.content.length > 0).map((m) => ({ ...m, isPending: false })));
  };

  // ---------------------------------------------------------------------------
  // Send message with real streaming
  // ---------------------------------------------------------------------------
  const handleSend = async () => {
    const trimmed = question.trim();
    if (!trimmed || submitting) return;

    setQuestion("");
    setError(null);

    const pendingId = `pending-${Date.now()}`;

    // Optimistic user turn
    const userTurn: ChatTurn = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
      grounded: false,
      insufficient_evidence: false,
      citations: [],
      created_at: new Date().toISOString(),
    };

    // Pending assistant placeholder
    const pendingTurn: ChatTurn = {
      id: pendingId,
      role: "assistant",
      content: "",
      grounded: false,
      insufficient_evidence: false,
      citations: [],
      created_at: new Date().toISOString(),
      isPending: true,
    };

    setMessages((prev) => [...prev, userTurn, pendingTurn]);
    setSubmitting(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await askTutorStreamApi(
        projectId,
        trimmed,
        activeConvId,
        {
          onStart: (convId) => {
            setActiveConvId(convId);
          },
          onToken: (token) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === pendingId
                  ? { ...m, content: m.content + token, isPending: true }
                  : m
              )
            );
          },
          onInsufficientEvidence: (data) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === pendingId
                  ? {
                      ...m,
                      id: data.message_id,
                      content: data.answer,
                      grounded: false,
                      insufficient_evidence: true,
                      citations: [],
                      isPending: false,
                    }
                  : m
              )
            );
          },
          onError: (errMessage) => {
            setError(errMessage);
            setMessages((prev) => prev.filter((m) => m.id !== pendingId));
          },
          onDone: (data) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === pendingId
                  ? {
                      ...m,
                      id: data.message_id,
                      content: data.answer || m.content,
                      grounded: data.grounded,
                      insufficient_evidence: data.insufficient_evidence,
                      citations: data.citations,
                      isPending: false,
                    }
                  : m
              )
            );
            setActiveConvId(data.conversation_id);
            loadConversations();
          },
        },
        controller.signal
      );
    } catch (err: any) {
      if (err.name === "AbortError") {
        // User aborted intentionally
        return;
      }
      setMessages((prev) => prev.filter((m) => m.id !== pendingId));
      const msg = err instanceof Error ? err.message : "AI Tutor is temporarily unavailable.";
      setError(msg);
    } finally {
      abortControllerRef.current = null;
      setSubmitting(false);
      textareaRef.current?.focus();
    }
  };

  // ---------------------------------------------------------------------------
  // Keyboard: Ctrl/Cmd+Enter to send
  // ---------------------------------------------------------------------------
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  // ---------------------------------------------------------------------------
  // Auto-resize textarea
  // ---------------------------------------------------------------------------
  const handleQuestionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuestion(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  const charCount = question.trim().length;
  const isOverLimit = charCount > MAX_QUESTION_LENGTH;
  const canSend = charCount > 0 && !isOverLimit && !submitting;

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------
  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center flex-1 px-8 py-12 text-center max-w-md mx-auto">
      {/* Educational AI Illustration Badge */}
      <div className="relative mb-5">
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-accent/20 via-purple-500/15 to-transparent flex items-center justify-center text-accent border border-accent/25 shadow-md shadow-accent/10">
          <Bot className="w-8 h-8 text-accent" />
        </div>
        <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-surface border border-border text-emerald-500 shadow-xs">
          <Sparkles className="w-3.5 h-3.5 fill-emerald-500/20" />
        </div>
      </div>

      <h3 className="text-base font-bold text-text-primary tracking-tight mb-1.5">
        AI Tutor Workspace
      </h3>
      <p className="text-xs text-text-secondary max-w-sm leading-relaxed mb-6">
        Strictly grounded in your uploaded materials. Every response cites exact page numbers and passages with zero hallucinations.
      </p>

      {/* Suggested Prompt Chips */}
      <div className="w-full space-y-2">
        <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider font-mono block text-left px-1">
          Suggested Questions
        </span>
        {[
          "Summarize the core concepts from the materials",
          "What is the key algorithm explained on page 2?",
          "Can you explain the main theoretical framework step-by-step?",
        ].map((prompt) => (
          <button
            key={prompt}
            onClick={() => setQuestion(prompt)}
            className="w-full text-left px-3.5 py-2.5 rounded-xl text-xs text-text-secondary
              bg-surface-muted/60 border border-border/70 hover:bg-surface hover:border-accent/40
              hover:text-text-primary transition-all group cursor-pointer shadow-xs"
          >
            <span className="flex items-center gap-2">
              <ChevronRight className="w-3.5 h-3.5 text-accent shrink-0 group-hover:translate-x-0.5 transition-transform" />
              <span className="truncate">{prompt}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  // Find citations from latest assistant response
  const latestAssistantWithCitations = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.citations && m.citations.length > 0);
  const activeCitations = latestAssistantWithCitations?.citations || [];

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[500px] gap-4">
      {/* ------------------------------------------------------------------ */}
      {/* Sidebar: Conversation history                                        */}
      {/* ------------------------------------------------------------------ */}
      <aside
        className={`flex flex-col gap-2 shrink-0 transition-all duration-200
          ${sidebarOpen ? "w-52" : "w-0 overflow-hidden"}`}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted font-mono">
            Sessions
          </span>
          <button
            onClick={startNewConversation}
            className="p-1 rounded-lg bg-accent/10 border border-accent/20 text-accent
              hover:bg-accent/20 transition-colors cursor-pointer"
            title="New conversation"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        <div className="flex flex-col gap-1 overflow-y-auto flex-1 pr-0.5 scrollbar-thin">
          {conversations.length === 0 ? (
            <p className="text-[11px] text-text-muted px-2 py-3">No sessions yet</p>
          ) : (
            conversations.map((conv) => (
              <ConvSidebarItem
                key={conv.id}
                conv={conv}
                active={conv.id === activeConvId}
                onClick={() => loadConversation(conv.id)}
              />
            ))
          )}
        </div>
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* Main chat area                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col flex-1 rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/70 bg-surface">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              className="p-1.5 rounded-lg hover:bg-surface-muted text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              title="Toggle sessions sidebar"
            >
              <MessageCircle className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-border" />
            <div>
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-accent" />
                <span className="text-sm font-bold text-text-primary">AI Tutor</span>
                {activeConvId && (
                  <span className="text-[10px] text-text-muted font-mono bg-surface-muted px-1.5 py-0.5 rounded">
                    #{activeConvId.slice(0, 8)}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-text-muted">Grounded in your learning materials</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
            <ShieldCheck className="w-3 h-3 text-emerald-500" />
            <span>Grounded Retrieval</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          {convLoading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="w-5 h-5 animate-spin text-accent" />
            </div>
          ) : messages.length === 0 ? (
            <EmptyState />
          ) : (
            messages.map((turn) => (
              <MessageBubble key={turn.id} turn={turn} />
            ))
          )}

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl
              bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-300 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Visually Prominent Composer */}
        <div className="px-5 pb-5 pt-3 border-t border-border/60 bg-surface">
          <div className={`flex items-end gap-3 rounded-2xl border px-4 py-3 transition-all shadow-sm
            ${isOverLimit
              ? "border-rose-500/40 bg-surface-muted"
              : "border-border bg-surface-muted/40 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15 focus-within:bg-surface"
            }`}
          >
            <textarea
              ref={textareaRef}
              id="tutor-question-input"
              rows={1}
              value={question}
              onChange={handleQuestionChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question grounded in your study materials…"
              disabled={submitting}
              className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted resize-none
                outline-none leading-relaxed min-h-[24px] max-h-[160px] disabled:opacity-50"
            />

            <div className="flex items-center gap-2 shrink-0 pb-0.5">
              {charCount > 0 && (
                <span className={`text-[10px] font-mono tabular-nums ${isOverLimit ? "text-rose-500" : "text-text-muted"}`}>
                  {charCount}/{MAX_QUESTION_LENGTH}
                </span>
              )}
              {submitting ? (
                <button
                  id="tutor-cancel-btn"
                  onClick={handleCancel}
                  className="p-2 rounded-xl bg-rose-600 text-white hover:bg-rose-500
                    transition-all active:scale-95 cursor-pointer shadow-sm"
                  title="Stop generation"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              ) : (
                <button
                  id="tutor-send-btn"
                  onClick={handleSend}
                  disabled={!canSend}
                  className="p-2.5 rounded-xl bg-accent text-white hover:bg-accent-hover
                    disabled:opacity-40 disabled:cursor-not-allowed transition-all
                    shadow-sm shadow-accent/20 active:scale-95 cursor-pointer"
                  title="Send (Ctrl+Enter)"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-text-muted mt-2 px-1">
            <span>
              Press <kbd className="px-1.5 py-0.5 rounded bg-surface-muted text-text-secondary border border-border text-[9px] font-mono">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 rounded bg-surface-muted text-text-secondary border border-border text-[9px] font-mono">Enter</kbd> to send
            </span>
            <span className="font-mono">RAG Citations Active</span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Right: Sources Panel (as shown in reference)                        */}
      {/* ------------------------------------------------------------------ */}
      {activeCitations.length > 0 && (
        <aside className="hidden lg:flex flex-col w-56 shrink-0 rounded-2xl border border-border bg-surface p-3 space-y-3 overflow-y-auto shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <span className="text-xs font-bold text-text-primary tracking-tight">Sources</span>
            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              Grounded
            </span>
          </div>

          <div className="space-y-2">
            {activeCitations.map((c, idx) => (
              <div
                key={c.chunk_id || idx}
                className="p-2.5 rounded-xl bg-surface-muted/60 border border-border text-xs space-y-1"
              >
                <div className="flex items-center gap-1.5 text-accent font-semibold truncate">
                  <FileText className="w-3.5 h-3.5 shrink-0 text-accent" />
                  <span className="truncate">{c.filename}</span>
                </div>
                <div className="text-[11px] text-text-muted font-mono">
                  Page {c.page_number}
                </div>
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
};
