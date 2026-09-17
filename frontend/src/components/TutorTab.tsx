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
  BookOpen,
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
        <div className="shrink-0 w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600
          flex items-center justify-center shadow-lg shadow-indigo-900/40 mt-0.5">
          <Bot className="w-3.5 h-3.5 text-white" />
        </div>
      )}

      <div className={`flex flex-col gap-1.5 max-w-[80%] ${isUser ? "items-end" : "items-start"}`}>
        {/* Bubble */}
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed
            ${isUser
              ? "bg-indigo-600 text-white rounded-tr-sm shadow-lg shadow-indigo-900/30"
              : "bg-gray-900/80 border border-gray-800 text-gray-100 rounded-tl-sm shadow-lg"
            }
            ${isPending ? "opacity-60" : ""}`}
        >
          {isPending && !turn.content ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
              <span className="text-gray-400 text-xs">Generating response…</span>
            </span>
          ) : (
            <div>
              <span className="whitespace-pre-wrap break-words">{turn.content}</span>
              {isPending && (
                <span className="inline-block w-1.5 h-3.5 ml-1 bg-indigo-400 animate-pulse align-middle" />
              )}
            </div>
          )}
        </div>

        {/* Metadata badges — only for assistant responses */}
        {!isUser && !isPending && (
          <div className="flex flex-wrap items-center gap-1.5 px-1">
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
        ? "bg-indigo-600/15 border-indigo-500/30 text-indigo-200"
        : "border-transparent hover:bg-gray-800/60 text-gray-400 hover:text-gray-200"
      }`}
  >
    <div className="flex items-start gap-2">
      <MessageCircle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${active ? "text-indigo-400" : "text-gray-600"}`} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate leading-snug">{conv.title}</p>
        <p className="text-[10px] text-gray-600 mt-0.5 flex items-center gap-1">
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
    <div className="flex flex-col items-center justify-center flex-1 px-8 py-16 text-center">
      <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-600/20 to-violet-600/10 border border-indigo-500/20 mb-5">
        <Sparkles className="w-8 h-8 text-indigo-400" />
      </div>
      <h3 className="text-base font-bold text-white mb-2">Ask your AI Tutor</h3>
      <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
        Answers are strictly grounded in your uploaded learning materials.
        Every response cites the exact page and document used.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-2 w-full max-w-xs">
        {[
          "Summarize the key concepts from the materials",
          "What is the main algorithm explained on page 2?",
          "How does self-attention work?",
        ].map((prompt) => (
          <button
            key={prompt}
            onClick={() => setQuestion(prompt)}
            className="w-full text-left px-3 py-2.5 rounded-xl text-xs text-gray-300
              bg-gray-900/60 border border-gray-800 hover:bg-gray-800/80 hover:border-gray-700
              hover:text-white transition-all group"
          >
            <span className="flex items-center gap-2">
              <ChevronRight className="w-3 h-3 text-indigo-500 group-hover:translate-x-0.5 transition-transform" />
              {prompt}
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
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 font-mono">
            Sessions
          </span>
          <button
            onClick={startNewConversation}
            className="p-1 rounded-lg bg-indigo-600/10 border border-indigo-500/20 text-indigo-400
              hover:bg-indigo-600/20 transition-colors"
            title="New conversation"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        <div className="flex flex-col gap-1 overflow-y-auto flex-1 pr-0.5 scrollbar-thin">
          {conversations.length === 0 ? (
            <p className="text-[11px] text-slate-600 px-2 py-3">No sessions yet</p>
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
      <div className="flex flex-col flex-1 rounded-2xl border border-[#1e293b] bg-slate-950/60 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e293b]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              title="Toggle sessions sidebar"
            >
              <MessageCircle className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-[#1e293b]" />
            <Bot className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-semibold text-white">AI Tutor</span>
            {activeConvId && (
              <span className="text-[10px] text-slate-500 font-mono">
                #{activeConvId.slice(0, 8)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <BookOpen className="w-3 h-3 text-indigo-400" />
            <span>Grounded · pgvector · Gemini</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          {convLoading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
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
              bg-rose-950/30 border border-rose-800/30 text-rose-300 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="px-4 pb-4 pt-3 border-t border-[#1e293b]">
          <div className={`flex items-end gap-2.5 rounded-xl border px-3 py-2.5 transition-colors
            ${isOverLimit
              ? "border-rose-500/40 bg-slate-900/60"
              : "border-slate-800 bg-slate-900/60 focus-within:border-indigo-500/50"
            }`}
          >
            <textarea
              ref={textareaRef}
              id="tutor-question-input"
              rows={1}
              value={question}
              onChange={handleQuestionChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your learning materials…"
              disabled={submitting}
              className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 resize-none
                outline-none leading-relaxed min-h-[24px] max-h-[160px] disabled:opacity-50"
            />

            <div className="flex items-center gap-2 shrink-0 pb-0.5">
              {charCount > 0 && (
                <span className={`text-[10px] font-mono tabular-nums ${isOverLimit ? "text-rose-400" : "text-slate-500"}`}>
                  {charCount}/{MAX_QUESTION_LENGTH}
                </span>
              )}
              {submitting ? (
                <button
                  id="tutor-cancel-btn"
                  onClick={handleCancel}
                  className="p-2 rounded-lg bg-rose-600/80 text-white hover:bg-rose-500
                    transition-all hover:shadow-lg hover:shadow-rose-900/40 active:scale-95"
                  title="Stop generation"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              ) : (
                <button
                  id="tutor-send-btn"
                  onClick={handleSend}
                  disabled={!canSend}
                  className="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500
                    disabled:opacity-40 disabled:cursor-not-allowed transition-all
                    hover:shadow-lg hover:shadow-indigo-900/40 active:scale-95"
                  title="Send (Ctrl+Enter)"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5 px-1">
            Press <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-400 text-[9px]">Ctrl</kbd>+
            <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-400 text-[9px]">Enter</kbd> to send
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Right: Sources Panel (as shown in reference)                        */}
      {/* ------------------------------------------------------------------ */}
      {activeCitations.length > 0 && (
        <aside className="hidden lg:flex flex-col w-56 shrink-0 rounded-2xl border border-[#1e293b] bg-slate-950/60 p-3 space-y-3 overflow-y-auto">
          <div className="flex items-center justify-between pb-2 border-b border-[#1e293b]">
            <span className="text-xs font-bold text-white tracking-tight">Sources</span>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-800/40">
              Grounded
            </span>
          </div>

          <div className="space-y-2">
            {activeCitations.map((c, idx) => (
              <div
                key={c.chunk_id || idx}
                className="p-2.5 rounded-xl bg-slate-900/80 border border-[#1e293b] text-xs space-y-1"
              >
                <div className="flex items-center gap-1.5 text-indigo-300 font-semibold truncate">
                  <FileText className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
                  <span className="truncate">{c.filename}</span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
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
