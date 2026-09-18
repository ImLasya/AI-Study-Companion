import React, { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Tag,
  Trash2,
  X,
  FileText,
} from "lucide-react";
import {
  deleteFlashcardApi,
  generateFlashcardsApi,
  getDueFlashcardsApi,
  getDueFlashcardsSummaryApi,
  listFlashcardsApi,
  recordFlashcardSessionApi,
  reviewFlashcardSpacedApi,
} from "@/lib/api";
import { Concept, DueFlashcardsSummary, Flashcard, FlashcardRating } from "@/types";

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------

interface FlashcardTabProps {
  projectId: string;
  concepts: Concept[];
}

type DeckFilter = "all" | "due" | "new" | "known" | "difficult";

interface SessionStats {
  again: number;
  difficult: number;
  good: number;
  easy: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Pure Interval Preview Helper (matches backend SM-2 scheduler)
// ---------------------------------------------------------------------------

function previewNextInterval(card: Flashcard, rating: FlashcardRating): string {
  const interval = card.interval_days || 0;
  const ease = card.ease_factor || 2.5;

  if (rating === "again") {
    return "1d";
  }
  if (rating === "difficult") {
    if (interval <= 0) return "1d";
    const nextDays = Math.max(interval + 1, Math.round(interval * 1.2));
    return `${nextDays}d`;
  }
  if (rating === "good") {
    if (interval <= 0) return "1d";
    if (interval === 1) return "3d";
    const nextDays = Math.max(interval + 1, Math.round(interval * ease));
    return `${nextDays}d`;
  }
  if (rating === "easy") {
    if (interval <= 0) return "3d";
    if (interval <= 3) return "6d";
    const nextDays = Math.max(interval + 2, Math.round(interval * ease * 1.3));
    return `${nextDays}d`;
  }
  return "1d";
}

function getCardDueStatus(card: Flashcard): { label: string; color: string } {
  if (card.review_count === 0 || !card.next_review_at) {
    return { label: "New Card", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" };
  }
  const nextReview = new Date(card.next_review_at);
  const now = new Date();
  if (nextReview <= now) {
    return { label: "Due Now", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" };
  }
  const diffDays = Math.max(1, Math.round((nextReview.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  return { label: `In ${diffDays}d`, color: "bg-slate-700/40 text-slate-300 border-slate-700" };
}

// ---------------------------------------------------------------------------
// Card Type Badge
// ---------------------------------------------------------------------------

const CardTypeBadge: React.FC<{ cardType: string }> = ({ cardType }) => {
  const colorMap: Record<string, string> = {
    definition: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    explanation: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    comparison: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    process: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    formula: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    example: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  };
  const classes =
    colorMap[cardType] || "bg-slate-500/20 text-slate-300 border-slate-500/30";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${classes}`}
    >
      <Tag className="w-2.5 h-2.5" />
      {cardType}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Today's Review Dashboard Widget
// ---------------------------------------------------------------------------

interface TodayReviewWidgetProps {
  summary: DueFlashcardsSummary | null;
  onStartReview: () => void;
  selectedConceptId: string | null;
  onSelectConcept: (id: string | null) => void;
  concepts: Concept[];
  loadingSummary: boolean;
}

const TodayReviewWidget: React.FC<TodayReviewWidgetProps> = ({
  summary,
  onStartReview,
  selectedConceptId,
  onSelectConcept,
  concepts,
  loadingSummary,
}) => {
  const dueCount = summary?.due_count ?? 0;
  const newCount = summary?.new_count ?? 0;
  const completedToday = summary?.completed_today_count ?? 0;
  const readyToStudy = dueCount + newCount;

  return (
    <div className="space-y-4 mb-8 pb-6 border-b border-border/60">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-accent" />
            <h3 className="font-bold text-text-primary text-base">Today's Review Schedule</h3>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25">
              SM-2 Active
            </span>
          </div>
          <p className="text-xs text-text-muted">
            Prioritizes overdue items and newly grounded concepts for optimal memory retention.
          </p>
        </div>

        {/* Action button & concept selector */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {concepts.length > 0 && (
            <select
              value={selectedConceptId || ""}
              onChange={(e) => onSelectConcept(e.target.value || null)}
              className="h-9 bg-surface-muted border border-border/80 rounded-xl px-3 text-xs text-text-primary focus:outline-none focus:border-accent cursor-pointer"
            >
              <option value="">All Concepts</option>
              {concepts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          <button
            id="start-spaced-review-btn"
            onClick={onStartReview}
            disabled={readyToStudy === 0 || loadingSummary}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover disabled:bg-surface-muted disabled:text-text-muted text-white font-semibold text-xs transition-all shadow-sm disabled:cursor-not-allowed cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>
              {readyToStudy > 0
                ? `Start Study Session (${readyToStudy} card${readyToStudy !== 1 ? "s" : ""})`
                : "All Caught Up"}
            </span>
          </button>
        </div>
      </div>

      {/* Metrics Row (Borderless Open Visual Blocks) */}
      <div className="grid grid-cols-3 gap-3 pt-1">
        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-center">
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400 font-mono">
            {loadingSummary ? "–" : dueCount}
          </p>
          <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium mt-0.5">Due for Review</p>
        </div>
        <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-center">
          <p className="text-xl font-bold text-purple-600 dark:text-purple-400 font-mono">
            {loadingSummary ? "–" : newCount}
          </p>
          <p className="text-[11px] text-purple-700 dark:text-purple-300 font-medium mt-0.5">New Cards</p>
        </div>
        <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center">
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
            {loadingSummary ? "–" : completedToday}
          </p>
          <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium mt-0.5">Completed Today</p>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Interactive Spaced Repetition Study Session Flow
// ---------------------------------------------------------------------------

interface StudySessionProps {
  cards: Flashcard[];
  currentIndex: number;
  onRate: (rating: FlashcardRating) => void;
  onExit: () => void;
  reviewLoading: boolean;
  stats: SessionStats;
}

const StudySession: React.FC<StudySessionProps> = ({
  cards,
  currentIndex,
  onRate,
  onExit,
  reviewLoading,
  stats,
}) => {
  const [flipped, setFlipped] = useState(false);
  const card = cards[currentIndex];

  useEffect(() => {
    setFlipped(false);
  }, [card?.id]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && !reviewLoading) {
        if (e.key === "1") {
          e.preventDefault();
          onRate("again");
        } else if (e.key === "2") {
          e.preventDefault();
          onRate("difficult");
        } else if (e.key === "3") {
          e.preventDefault();
          onRate("good");
        } else if (e.key === "4") {
          e.preventDefault();
          onRate("easy");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [flipped, reviewLoading, onRate]);

  if (!card) return null;

  const dueStatus = getCardDueStatus(card);

  return (
    <div className="flex flex-col items-center gap-6 max-w-3xl mx-auto mb-12">
      {/* Session Progress Header */}
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-indigo-300">
            Card {currentIndex + 1} of {cards.length}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${dueStatus.color}`}>
            {dueStatus.label}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Live session counts */}
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
            <span className="text-rose-400 font-medium">Again: {stats.again}</span>
            <span>·</span>
            <span className="text-amber-400 font-medium">Diff: {stats.difficult}</span>
            <span>·</span>
            <span className="text-emerald-400 font-medium">Good: {stats.good}</span>
            <span>·</span>
            <span className="text-blue-400 font-medium">Easy: {stats.easy}</span>
          </div>

          <button
            onClick={onExit}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            <span>Exit Session</span>
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / cards.length) * 100}%` }}
        />
      </div>

      {/* 3D Flip Card Container */}
      <div className="w-full" style={{ perspective: "1200px" }}>
        <div
          className="relative w-full cursor-pointer"
          style={{
            height: "340px",
            transformStyle: "preserve-3d",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            transition: "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          onClick={() => setFlipped((f) => !f)}
        >
          {/* Front Face */}
          <div
            className="absolute inset-0 rounded-2xl p-8 flex flex-col justify-between"
            style={{
              backfaceVisibility: "hidden",
              background:
                "linear-gradient(135deg, rgba(30, 27, 75, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)",
              border: "1px solid rgba(99, 102, 241, 0.35)",
              boxShadow: "0 20px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            <div className="flex items-start justify-between">
              <CardTypeBadge cardType={card.card_type} />
              <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">
                Tap or Space to reveal
              </span>
            </div>

            <div className="flex-1 flex items-center justify-center py-4">
              <p className="text-xl sm:text-2xl font-semibold text-white text-center leading-relaxed">
                {card.front}
              </p>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-800">
              {card.filename ? (
                <div className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  <span className="truncate max-w-[200px]">{card.filename}</span>
                  {card.page_number && <span>· p.{card.page_number}</span>}
                </div>
              ) : (
                <span />
              )}
              <span>Ease: {card.ease_factor?.toFixed(2) ?? "2.50"}</span>
            </div>
          </div>

          {/* Back Face */}
          <div
            className="absolute inset-0 rounded-2xl p-8 flex flex-col justify-between"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              background:
                "linear-gradient(135deg, rgba(17, 24, 39, 0.98) 0%, rgba(30, 27, 75, 0.95) 100%)",
              border: "1px solid rgba(167, 139, 250, 0.35)",
              boxShadow: "0 20px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            <div className="flex items-start justify-between">
              <CardTypeBadge cardType={card.card_type} />
              <span className="text-xs text-purple-300 uppercase tracking-wider font-semibold">
                Answer
              </span>
            </div>

            <div className="flex-1 flex items-center justify-center py-4 overflow-y-auto max-h-[190px]">
              <p className="text-base sm:text-lg text-slate-100 text-center leading-relaxed font-normal">
                {card.back}
              </p>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-800">
              {card.filename && (
                <div className="flex items-center gap-1.5 text-slate-400">
                  <FileText className="w-3.5 h-3.5" />
                  <span>{card.filename}</span>
                  {card.page_number && <span>· p.{card.page_number}</span>}
                </div>
              )}
              <span>Reviews: {card.review_count}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Control Area */}
      {!flipped ? (
        <button
          onClick={() => setFlipped(true)}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-sm transition-all border border-slate-700"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Show Answer (Space)</span>
        </button>
      ) : (
        <div className="w-full flex flex-col items-center gap-3">
          <p className="text-xs text-slate-400">Rate your recall to schedule next review:</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-xl">
            {/* 1. Again */}
            <button
              onClick={() => onRate("again")}
              disabled={reviewLoading}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 hover:text-white transition-all disabled:opacity-50"
            >
              <div className="flex items-center gap-1 font-semibold text-sm">
                <span>[1] Again</span>
              </div>
              <span className="text-[11px] text-rose-400/80 mt-0.5">
                {previewNextInterval(card, "again")}
              </span>
            </button>

            {/* 2. Difficult */}
            <button
              onClick={() => onRate("difficult")}
              disabled={reviewLoading}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:text-white transition-all disabled:opacity-50"
            >
              <div className="flex items-center gap-1 font-semibold text-sm">
                <span>[2] Difficult</span>
              </div>
              <span className="text-[11px] text-amber-400/80 mt-0.5">
                {previewNextInterval(card, "difficult")}
              </span>
            </button>

            {/* 3. Good */}
            <button
              onClick={() => onRate("good")}
              disabled={reviewLoading}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:text-white transition-all disabled:opacity-50"
            >
              <div className="flex items-center gap-1 font-semibold text-sm">
                <span>[3] Good</span>
              </div>
              <span className="text-[11px] text-emerald-400/80 mt-0.5">
                {previewNextInterval(card, "good")}
              </span>
            </button>

            {/* 4. Easy */}
            <button
              onClick={() => onRate("easy")}
              disabled={reviewLoading}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:text-white transition-all disabled:opacity-50"
            >
              <div className="flex items-center gap-1 font-semibold text-sm">
                <span>[4] Easy</span>
              </div>
              <span className="text-[11px] text-blue-400/80 mt-0.5">
                {previewNextInterval(card, "easy")}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Session Completion Screen
// ---------------------------------------------------------------------------

interface SessionCompleteProps {
  stats: SessionStats;
  onReviewMore: () => void;
  onReturnToDeck: () => void;
  hasRemainingDue: boolean;
}

const SessionComplete: React.FC<SessionCompleteProps> = ({
  stats,
  onReviewMore,
  onReturnToDeck,
  hasRemainingDue,
}) => {
  return (
    <div className="max-w-md mx-auto text-center py-12 px-6 rounded-2xl bg-surface border border-border shadow-xl mb-12">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-accent/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
        <Award className="w-8 h-8 text-emerald-500" />
      </div>

      <h3 className="text-xl font-bold text-text-primary mb-1">Review Complete!</h3>
      <p className="text-xs text-text-muted mb-6">
        All cards in this study batch have been scheduled based on your recall.
      </p>

      {/* Breakdown Grid */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        <div className="bg-surface-muted p-2.5 rounded-xl border border-border">
          <p className="text-lg font-bold text-rose-500">{stats.again}</p>
          <p className="text-[10px] text-text-muted uppercase font-semibold">Again</p>
        </div>
        <div className="bg-surface-muted p-2.5 rounded-xl border border-border">
          <p className="text-lg font-bold text-amber-500">{stats.difficult}</p>
          <p className="text-[10px] text-text-muted uppercase font-semibold">Difficult</p>
        </div>
        <div className="bg-surface-muted p-2.5 rounded-xl border border-border">
          <p className="text-lg font-bold text-emerald-500">{stats.good}</p>
          <p className="text-[10px] text-text-muted uppercase font-semibold">Good</p>
        </div>
        <div className="bg-surface-muted p-2.5 rounded-xl border border-border">
          <p className="text-lg font-bold text-sky-500">{stats.easy}</p>
          <p className="text-[10px] text-text-muted uppercase font-semibold">Easy</p>
        </div>
      </div>

      <div className="flex items-center gap-3 justify-center">
        {hasRemainingDue && (
          <button
            onClick={onReviewMore}
            className="px-4 py-2 rounded-xl bg-accent hover:opacity-90 text-white text-xs font-semibold transition-colors"
          >
            Study Next Due Batch
          </button>
        )}
        <button
          onClick={onReturnToDeck}
          className="px-4 py-2 rounded-xl bg-surface hover:bg-surface-muted border border-border text-text-secondary text-xs font-medium transition-colors"
        >
          Return to Deck
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Card Grid Component
// ---------------------------------------------------------------------------

interface CardGridProps {
  cards: Flashcard[];
  onStudyCard: (card: Flashcard) => void;
  onDeleteCard: (id: string) => void;
}

const CardGrid: React.FC<CardGridProps> = ({
  cards,
  onStudyCard,
  onDeleteCard,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {cards.map((card) => {
        const dueStatus = getCardDueStatus(card);
        return (
          <div
            key={card.id}
            onClick={() => onStudyCard(card)}
            className="group relative rounded-2xl p-5 border border-border bg-surface hover:border-accent/50 hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between"
          >
            <div>
              {/* Header Badges */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <CardTypeBadge cardType={card.card_type} />
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${dueStatus.color}`}>
                  {dueStatus.label}
                </span>
              </div>

              {/* Front Text */}
              <p className="text-sm font-semibold text-text-primary leading-relaxed line-clamp-3 mb-3">
                {card.front}
              </p>
            </div>

            {/* Footer Details */}
            <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-text-muted">
              <div className="flex items-center gap-2">
                <span>EF: {card.ease_factor?.toFixed(2) ?? "2.50"}</span>
                <span>·</span>
                <span>{card.interval_days}d interval</span>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-accent font-medium hover:underline">Review →</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteCard(card.id);
                  }}
                  className="p-1 text-text-muted hover:text-rose-500 transition-colors ml-1"
                  aria-label="Delete card"
                  title="Delete card"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Generate Panel Component
