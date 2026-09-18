import React, { useState, useEffect } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  Clock,
  Compass,
  FileText,
  HelpCircle,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import {
  getConceptMilestoneDetailApi,
  updateLearningPlanItemApi,
} from "@/lib/api";
import type {
  ConceptMilestoneDetail,
  LearningPlan,
  LearningPlanItemStatus,
} from "@/types";

interface LearningRoadmapProps {
  projectId: string;
  plan: LearningPlan | null;
  loading: boolean;
  onRefreshPlan: (forceReorder?: boolean) => Promise<void>;
  onNavigateTab?: (
    tab: "overview" | "materials" | "tutor" | "quiz" | "growth" | "analytics" | "flashcards"
  ) => void;
}

export const LearningRoadmap: React.FC<LearningRoadmapProps> = ({
  projectId,
  plan,
  loading,
  onRefreshPlan,
  onNavigateTab,
}) => {
  const [generating, setGenerating] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConceptMilestoneDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Fetch milestone detail when an item is selected
  useEffect(() => {
    if (!selectedItemId) {
      setDetail(null);
      return;
    }
    let isMounted = true;
    setDetailLoading(true);
    getConceptMilestoneDetailApi(projectId, selectedItemId)
      .then((data) => {
        if (isMounted) setDetail(data);
      })
      .catch((err) => {
        console.error("Failed to load milestone detail:", err);
      })
      .finally(() => {
        if (isMounted) setDetailLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [projectId, selectedItemId]);

  const handleGenerate = async (forceReorder = false) => {
    setGenerating(true);
    setActionMessage(null);
    try {
      await onRefreshPlan(forceReorder);
      setActionMessage(
        forceReorder
          ? "Learning roadmap re-sequenced by curriculum order."
          : "Learning plan generated successfully."
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate learning plan.";
      setActionMessage(msg);
    } finally {
      setGenerating(false);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleStatusChange = async (itemId: string, newStatus: LearningPlanItemStatus) => {
    setStatusUpdating(true);
    try {
      await updateLearningPlanItemApi(projectId, itemId, newStatus);
      await onRefreshPlan(false);
      if (selectedItemId === itemId) {
        const updatedDetail = await getConceptMilestoneDetailApi(projectId, itemId);
        setDetail(updatedDetail);
      }
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setStatusUpdating(false);
    }
  };

  const getStatusBadge = (status: LearningPlanItemStatus) => {
    switch (status) {
      case "completed":
        return {
          label: "Completed",
          bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
          dot: "bg-emerald-500",
          icon: CheckCircle2,
        };
      case "in_progress":
        return {
          label: "In Progress",
          bg: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
          dot: "bg-sky-500",
          icon: Clock,
        };
      case "needs_review":
        return {
          label: "Needs Review",
          bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
          dot: "bg-amber-500",
          icon: AlertCircle,
        };
      case "not_started":
      default:
        return {
          label: "Not Started",
          bg: "bg-surface-muted text-text-muted border border-border",
          dot: "bg-text-muted",
          icon: Compass,
        };
    }
  };

  // Loading state
  if (loading && !plan) {
    return (
      <div className="min-h-[300px] flex flex-col items-center justify-center gap-3 bg-surface rounded-2xl border border-border p-8">
        <Loader2 className="w-7 h-7 animate-spin text-accent" />
        <p className="text-xs text-text-muted font-medium">Loading learning roadmap...</p>
      </div>
    );
  }

  // Empty state: No Plan Generated Yet
  if (!plan) {
    return (
      <div className="p-8 rounded-2xl bg-surface border border-border shadow-sm text-center flex flex-col items-center justify-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shadow-inner">
          <Compass className="w-7 h-7" />
        </div>
        <div className="max-w-md">
          <h3 className="text-base font-bold text-text-primary tracking-tight">
            Personalized Learning Roadmap
          </h3>
          <p className="text-xs text-text-muted mt-1.5 leading-relaxed">
            Generate your personalized learning roadmap. We structure all extracted concepts in
            textbook curriculum order, assess mastery, and guide your next study milestone.
          </p>
        </div>

        {actionMessage && (
          <div className="text-xs text-accent bg-accent/10 border border-accent/20 px-3 py-1.5 rounded-lg">
            {actionMessage}
          </div>
        )}

        <button
          onClick={() => handleGenerate(false)}
          disabled={generating}
          className="mt-2 px-5 py-2.5 rounded-xl bg-accent hover:opacity-90 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-accent/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Building Roadmap...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Generate Learning Plan</span>
            </>
          )}
        </button>
      </div>
    );
  }

  const { progress, next_recommended_concept: nextConcept, items } = plan;

  return (
    <div className="space-y-6">
      {/* Action status message */}
      {actionMessage && (
        <div className="p-3 rounded-xl bg-accent/10 border border-accent/20 text-xs text-accent flex items-center justify-between animate-fadeIn">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-text-muted hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. Roadmap Hero & Progress Summary Card */}
      <div className="p-6 rounded-2xl bg-surface border border-border shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-accent/10 text-accent border border-accent/20">
                Active Roadmap
              </span>
              <span className="text-[11px] text-text-muted">
                Updated {new Date(plan.updated_at).toLocaleDateString()}
              </span>
            </div>
            <h2 className="text-lg font-bold text-text-primary tracking-tight mt-1.5">{plan.title}</h2>
            <p className="text-xs text-text-muted mt-0.5 max-w-xl">
              {plan.description || "Structured concept progression grounded in project materials."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleGenerate(false)}
              disabled={generating}
              title="Sync with latest mastery and newly added concepts"
              className="px-3.5 py-2 rounded-xl bg-surface hover:bg-surface-muted text-text-secondary text-xs font-semibold border border-border flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-accent ${generating ? "animate-spin" : ""}`} />
              <span>Refresh Statuses</span>
            </button>
            <button
              onClick={() => handleGenerate(true)}
              disabled={generating}
              title="Re-order all concepts based on textbook chapter order"
              className="px-3.5 py-2 rounded-xl bg-accent/10 hover:bg-accent/20 text-accent text-xs font-semibold border border-accent/30 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Layers className="w-3.5 h-3.5 text-accent" />
              <span>Re-sequence</span>
            </button>
          </div>
        </div>

        {/* Progress Bar & Breakdown Chips */}
        <div className="mt-5 pt-4 border-t border-border">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-text-muted font-medium">Curriculum Progress</span>
            <span className="text-text-primary font-bold font-mono">
              {progress.completed_count} / {progress.total_concepts} Concepts ({progress.progress_percentage}%)
            </span>
          </div>

          <div className="w-full h-3 rounded-full bg-surface-muted overflow-hidden flex border border-border">
            {progress.completed_count > 0 && (
              <div
                style={{ width: `${(progress.completed_count / progress.total_concepts) * 100}%` }}
                className="bg-emerald-500 transition-all duration-500"
                title={`Completed: ${progress.completed_count}`}
              />
            )}
            {progress.in_progress_count > 0 && (
              <div
                style={{ width: `${(progress.in_progress_count / progress.total_concepts) * 100}%` }}
                className="bg-sky-500 transition-all duration-500"
                title={`In Progress: ${progress.in_progress_count}`}
              />
            )}
            {progress.needs_review_count > 0 && (
              <div
                style={{ width: `${(progress.needs_review_count / progress.total_concepts) * 100}%` }}
                className="bg-amber-500 transition-all duration-500"
                title={`Needs Review: ${progress.needs_review_count}`}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-3 pt-1 text-[11px]">
            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Completed: {progress.completed_count}
            </span>
            <span className="inline-flex items-center gap-1.5 text-sky-600 dark:text-sky-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-sky-500" />
              In Progress: {progress.in_progress_count}
            </span>
            <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Needs Review: {progress.needs_review_count}
            </span>
            <span className="inline-flex items-center gap-1.5 text-text-muted font-medium">
              <span className="w-2 h-2 rounded-full bg-border" />
              Not Started: {progress.not_started_count}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Next Recommended Concept Spotlight Card */}
      {nextConcept ? (
        <div className="p-5 rounded-2xl bg-surface border border-accent/40 shadow-sm relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-accent text-white flex items-center gap-1">
                <Target className="w-3 h-3" />
                <span>Next Milestone</span>
              </span>
              <span className="text-xs text-text-muted font-mono">
                Milestone #{nextConcept.position + 1}
              </span>
            </div>
            <h3 className="text-base font-bold text-text-primary tracking-tight">
              {nextConcept.concept_name}
            </h3>
            <p className="text-xs text-text-secondary line-clamp-2">
              {nextConcept.concept_description}
            </p>
            <div className="text-[11px] text-text-muted pt-1 flex items-center gap-3">
              <span>
                Mastery:{" "}
                <strong className="text-text-primary">
                  {nextConcept.current_mastery !== null ? `${Math.round(nextConcept.current_mastery)}%` : "Not assessed"}
                </strong>
              </span>
              <span>•</span>
              <span className="capitalize text-accent font-medium">
                Action: {nextConcept.recommended_action || "Study Concept"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => onNavigateTab?.("tutor")}
              className="px-3.5 py-2 rounded-xl bg-accent hover:opacity-90 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-accent/20 transition-all hover:scale-[1.02]"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Study with AI Tutor</span>
            </button>
            <button
              onClick={() => onNavigateTab?.("quiz")}
              className="px-3.5 py-2 rounded-xl bg-surface hover:bg-surface-muted text-text-secondary text-xs font-semibold border border-border flex items-center gap-1.5 transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5 text-sky-500" />
              <span>Take Quiz</span>
            </button>
            <button
              onClick={() => setSelectedItemId(nextConcept.id)}
              className="px-3.5 py-2 rounded-xl bg-surface hover:bg-surface-muted text-text-muted hover:text-text-primary text-xs font-semibold border border-border flex items-center gap-1 transition-colors"
            >
              <span>Milestone Details</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" />
          <div>
            <strong className="font-semibold">Learning plan complete!</strong> You have achieved
            target mastery across all concepts in this roadmap.
          </div>
        </div>
      )}

      {/* 3. Step-by-Step Vertical Curriculum Timeline (Connected Line & Nodes) */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between pb-2 border-b border-border/60">
          <div>
            <h3 className="text-sm font-bold text-text-primary tracking-tight">Curriculum Timeline</h3>
            <p className="text-xs text-text-muted mt-0.5">
              Concepts sequenced in prerequisite textbook order.
            </p>
          </div>
          <span className="text-xs font-mono font-medium text-text-muted">
            {items.length} milestones
          </span>
        </div>

        <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:top-3 before:bottom-3 before:left-2.5 sm:before:left-3.5 before:w-0.5 before:bg-border">
          {items.map((item) => {
            const badge = getStatusBadge(item.status);
            const isSelected = selectedItemId === item.id;
            const isNext = nextConcept?.id === item.id;
            const isCompleted = item.status === "completed";

            return (
              <div
                key={item.id}
                onClick={() => setSelectedItemId(item.id)}
                className={`relative group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl transition-all cursor-pointer ${
                  isSelected
                    ? "bg-accent/10 shadow-xs ring-1 ring-accent/30"
                    : isNext
                    ? "bg-accent/5 hover:bg-accent/10 border-l-2 border-l-accent"
                    : "hover:bg-surface-muted/50"
                }`}
              >
                {/* Connected Timeline Node (● for completed, ○ for upcoming) */}
                <div
                  className={`absolute -left-6 sm:-left-8 top-4 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ring-4 ring-background transition-transform group-hover:scale-110 ${
                    isCompleted
                      ? "bg-emerald-500 text-white shadow-xs"
                      : isNext
                      ? "bg-accent text-white shadow-xs"
                      : item.status === "in_progress"
                      ? "bg-sky-500 text-white"
                      : item.status === "needs_review"
                      ? "bg-amber-500 text-white"
                      : "bg-surface border-2 border-border text-text-muted"
                  }`}
                >
                  {isCompleted ? "●" : isNext ? "●" : "○"}
                </div>

                {/* Concept info */}
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">
                      {item.position + 1}. {item.concept_name}
                    </span>
                    {isNext && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase bg-accent/20 text-accent border border-accent/30">
                        Next Up
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-text-muted line-clamp-1 mt-0.5">
                    {item.concept_description}
                  </p>
                </div>

                {/* Right metrics & status badge */}
                <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                  <div className="text-right hidden sm:block">
                    <div className="text-xs font-mono font-bold text-text-primary">
                      {item.current_mastery !== null ? `${Math.round(item.current_mastery)}%` : "—"}
                    </div>
                    <div className="text-[10px] text-text-muted">
                      Target: {Math.round(item.target_mastery)}%
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border flex items-center gap-1.5 ${badge.bg}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                    <span>{badge.label}</span>
                  </span>

                  <ArrowRight className="w-3.5 h-3.5 text-text-muted group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Concept Detail Modal / Slide-in Drawer */}
      {selectedItemId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-xl rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-accent/10 text-accent">
                  <BookOpen className="w-4 h-4" />
                </span>
                <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
                  Concept Milestone Details
                </span>
              </div>
              <button
                onClick={() => setSelectedItemId(null)}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-5 overflow-y-auto">
              {detailLoading ? (
                <div className="min-h-[200px] flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-accent" />
                  <span className="text-xs text-text-muted">Loading diagnostic details...</span>
                </div>
              ) : detail ? (
                <>
                  <div>
                    <h3 className="text-lg font-bold text-text-primary tracking-tight">
                      {detail.concept_name}
                    </h3>
                    <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
                      {detail.concept_description}
                    </p>
                  </div>

                  {/* Roadmap Status Adjuster */}
                  <div className="p-3.5 rounded-xl bg-surface-muted/50 border border-border flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-text-primary">Roadmap Milestone Status</div>
                      <div className="text-[10px] text-text-muted mt-0.5">
                        Roadmap progress tracking. Mastery is earned via quizzes.
                      </div>
                    </div>
                    <select
                      value={detail.roadmap_status}
                      disabled={statusUpdating}
                      onChange={(e) =>
                        handleStatusChange(selectedItemId, e.target.value as LearningPlanItemStatus)
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-surface border border-border text-xs font-semibold text-text-primary focus:outline-none focus:border-accent"
                    >
                      <option value="not_started">Not Started</option>
                      <option value="in_progress">In Progress</option>
                      <option value="needs_review">Needs Review</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>

                  {/* Diagnostic Metrics Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-surface-muted/40 border border-border">
                      <div className="text-[11px] text-text-muted">Current Mastery</div>
                      <div className="text-lg font-bold text-text-primary font-mono mt-1">
                        {detail.mastery_score !== null ? `${Math.round(detail.mastery_score)}%` : "Not assessed"}
                      </div>
                      <div className="text-[10px] text-text-muted mt-0.5">
                        {detail.evidence_count} evidence events • {Math.round(detail.confidence * 100)}% confidence
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-surface-muted/40 border border-border">
                      <div className="text-[11px] text-text-muted">Study Materials</div>
                      <div className="text-sm font-semibold text-text-primary truncate mt-1">
                        {detail.source_material_title || "Processed Document"}
                      </div>
                      <div className="text-[10px] text-text-muted mt-0.5">
                        {detail.source_page ? `First introduced on Page ${detail.source_page}` : "Extracted from materials"}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-surface-muted/40 border border-border">
                      <div className="text-[11px] text-text-muted">Flashcards</div>
                      <div className="text-sm font-semibold text-text-primary mt-1">
                        {detail.flashcard_count} Cards
                      </div>
                      <div className="text-[10px] text-text-muted mt-0.5">
                        {detail.due_flashcards_count} Due for review
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-surface-muted/40 border border-border">
                      <div className="text-[11px] text-text-muted">Quiz Coverage</div>
                      <div className="text-sm font-semibold text-text-primary mt-1">
                        {detail.quiz_question_count} Questions
                      </div>
                      <div className="text-[10px] text-text-muted mt-0.5">Assessed in practice quizzes</div>
                    </div>
                  </div>

                  {/* Recommendation Insight if present */}
                  {detail.active_recommendation && (
                    <div className="p-3.5 rounded-xl bg-accent/10 border border-accent/20 text-xs">
                      <div className="font-semibold text-accent flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Study Recommendation</span>
                      </div>
                      <p className="text-text-secondary mt-1 leading-relaxed">
                        {detail.active_recommendation}
                      </p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="pt-2 border-t border-border space-y-2">
                    <div className="text-xs font-semibold text-text-muted">Recommended Next Steps:</div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          setSelectedItemId(null);
                          onNavigateTab?.("tutor");
                        }}
                        className="px-3.5 py-2 rounded-xl bg-accent hover:opacity-90 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-accent/20 transition-all hover:scale-[1.02]"
                      >
                        <Bot className="w-3.5 h-3.5" />
                        <span>Study with AI Tutor</span>
                      </button>
                      <button
                        onClick={() => {
                          setSelectedItemId(null);
                          onNavigateTab?.("quiz");
                        }}
                        className="px-3.5 py-2 rounded-xl bg-surface hover:bg-surface-muted text-text-secondary text-xs font-semibold border border-border flex items-center gap-1.5 transition-colors"
                      >
                        <HelpCircle className="w-3.5 h-3.5 text-sky-500" />
                        <span>Take Adaptive Quiz</span>
                      </button>
                      <button
                        onClick={() => {
                          setSelectedItemId(null);
                          onNavigateTab?.("flashcards");
                        }}
                        className="px-3.5 py-2 rounded-xl bg-surface hover:bg-surface-muted text-text-secondary text-xs font-semibold border border-border flex items-center gap-1.5 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5 text-accent" />
                        <span>Review Flashcards</span>
                      </button>
                      <button
                        onClick={() => {
                          setSelectedItemId(null);
                          onNavigateTab?.("materials");
                        }}
                        className="px-3.5 py-2 rounded-xl bg-surface hover:bg-surface-muted text-text-muted hover:text-text-primary text-xs font-semibold border border-border flex items-center gap-1.5 transition-colors"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Read Material</span>
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-6 text-xs text-text-muted">
                  Concept milestone information not found.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
