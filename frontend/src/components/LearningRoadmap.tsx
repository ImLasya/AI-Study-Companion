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
          bg: "bg-emerald-950/40 text-emerald-300 border-emerald-800/40",
          dot: "bg-emerald-400",
          icon: CheckCircle2,
        };
      case "in_progress":
        return {
          label: "In Progress",
          bg: "bg-sky-950/40 text-sky-300 border-sky-800/40",
          dot: "bg-sky-400",
          icon: Clock,
        };
      case "needs_review":
        return {
          label: "Needs Review",
          bg: "bg-amber-950/40 text-amber-300 border-amber-800/40",
          dot: "bg-amber-400",
          icon: AlertCircle,
        };
      case "not_started":
      default:
        return {
          label: "Not Started",
          bg: "bg-gray-800/60 text-gray-400 border-gray-700/60",
          dot: "bg-gray-500",
          icon: Compass,
        };
    }
  };

  // Loading state
  if (loading && !plan) {
    return (
      <div className="min-h-[300px] flex flex-col items-center justify-center gap-3 bg-[#0d1222]/60 rounded-2xl border border-gray-800/60 p-8">
        <Loader2 className="w-7 h-7 animate-spin text-indigo-500" />
        <p className="text-xs text-gray-400 font-medium">Loading learning roadmap...</p>
      </div>
    );
  }

  // Empty state: No Plan Generated Yet
  if (!plan) {
    return (
      <div className="p-8 rounded-2xl bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#1e1b4b]/40 border border-indigo-900/40 shadow-xl text-center flex flex-col items-center justify-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
          <Compass className="w-7 h-7" />
        </div>
        <div className="max-w-md">
          <h3 className="text-base font-bold text-white tracking-tight">
            Personalized Learning Roadmap
          </h3>
          <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
            Generate your personalized learning roadmap. We structure all extracted concepts in
            textbook curriculum order, assess mastery, and guide your next study milestone.
          </p>
        </div>

        {actionMessage && (
          <div className="text-xs text-indigo-300 bg-indigo-950/60 border border-indigo-800 px-3 py-1.5 rounded-lg">
            {actionMessage}
          </div>
        )}

        <button
          onClick={() => handleGenerate(false)}
          disabled={generating}
          className="mt-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
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
        <div className="p-3 rounded-xl bg-indigo-950/60 border border-indigo-800/60 text-xs text-indigo-200 flex items-center justify-between animate-fadeIn">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. Roadmap Hero & Progress Summary Card */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-[#0d1222] via-[#0f172a] to-[#1e1b4b]/30 border border-indigo-900/30 shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Active Roadmap
              </span>
              <span className="text-[11px] text-gray-400">
                Updated {new Date(plan.updated_at).toLocaleDateString()}
              </span>
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight mt-1.5">{plan.title}</h2>
            <p className="text-xs text-gray-400 mt-0.5 max-w-xl">
              {plan.description || "Structured concept progression grounded in project materials."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleGenerate(false)}
              disabled={generating}
              title="Sync with latest mastery and newly added concepts"
              className="px-3.5 py-2 rounded-xl bg-gray-900/80 hover:bg-gray-800 text-gray-200 text-xs font-semibold border border-gray-700/60 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${generating ? "animate-spin" : ""}`} />
              <span>Refresh Statuses</span>
            </button>
            <button
              onClick={() => handleGenerate(true)}
              disabled={generating}
              title="Re-order all concepts based on textbook chapter order"
              className="px-3.5 py-2 rounded-xl bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-200 text-xs font-semibold border border-indigo-800/60 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>Re-sequence</span>
            </button>
          </div>
        </div>

        {/* Progress Bar & Breakdown Chips */}
        <div className="mt-5 pt-4 border-t border-gray-800/60">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-gray-400 font-medium">Curriculum Progress</span>
            <span className="text-white font-bold font-mono">
              {progress.completed_count} / {progress.total_concepts} Concepts ({progress.progress_percentage}%)
            </span>
          </div>

          <div className="w-full h-3 rounded-full bg-gray-900 overflow-hidden flex border border-gray-800">
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
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Completed: {progress.completed_count}
            </span>
            <span className="inline-flex items-center gap-1.5 text-sky-400">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              In Progress: {progress.in_progress_count}
            </span>
            <span className="inline-flex items-center gap-1.5 text-amber-400">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Needs Review: {progress.needs_review_count}
            </span>
            <span className="inline-flex items-center gap-1.5 text-gray-400">
              <span className="w-2 h-2 rounded-full bg-gray-500" />
              Not Started: {progress.not_started_count}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Next Recommended Concept Spotlight Card */}
      {nextConcept ? (
        <div className="p-5 rounded-2xl bg-[#0f172a] border border-indigo-500/40 shadow-md relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-600 text-white flex items-center gap-1">
                <Target className="w-3 h-3" />
                <span>Next Milestone</span>
              </span>
              <span className="text-xs text-gray-400 font-mono">
                Milestone #{nextConcept.position + 1}
              </span>
            </div>
            <h3 className="text-base font-bold text-white tracking-tight">
              {nextConcept.concept_name}
            </h3>
            <p className="text-xs text-gray-300 line-clamp-2">
              {nextConcept.concept_description}
            </p>
            <div className="text-[11px] text-gray-400 pt-1 flex items-center gap-3">
              <span>
                Mastery:{" "}
                <strong className="text-white">
                  {nextConcept.current_mastery !== null ? `${Math.round(nextConcept.current_mastery)}%` : "Not assessed"}
                </strong>
              </span>
              <span>•</span>
              <span className="capitalize text-indigo-300">
                Action: {nextConcept.recommended_action || "Study Concept"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => onNavigateTab?.("tutor")}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition-all hover:scale-[1.02]"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Study with AI Tutor</span>
            </button>
            <button
              onClick={() => onNavigateTab?.("quiz")}
              className="px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold border border-gray-700 flex items-center gap-1.5 transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5 text-sky-400" />
              <span>Take Quiz</span>
            </button>
            <button
              onClick={() => setSelectedItemId(nextConcept.id)}
              className="px-3 py-2 rounded-xl bg-gray-900/60 hover:bg-gray-800 text-gray-400 hover:text-white text-xs font-semibold border border-gray-800 flex items-center gap-1 transition-colors"
            >
              <span>Milestone Details</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 text-xs flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
          <div>
            <strong className="font-semibold">Learning plan complete!</strong> You have achieved
            target mastery across all concepts in this roadmap.
          </div>
        </div>
      )}

      {/* 3. Step-by-Step Interactive Roadmap Timeline */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white tracking-tight">Curriculum Roadmap</h3>
          <span className="text-xs text-gray-500">
            {items.length} concepts in textbook sequence
          </span>
        </div>

        <div className="space-y-2 relative before:absolute before:top-4 before:bottom-4 before:left-6 before:w-0.5 before:bg-gray-800/60">
          {items.map((item) => {
            const badge = getStatusBadge(item.status);
            const Icon = badge.icon;
            const isSelected = selectedItemId === item.id;
            const isNext = nextConcept?.id === item.id;

            return (
              <div
                key={item.id}
                onClick={() => setSelectedItemId(item.id)}
                className={`relative flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? "bg-indigo-950/40 border-indigo-500 shadow-md"
                    : isNext
                    ? "bg-[#0d1222] border-indigo-900/60 hover:border-indigo-700/60"
                    : "bg-[#0d1222]/80 hover:bg-[#0d1222] border-gray-800/60 hover:border-gray-700/80"
                }`}
              >
                <div className="flex items-center gap-3.5 z-10">
                  {/* Position Badge with Icon */}
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold font-mono transition-transform ${
                      item.status === "completed"
                        ? "bg-emerald-950 border border-emerald-700/60 text-emerald-400"
                        : item.status === "in_progress"
                        ? "bg-sky-950 border border-sky-700/60 text-sky-400"
                        : item.status === "needs_review"
                        ? "bg-amber-950 border border-amber-700/60 text-amber-400"
                        : "bg-gray-900 border border-gray-800 text-gray-400"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>

                  {/* Concept info */}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white group-hover:text-indigo-300 transition-colors">
                        {item.position + 1}. {item.concept_name}
                      </span>
                      {isNext && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-indigo-600/30 text-indigo-300 border border-indigo-500/30">
                          Next
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 line-clamp-1 max-w-lg mt-0.5">
                      {item.concept_description}
                    </p>
                  </div>
                </div>

                {/* Right metrics & status badge */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right hidden sm:block">
                    <div className="text-xs font-semibold text-white">
                      {item.current_mastery !== null ? `${Math.round(item.current_mastery)}%` : "Not assessed"}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      Target: {Math.round(item.target_mastery)}%
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border flex items-center gap-1.5 ${badge.bg}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                    <span>{badge.label}</span>
                  </span>

                  <ArrowRight className="w-4 h-4 text-gray-500" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Concept Detail Modal / Slide-in Drawer */}
      {selectedItemId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-xl rounded-2xl bg-[#0f172a] border border-gray-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-indigo-600/20 text-indigo-400">
                  <BookOpen className="w-4 h-4" />
                </span>
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Concept Milestone Details
                </span>
              </div>
              <button
                onClick={() => setSelectedItemId(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-5 overflow-y-auto">
              {detailLoading ? (
                <div className="min-h-[200px] flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                  <span className="text-xs text-gray-400">Loading diagnostic details...</span>
                </div>
              ) : detail ? (
                <>
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight">
                      {detail.concept_name}
                    </h3>
                    <p className="text-xs text-gray-300 mt-1.5 leading-relaxed">
                      {detail.concept_description}
                    </p>
                  </div>

                  {/* Roadmap Status Adjuster */}
                  <div className="p-3.5 rounded-xl bg-gray-900/60 border border-gray-800 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-white">Roadmap Milestone Status</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        Roadmap progress tracking. Mastery is earned via quizzes.
                      </div>
                    </div>
                    <select
                      value={detail.roadmap_status}
                      disabled={statusUpdating}
                      onChange={(e) =>
                        handleStatusChange(selectedItemId, e.target.value as LearningPlanItemStatus)
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs font-semibold text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="not_started">Not Started</option>
                      <option value="in_progress">In Progress</option>
                      <option value="needs_review">Needs Review</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>

                  {/* Diagnostic Metrics Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-gray-900/40 border border-gray-800/80">
                      <div className="text-[11px] text-gray-400">Current Mastery</div>
                      <div className="text-lg font-bold text-white font-mono mt-1">
                        {detail.mastery_score !== null ? `${Math.round(detail.mastery_score)}%` : "Not assessed"}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {detail.evidence_count} evidence events • {Math.round(detail.confidence * 100)}% confidence
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-gray-900/40 border border-gray-800/80">
                      <div className="text-[11px] text-gray-400">Study Materials</div>
                      <div className="text-sm font-semibold text-white truncate mt-1">
                        {detail.source_material_title || "Processed Document"}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {detail.source_page ? `First introduced on Page ${detail.source_page}` : "Extracted from materials"}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-gray-900/40 border border-gray-800/80">
                      <div className="text-[11px] text-gray-400">Flashcards</div>
                      <div className="text-sm font-semibold text-white mt-1">
                        {detail.flashcard_count} Cards
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {detail.due_flashcards_count} Due for review
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-gray-900/40 border border-gray-800/80">
                      <div className="text-[11px] text-gray-400">Quiz Coverage</div>
                      <div className="text-sm font-semibold text-white mt-1">
                        {detail.quiz_question_count} Questions
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">Assessed in practice quizzes</div>
                    </div>
                  </div>

                  {/* Recommendation Insight if present */}
                  {detail.active_recommendation && (
                    <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-800/40 text-xs">
                      <div className="font-semibold text-indigo-300 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Study Recommendation</span>
                      </div>
                      <p className="text-gray-300 mt-1 leading-relaxed">
                        {detail.active_recommendation}
                      </p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="pt-2 border-t border-gray-800 space-y-2">
                    <div className="text-xs font-semibold text-gray-400">Recommended Next Steps:</div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          setSelectedItemId(null);
                          onNavigateTab?.("tutor");
                        }}
                        className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition-all hover:scale-[1.02]"
                      >
                        <Bot className="w-3.5 h-3.5" />
                        <span>Study with AI Tutor</span>
                      </button>
                      <button
                        onClick={() => {
                          setSelectedItemId(null);
                          onNavigateTab?.("quiz");
                        }}
                        className="px-3.5 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold border border-gray-700 flex items-center gap-1.5 transition-colors"
                      >
                        <HelpCircle className="w-3.5 h-3.5 text-sky-400" />
                        <span>Take Adaptive Quiz</span>
                      </button>
                      <button
                        onClick={() => {
                          setSelectedItemId(null);
                          onNavigateTab?.("flashcards");
                        }}
                        className="px-3.5 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold border border-gray-700 flex items-center gap-1.5 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Review Flashcards</span>
                      </button>
                      <button
                        onClick={() => {
                          setSelectedItemId(null);
                          onNavigateTab?.("materials");
                        }}
                        className="px-3.5 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white text-xs font-semibold border border-gray-800 flex items-center gap-1.5 transition-colors"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Read Material</span>
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-6 text-xs text-gray-500">
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