// ---------------------------------------------------------------------------

interface GeneratePanelProps {
  concepts: Concept[];
  onGenerate: (count: number, conceptId: string | null, topicHint: string | null) => void;
  generating: boolean;
  generateError: string | null;
  lastMessage: string | null;
}

const GeneratePanel: React.FC<GeneratePanelProps> = ({
  concepts,
  onGenerate,
  generating,
  generateError,
  lastMessage,
}) => {
  const [count, setCount] = useState(5);
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [topicHint, setTopicHint] = useState("");

  const handleGenerate = () => {
    onGenerate(count, selectedConceptId, topicHint.trim() || null);
  };

  return (
    <div className="rounded-2xl p-6 border border-border bg-surface shadow-sm mb-8">
      <div className="flex items-center gap-2 mb-5">
        <Sparkles className="w-5 h-5 text-accent" />
        <h3 className="font-semibold text-text-primary">Generate Grounded Flashcards</h3>
        <span className="text-xs text-text-muted ml-auto hidden sm:inline">
          Server-verified pgvector citations
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        {/* Count */}
        <div>
          <label className="text-xs font-medium text-text-secondary mb-2 block">
            Cards to generate (1–10)
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCount((c) => Math.max(1, c - 1))}
              className="w-8 h-8 rounded-lg bg-surface-muted border border-border text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center font-bold"
            >
              −
            </button>
            <span className="w-10 text-center text-text-primary font-semibold">{count}</span>
            <button
              onClick={() => setCount((c) => Math.min(10, c + 1))}
              className="w-8 h-8 rounded-lg bg-surface-muted border border-border text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center font-bold"
            >
              +
            </button>
          </div>
        </div>

        {/* Concept filter */}
        <div>
          <label className="text-xs font-medium text-text-secondary mb-2 block">
            Focus on concept (optional)
          </label>
          <select
            value={selectedConceptId || ""}
            onChange={(e) => setSelectedConceptId(e.target.value || null)}
            className="w-full h-10 bg-surface-muted border border-border rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
          >
            <option value="">All concepts</option>
            {concepts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Topic hint */}
        <div>
          <label className="text-xs font-medium text-text-secondary mb-2 block">
            Topic hint (optional)
          </label>
          <input
            type="text"
            value={topicHint}
            onChange={(e) => setTopicHint(e.target.value)}
            placeholder="e.g. supervised algorithms"
            maxLength={200}
            className="w-full h-10 bg-surface-muted border border-border rounded-xl px-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors"
          />
        </div>
      </div>

      {generateError && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-sm mb-4">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{generateError}</span>
        </div>
      )}

      {lastMessage && !generateError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-300 text-sm mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{lastMessage}</span>
        </div>
      )}

      <button
        id="generate-flashcards-btn"
        onClick={handleGenerate}
        disabled={generating}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover disabled:bg-surface-muted disabled:text-text-muted text-white font-semibold text-sm transition-all shadow-sm disabled:cursor-not-allowed"
      >
        {generating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating grounded cards…
          </>
        ) : (
          <>
            <Plus className="w-4 h-4" />
            Generate {count} card{count !== 1 ? "s" : ""}
          </>
        )}
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main FlashcardTab Component
// ---------------------------------------------------------------------------

