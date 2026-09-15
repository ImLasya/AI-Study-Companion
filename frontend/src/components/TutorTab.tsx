/**
 * TutorTab — Phase 3 Grounded AI Tutor Chat Interface
 *
 * Features:
 * - Multi-turn conversation with server-side persistence
 * - Server-validated page-level citations (never hallucinated)
 * - Insufficient-evidence handling with guidance
 * - Conversation history sidebar with session switching
 * - Animated streaming-style appearance for responses
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
} from "lucide-react";
import {
  askTutorApi,
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
          {isPending ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
              <span className="text-gray-400 text-xs">Thinking…</span>
            </span>
          ) : (
            <span className="whitespace-pre-wrap break-words">{turn.content}</span>
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
  // Start a new conversation (clear chat)
  // ---------------------------------------------------------------------------
  const startNewConversation = () => {
    setActiveConvId(undefined);
    setMessages([]);
    setError(null);
    textareaRef.current?.focus();
  };

  // ---------------------------------------------------------------------------
  // Send message
  // ---------------------------------------------------------------------------
  const handleSend = async () => {
    const trimmed = question.trim();
    if (!trimmed || submitting) return;

    setQuestion("");
    setError(null);

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
      id: `pending-${Date.now()}`,
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

    try {
      const answer = await askTutorApi(projectId, trimmed, activeConvId);

      // Replace pending with real answer
      const assistantTurn: ChatTurn = {
        id: answer.message_id,
        role: "assistant",
        content: answer.answer,
        grounded: answer.grounded,
        insufficient_evidence: answer.insufficient_evidence,
        citations: answer.citations,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => {
        const withoutPending = prev.filter((m) => !m.isPending);
        return [...withoutPending, assistantTurn];
      });

      setActiveConvId(answer.conversation_id);

      // Refresh conversation list to include this session
      await loadConversations();
    } catch (err) {
      // Remove pending, show error
      setMessages((prev) => prev.filter((m) => !m.isPending));
      const msg = err instanceof Error ? err.message : "AI Tutor is temporarily unavailable.";
      setError(msg);
    } finally {
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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
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
          <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">
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
            <p className="text-[11px] text-gray-700 px-2 py-3">No sessions yet</p>
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
      <div className="flex flex-col flex-1 rounded-2xl border border-gray-800 bg-gray-950/60 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/80">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
              title="Toggle sessions sidebar"
            >
              <MessageCircle className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-gray-800" />
            <Bot className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-semibold text-white">AI Tutor</span>
            {activeConvId && (
              <span className="text-[10px] text-gray-600 font-mono">
                #{activeConvId.slice(0, 8)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
            <BookOpen className="w-3 h-3" />
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
        <div className="px-4 pb-4 pt-3 border-t border-gray-800/80">
          <div className={`flex items-end gap-2.5 rounded-xl border px-3 py-2.5 transition-colors
            ${isOverLimit
              ? "border-rose-500/40 bg-gray-900/60"
              : "border-gray-700 bg-gray-900/60 focus-within:border-indigo-500/50"
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
              className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-600 resize-none
                outline-none leading-relaxed min-h-[24px] max-h-[160px] disabled:opacity-50"
            />

            <div className="flex items-center gap-2 shrink-0 pb-0.5">
              {charCount > 0 && (
                <span className={`text-[10px] font-mono tabular-nums ${isOverLimit ? "text-rose-400" : "text-gray-600"}`}>
                  {charCount}/{MAX_QUESTION_LENGTH}
                </span>
              )}
              <button
                id="tutor-send-btn"
                onClick={handleSend}
                disabled={!canSend}
                className="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500
                  disabled:opacity-40 disabled:cursor-not-allowed transition-all
                  hover:shadow-lg hover:shadow-indigo-900/40 active:scale-95"
                title="Send (Ctrl+Enter)"
              >
                {submitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
          <p className="text-[10px] text-gray-700 mt-1.5 px-1">
            Press <kbd className="px-1 py-0.5 rounded bg-gray-800 text-gray-500 text-[9px]">Ctrl</kbd>+
            <kbd className="px-1 py-0.5 rounded bg-gray-800 text-gray-500 text-[9px]">Enter</kbd> to send
          </p>
        </div>
      </div>
    </div>
  );
};
