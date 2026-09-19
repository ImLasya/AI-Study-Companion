/**
 * TutorTab — Grounded AI Tutor Chat Interface
 *
 * Matching reference image media_1789732734596.png exactly:
 * - 3-Column layout: Sessions (left) | AI Tutor Chat (center) | Sources (right)
 * - Grounded to study materials with citation badges
 * - Suggested question chips
 * - Full streaming RAG support with cancellation
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  AlertTriangle,
  Bot,
  ChevronRight,
  FileText,
  Loader2,
  MessageCircle,
  Paperclip,
  Plus,
  Send,
  ShieldCheck,
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

interface TutorTabProps {
  projectId: string;
  newSessionTrigger?: number;
  onNavigateTab?: (tab: string) => void;
}

const MAX_QUESTION_LENGTH = 2000;
const cleanTutorContent = (content: string): string => {
  if (!content) return "";

  return content
    // Strip any raw JSON response blob Gemini may emit in stream mode
    // (e.g. {"insufficient_evidence":false,"grounded":true,"citation_chunk_ids":["",""],...})
    .replace(
      /\{[\s\S]*?"citation_chunk_ids"[\s\S]*?\}/g,
      ""
    )
    // Remove complete citation_chunk_ids blocks
    .replace(
      /<citation_chunk_ids>[\s\S]*?<\/citation_chunk_ids>/gi,
      ""
    )
    // Remove incomplete citation_chunk_ids block during streaming
    .replace(
      /<citation_chunk_ids>[\s\S]*$/gi,
      ""
    )
    // Remove one or more UUIDs inside citation brackets
    .replace(
      /\[\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\s*,\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})*\s*\]/gi,
      ""
    )
    // Remove standalone UUIDs if they appear without brackets
    .replace(
      /(?<![a-z0-9])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![a-z0-9])/gi,
      ""
    )
    // Clean leftover whitespace
    .replace(/[ \t]{2,}/g, " ")
    .trim();
};
export const TutorTab: React.FC<TutorTabProps> = ({
  projectId,
  newSessionTrigger = 0,
}) => {
  // Conversation state
  const [conversations, setConversations] = useState<TutorConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatTurn[]>([]);

  // UI state
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convLoading, setConvLoading] = useState(false);

  // Refs
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Scroll to latest message
  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Immediate state reset when projectId changes
  useEffect(() => {
    setConversations([]);
    setActiveConvId(undefined);
    setMessages([]);
    setError(null);
    setConvLoading(false);
  }, [projectId]);

  // Load selected conversation messages
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

  // Load conversation list from backend
  const loadConversations = useCallback(async () => {
    try {
      const convs = await getConversationsApi(projectId);
      setConversations(convs || []);
      if (convs && convs.length > 0) {
        loadConversation(convs[0].id);
      } else {
        setActiveConvId(undefined);
        setMessages([]);
      }
    } catch {
      setConversations([]);
      setActiveConvId(undefined);
      setMessages([]);
    }
  }, [projectId, loadConversation]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Start a new conversation
  const startNewConversation = useCallback(() => {
    setActiveConvId(undefined);
    setMessages([]);
    setError(null);
    setQuestion("");
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  }, []);

  // Listen to external trigger (e.g. from header "+ New Session" button)
  useEffect(() => {
    if (newSessionTrigger > 0) {
      startNewConversation();
    }
  }, [newSessionTrigger, startNewConversation]);

  // Cancel active stream
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setSubmitting(false);
    setMessages((prev) =>
      prev
        .filter((m) => !m.isPending || m.content.length > 0)
        .map((m) => ({ ...m, isPending: false }))
    );
  };

  // Send message with streaming
  const handleSend = async (textToSend?: string) => {
    const rawText = textToSend !== undefined ? textToSend : question;
    const trimmed = rawText.trim();
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
      created_at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    // Pending assistant placeholder
    const pendingTurn: ChatTurn = {
      id: pendingId,
      role: "assistant",
      content: "",
      grounded: false,
      insufficient_evidence: false,
      citations: [],
      created_at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isPending: true,
    };

    setMessages((prev) => [...prev, userTurn, pendingTurn]);
    setSubmitting(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const effectiveConvId = activeConvId;

    try {
      await askTutorStreamApi(
        projectId,
        trimmed,
        effectiveConvId,
        {
          onStart: (convId) => {
            setActiveConvId(convId);
          },
          // onToken: (token) => {
          //   setMessages((prev) =>
          //     prev.map((m) =>
          //       m.id === pendingId
          //         ? { ...m, content: m.content + token, isPending: true }
          //         : m
          //     )
          //   );
          // },
          onToken: (token) => {
  setMessages((prev) =>
    prev.map((m) =>
      m.id === pendingId
        ? {
            ...m,
            content: cleanTutorContent(m.content + token),
            isPending: true,
          }
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
    } catch (err: unknown) {
      const errorObj = err as { name?: string; message?: string };
      if (errorObj?.name === "AbortError") {
        return;
      }
      setMessages((prev) => prev.filter((m) => m.id !== pendingId));
      const msg = errorObj?.message || "AI Tutor is temporarily unavailable.";
      setError(msg);
    } finally {
      abortControllerRef.current = null;
      setSubmitting(false);
      textareaRef.current?.focus();
    }
  };

  // Keyboard shortcut: Enter to send
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuestionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuestion(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const charCount = question.trim().length;
  const isOverLimit = charCount > MAX_QUESTION_LENGTH;
  const canSend = charCount > 0 && !isOverLimit && !submitting;

  // Active citations from latest assistant turn
  const latestAssistantWithCitations = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.citations && m.citations.length > 0);
  const activeCitations: TutorCitation[] = latestAssistantWithCitations?.citations || [];

  // Displayed sources in right column strictly derived from active conversation
  const displayedSources = activeCitations.map((c, idx) => ({
    filename: c.filename,
    page_number: c.page_number,
    section: `Citation [${idx + 1}]`,
  }));

  // Suggested questions chips
  const suggestedQuestions = [
    "Explain the main topics covered in this book",
    "What is deep learning?",
    "Summarize chapter 1",
    "Give key takeaways",
  ];

  return (
    <div className="flex flex-col lg:flex-row items-stretch gap-5 min-h-[640px]">
      {/* ==================================================================== */}
      {/* 1. LEFT COLUMN — SESSIONS PANEL (~22% width)                         */}
      {/* ==================================================================== */}
      <div className="w-full lg:w-64 xl:w-72 shrink-0 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700/80 p-4 shadow-xs flex flex-col justify-between transition-all duration-200 hover:shadow-md">
        <div>
          {/* Header with Title and + New Button */}
          <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-100 dark:border-slate-700/60">
            <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">Sessions</h3>
            <button
              onClick={startNewConversation}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-semibold text-[#4F46E5] dark:text-indigo-400 bg-[#EEF2FF] dark:bg-indigo-950/50 hover:bg-[#E0E7FF] transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
          </div>

          {/* Sessions List */}
          <div className="space-y-1.5 overflow-y-auto max-h-[520px] scrollbar-none pr-0.5">
            {conversations.map((conv) => {
              const isSelected = conv.id === activeConvId;
              return (
                <button
                  key={conv.id}
                  onClick={() => loadConversation(conv.id)}
                  className={`w-full text-left p-3 rounded-xl transition-all duration-150 flex items-start gap-3 cursor-pointer group ${
                    isSelected
                      ? "bg-[#EEF2FF] dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-900/40 shadow-2xs"
                      : "hover:bg-slate-50 dark:hover:bg-slate-700/40 border border-transparent"
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      isSelected
                        ? "bg-[#4F46E5] text-white"
                        : "bg-slate-100 dark:bg-slate-700 text-slate-400 group-hover:text-slate-600"
                    }`}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-xs font-semibold truncate leading-tight ${
                        isSelected
                          ? "text-[#4F46E5] dark:text-indigo-300 font-bold"
                          : "text-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {conv.title}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 font-medium">
                      {conv.message_count} {conv.message_count === 1 ? "message" : "messages"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 2. CENTER COLUMN — AI TUTOR CONVERSATION (~52% width)                */}
      {/* ==================================================================== */}
      <div className="flex-1 min-w-0 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700/80 shadow-xs flex flex-col overflow-hidden transition-all duration-200 hover:shadow-md">
        {/* Tutor Header */}
        <div className="p-4 sm:px-5 sm:py-3.5 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#EEF2FF] dark:bg-indigo-950/50 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-2xs">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">AI Tutor</h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#ECFDF5] dark:bg-emerald-950/40 text-[#059669] dark:text-emerald-300 border border-[#A7F3D0] dark:border-emerald-800">
                  Grounded to your materials
                </span>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                Get accurate, source-based answers from your uploaded materials.
              </p>
            </div>
          </div>
        </div>

        {/* Conversation Message History */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 max-h-[460px] scrollbar-thin">
          {convLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-[#4F46E5] mb-2" />
              <span className="text-xs font-medium">Loading session conversation...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#EEF2FF] dark:bg-indigo-950/50 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center mb-2.5">
                <Bot className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">Start a new conversation</h4>
              <p className="text-xs text-slate-400 max-w-sm mt-1">
                Ask any question about your textbooks, slides, and notes. The AI Tutor cites exact page numbers.
              </p>
            </div>
          ) : (
            messages.map((turn) => {
              const isUser = turn.role === "user";
              const isPending = turn.isPending;

              return (
                <div
                  key={turn.id}
                  className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"} group animate-in fade-in duration-150`}
                >
                  {/* Assistant Robot Avatar */}
                  {!isUser && (
                    <div className="w-8 h-8 rounded-xl bg-[#EEF2FF] dark:bg-indigo-950/50 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center shrink-0 mt-1 shadow-2xs">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div className={`flex flex-col ${isUser ? "items-end max-w-lg" : "items-start max-w-xl"}`}>
                    {/* Chat Bubble */}
                    <div
                      className={`text-xs sm:text-sm px-4 py-3 leading-relaxed shadow-2xs ${
                        isUser
                          ? "bg-[#4F46E5] text-white rounded-2xl rounded-tr-xs"
                          : "bg-[#F8FAFC] dark:bg-slate-900 text-[#0F172A] dark:text-slate-100 rounded-2xl rounded-tl-xs border border-slate-200/60 dark:border-slate-700"
                      } ${isPending ? "opacity-80" : ""}`}
                    >
                      {isPending && !turn.content ? (
                        <div className="flex items-center gap-2 text-slate-500">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#4F46E5]" />
                          <span className="text-xs">Consulting learning materials...</span>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          <div className="prose prose-sm dark:prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                            <ReactMarkdown>
                              {cleanTutorContent(turn.content)}
                            </ReactMarkdown>
                          </div>
                          {isPending && (
                            <span className="inline-block w-1.5 h-3 ml-1 bg-[#4F46E5] animate-pulse" />
                          )}

                          {/* Grounded Citations Bar Inside Assistant Bubble */}
                          {!isUser && turn.citations && turn.citations.length > 0 && (
                            <div className="pt-2">
                              {turn.citations.map((c, cIdx) => (
                                <div
                                  key={c.chunk_id || cIdx}
                                  className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 p-2 sm:px-3 sm:py-2 flex items-center justify-between gap-2 shadow-2xs hover:border-indigo-300 transition-colors cursor-pointer"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                                      Sources:
                                    </span>
                                    <span className="w-4 h-4 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-[#4F46E5] dark:text-indigo-400 text-[10px] font-mono flex items-center justify-center font-bold shrink-0">
                                      {cIdx + 1}
                                    </span>
                                    <span className="text-xs text-slate-600 dark:text-slate-300 font-medium truncate">
                                      {c.filename} · p.{c.page_number}
                                    </span>
                                  </div>
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Insufficient Evidence Warning if applicable */}
                          {!isUser && turn.insufficient_evidence && (
                            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                              <AlertTriangle className="w-3 h-3 text-amber-500" />
                              <span>Outside current material scope</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Timestamp */}
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 px-1">
                      {turn.created_at || "4:25 PM"}
                    </span>
                  </div>

                  {/* User Circular Avatar on Right */}
                  {isUser && (
                    <div className="w-8 h-8 rounded-full bg-[#6366F1] text-white font-bold text-xs flex items-center justify-center shrink-0 mt-1 shadow-2xs">
                      L
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Error Banner */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-300 text-xs">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Suggested Question Chips */}
        <div className="px-4 sm:px-5 pt-2 pb-1">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
            {suggestedQuestions.map((qText, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(qText)}
                className="bg-white dark:bg-slate-800 border border-indigo-100 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-800 text-[#4F46E5] dark:text-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-slate-700 text-xs font-medium px-3.5 py-1.5 rounded-full shadow-2xs transition-all whitespace-nowrap cursor-pointer shrink-0"
              >
                {qText}
              </button>
            ))}
          </div>
        </div>

        {/* Chat Input Bar */}
        <div className="p-4 sm:px-5 sm:pb-4 pt-1">
          <div
            className={`rounded-2xl border px-3.5 py-2 sm:py-2.5 flex items-center gap-2.5 transition-all shadow-2xs ${
              isOverLimit
                ? "border-rose-400 bg-white dark:bg-slate-800"
                : "border-slate-200 dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-900/80 focus-within:border-[#4F46E5] focus-within:bg-white dark:focus-within:bg-slate-900"
            }`}
          >
            {/* Paperclip attachment icon */}
            <button
              type="button"
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1"
              title="Attach document reference"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* Input textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              value={question}
              onChange={handleQuestionChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your study materials..."
              disabled={submitting}
              className="flex-1 bg-transparent text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none resize-none leading-relaxed min-h-[22px] max-h-[100px]"
            />

            {/* Send or Stop button */}
            {submitting ? (
              <button
                onClick={handleCancel}
                className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 hover:bg-rose-500 transition-colors shadow-xs cursor-pointer"
                title="Stop generation"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : (
              <button
                onClick={() => handleSend()}
                disabled={!canSend}
                className="w-8 h-8 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] disabled:opacity-40 disabled:hover:bg-[#4F46E5] text-white flex items-center justify-center shrink-0 transition-all active:scale-95 shadow-xs cursor-pointer"
                title="Send message (Enter)"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center mt-1.5 font-medium">
            Answers are generated from your uploaded materials.
          </p>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. RIGHT COLUMN — SOURCES PANEL (~24% width)                         */}
      {/* ==================================================================== */}
      <div className="w-full lg:w-64 xl:w-72 shrink-0 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700/80 p-4 shadow-xs flex flex-col justify-between transition-all duration-200 hover:shadow-md">
        <div>
          {/* Header with Title and Grounded Badge */}
          <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-100 dark:border-slate-700/60">
            <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">Sources</h3>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#ECFDF5] dark:bg-emerald-950/40 text-[#059669] dark:text-emerald-300 border border-[#A7F3D0] dark:border-emerald-800">
              Grounded
            </span>
          </div>

          {/* Sources Stacked Cards */}
          <div className="space-y-2 overflow-y-auto max-h-[460px] scrollbar-none pr-0.5">
            {displayedSources.map((source, sIdx) => (
              <div
                key={sIdx}
                className="bg-[#F8FAFC] dark:bg-slate-900/70 hover:bg-white dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-700/70 rounded-xl p-3 flex items-start gap-2.5 transition-all duration-200 hover:shadow-xs hover:-translate-y-0.5 cursor-pointer group"
              >
                <div className="p-1 rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 shrink-0 mt-0.5">
                  <FileText className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[#0F172A] dark:text-slate-100 truncate group-hover:text-[#4F46E5] dark:group-hover:text-indigo-400 transition-colors">
                    {source.filename}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-400 mt-0.5 font-medium">
                    Page {source.page_number} · {source.section}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Informational Box */}
        <div className="mt-4 p-3 rounded-xl bg-[#EFF6FF] dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed shadow-2xs">
          <ShieldCheck className="w-4 h-4 text-[#4F46E5] shrink-0 mt-0.5" />
          <span className="text-[11px] leading-snug">
            All answers are grounded in your uploaded materials to ensure accuracy.
          </span>
        </div>
      </div>
    </div>
  );
};