export const FlashcardTab: React.FC<FlashcardTabProps> = ({
  projectId,
  concepts,
}) => {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [dueSummary, setDueSummary] = useState<DueFlashcardsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Spaced repetition study mode state
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [sessionCards, setSessionCards] = useState<Flashcard[]>([]);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    again: 0,
    difficult: 0,
    good: 0,
    easy: 0,
    total: 0,
  });

  // Filter & Generation
  const [deckFilter, setDeckFilter] = useState<DeckFilter>("all");
  const [selectedConceptFilter, setSelectedConceptFilter] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  // 1. Fetch Cards and Due Summary
  const fetchAll = useCallback(async () => {
    try {
      setLoadError(null);
      setLoadingSummary(true);
      const [cardsData, summaryData] = await Promise.all([
        listFlashcardsApi(projectId),
        getDueFlashcardsSummaryApi(projectId).catch(() => null),
      ]);
      setCards(cardsData);
      setDueSummary(summaryData);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load flashcards.");
    } finally {
      setLoading(false);
      setLoadingSummary(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // 2. Start Spaced Repetition Review Session
  const handleStartReviewSession = async (customCard?: Flashcard) => {
    try {
      let toStudy: Flashcard[] = [];
      if (customCard) {
        toStudy = [customCard];
      } else {
        toStudy = await getDueFlashcardsApi(projectId, 15, selectedConceptFilter || undefined);
      }

      if (toStudy.length === 0) return;

      setSessionCards(toStudy);
      setSessionIndex(0);
      setSessionStats({ again: 0, difficult: 0, good: 0, easy: 0, total: 0 });
      setSessionActive(true);
      setSessionCompleted(false);

      // Record session start activity
      recordFlashcardSessionApi(projectId, "flashcard_session_started", {
        deck_size: toStudy.length,
        concept_id: selectedConceptFilter,
      });
    } catch (err) {
      console.error("Failed to start study session:", err);
    }
  };

  // 3. Rate Current Card in Study Session
  const handleRateCard = async (rating: FlashcardRating) => {
    const card = sessionCards[sessionIndex];
    if (!card) return;

    try {
      setReviewLoading(true);
      // Double-click protection via client UUID
      const idempotencyKey = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      const response = await reviewFlashcardSpacedApi(
        projectId,
        card.id,
        rating,
        idempotencyKey
      );

      // Update card in master deck
      setCards((prev) =>
        prev.map((c) => (c.id === response.flashcard.id ? response.flashcard : c))
      );

      // Update session statistics
      const updatedStats = {
        ...sessionStats,
        [rating]: sessionStats[rating] + 1,
        total: sessionStats.total + 1,
      };
      setSessionStats(updatedStats);

      // Next card or complete
      if (sessionIndex + 1 < sessionCards.length) {
        setSessionIndex((i) => i + 1);
      } else {
        setSessionCompleted(true);
        setSessionActive(false);

        // Record session completion event
        recordFlashcardSessionApi(projectId, "flashcard_session_completed", {
          cards_reviewed: updatedStats.total,
          rating_breakdown: {
            again: updatedStats.again,
            difficult: updatedStats.difficult,
            good: updatedStats.good,
            easy: updatedStats.easy,
          },
        });

        // Refresh due summary
        getDueFlashcardsSummaryApi(projectId).then(setDueSummary).catch(() => {});
      }
    } catch (err) {
      console.error("Spaced review failed:", err);
    } finally {
      setReviewLoading(false);
    }
  };

  // 4. Generate Cards
  const handleGenerate = async (
    count: number,
    conceptId: string | null,
    topicHint: string | null
  ) => {
    try {
      setGenerating(true);
      setGenerateError(null);
      setLastMessage(null);
      const result = await generateFlashcardsApi(projectId, {
        count,
        concept_id: conceptId,
        topic_hint: topicHint,
      });
      setCards((prev) => [...result.flashcards, ...prev]);
      if (result.message) setLastMessage(result.message);
      // Update due summary
      getDueFlashcardsSummaryApi(projectId).then(setDueSummary).catch(() => {});
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : "Failed to generate flashcards."
      );
    } finally {
      setGenerating(false);
    }
  };

  // 5. Delete Card
  const handleDelete = async (cardId: string) => {
    const confirmed = window.confirm("Delete this flashcard?");
    if (!confirmed) return;
    try {
      await deleteFlashcardApi(projectId, cardId);
      setCards((prev) => prev.filter((c) => c.id !== cardId));
      getDueFlashcardsSummaryApi(projectId).then(setDueSummary).catch(() => {});
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  // Filtered Cards for Deck View
  const now = new Date();
  const filteredCards = cards.filter((c) => {
    if (deckFilter === "due") {
      return c.next_review_at && new Date(c.next_review_at) <= now;
    }
    if (deckFilter === "new") {
      return c.review_count === 0 || !c.next_review_at;
    }
    if (deckFilter === "known") {
      return c.known;
    }
    if (deckFilter === "difficult") {
      return c.difficult;
    }
    return true;
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
          <p className="text-slate-500 text-sm">Loading flashcards…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
          <p className="text-rose-300 font-medium mb-1">Failed to load flashcards</p>
          <p className="text-slate-500 text-sm mb-4">{loadError}</p>
          <button
            onClick={fetchAll}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm hover:text-white transition-colors mx-auto"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-1">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-accent" />
            Flashcards & Spaced Repetition
          </h2>
          <p className="text-sm text-text-muted mt-0.5">
            Grounded in your learning materials with SM-2 spaced scheduling
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchAll}
            className="h-9 w-9 flex items-center justify-center rounded-lg bg-surface border border-border text-text-muted hover:text-text-primary hover:bg-surface-muted transition-colors"
            title="Refresh flashcards"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Today's Review Dashboard Widget */}
      {!sessionActive && !sessionCompleted && (
        <TodayReviewWidget
          summary={dueSummary}
          onStartReview={() => handleStartReviewSession()}
          selectedConceptId={selectedConceptFilter}
          onSelectConcept={setSelectedConceptFilter}
          concepts={concepts}
          loadingSummary={loadingSummary}
        />
      )}

      {/* Active Spaced Repetition Study Session */}
      {sessionActive && (
        <StudySession
          cards={sessionCards}
          currentIndex={sessionIndex}
          onRate={handleRateCard}
          onExit={() => setSessionActive(false)}
          reviewLoading={reviewLoading}
          stats={sessionStats}
        />
      )}

      {/* Session Completed Banner */}
      {sessionCompleted && (
        <SessionComplete
          stats={sessionStats}
          onReviewMore={() => handleStartReviewSession()}
          onReturnToDeck={() => setSessionCompleted(false)}
          hasRemainingDue={(dueSummary?.due_count ?? 0) > 0}
        />
      )}

      {/* Generation Panel */}
      {!sessionActive && (
        <GeneratePanel
          concepts={concepts}
          onGenerate={handleGenerate}
          generating={generating}
          generateError={generateError}
          lastMessage={lastMessage}
        />
      )}

      {/* Deck View Controls & Filters */}
      {!sessionActive && cards.length > 0 && (
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-surface border border-border shadow-sm">
            {(
              [
                { id: "all", label: `All (${cards.length})` },
                { id: "due", label: `Due (${dueSummary?.due_count ?? 0})` },
                { id: "new", label: `New (${dueSummary?.new_count ?? 0})` },
                { id: "known", label: `Known (${cards.filter((c) => c.known).length})` },
                { id: "difficult", label: `Difficult (${cards.filter((c) => c.difficult).length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setDeckFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  deckFilter === tab.id
                    ? "bg-accent text-white shadow-sm"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <span className="text-xs text-text-muted">
            Showing {filteredCards.length} of {cards.length} card{cards.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Cards Grid */}
      {!sessionActive && filteredCards.length > 0 && (
        <CardGrid
          cards={filteredCards}
          onStudyCard={(card) => handleStartReviewSession(card)}
          onDeleteCard={handleDelete}
        />
      )}

      {/* Filter Empty State */}
      {!sessionActive && cards.length > 0 && filteredCards.length === 0 && (
        <div className="text-center py-16 rounded-2xl bg-surface border border-border shadow-sm">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <h4 className="text-base font-semibold text-text-primary mb-1">
            {deckFilter === "due"
              ? "You're all caught up!"
              : deckFilter === "new"
              ? "No new cards remaining."
              : deckFilter === "difficult"
              ? "No difficult cards!"
              : "No cards in this filter."}
          </h4>
          <p className="text-xs text-text-muted max-w-sm mx-auto">
            {deckFilter === "due"
              ? "All scheduled cards have been reviewed. Return later or generate more cards."
              : "Try switching filter tabs to view other flashcards."}
          </p>
        </div>
      )}

      {/* Absolute Empty State (No cards yet in project) */}
      {!sessionActive && cards.length === 0 && (
        <div className="text-center py-20">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{
              background:
                "linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(139,92,246,0.2) 100%)",
              border: "1px solid rgba(99,102,241,0.3)",
            }}
          >
            <BookOpen className="w-9 h-9 text-indigo-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">
            No flashcards available
          </h3>
          <p className="text-slate-500 text-sm max-w-sm mx-auto">
            Generate your first grounded flashcard deck from your uploaded learning materials above.
          </p>
        </div>
      )}
    </div>
  );
};
