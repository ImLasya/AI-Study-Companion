/**
 * QuizTab — Adaptive Quiz & Intelligent Learning Assessment Workspace
 *
 * Features:
 * - Adaptive Quiz Hero with focal title and compact supporting statistics
 * - Clean horizontal concept coverage section with soft tinted chips
 * - Spacious 2-column quiz library grid with comfortable 24px padding and semantic identities
 * - Focused, distraction-free quiz taking attempt screen with spacious interactive option rows
 * - Distinct highlighted learning explanation area with concept references
 * - Rewarding quiz result screen with concept-level accuracy breakdown and quick action paths
 */

import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  Brain,
  CheckCircle2,
  Layers,
  Lightbulb,
  ListChecks,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Target,
  Trophy,
  XCircle,
} from "lucide-react";
import {
  completeQuizAttemptApi,
  createQuizApi,
  extractProjectConceptsApi,
  getProjectConceptsApi,
  getProjectMasteryApi,
  getProjectQuizzesApi,
  getQuizApi,
  getRecentActivityApi,
  startQuizAttemptApi,
  submitQuizAnswerApi,
} from "@/lib/api";
import type {
  Concept,
  Quiz,
  QuizAnswer,
  QuizAttempt,
  QuizQuestionPublic,
  QuizResult,
  RecentActivityItem,
} from "@/types";

interface QuizTabProps {
  projectId: string;
  projectMastery?: number | null;
  onNavigateTab?: (
    tab: "overview" | "materials" | "tutor" | "quiz" | "growth" | "analytics" | "flashcards"
  ) => void;
}

type TabMode = "list" | "active" | "result";

export const QuizTab: React.FC<QuizTabProps> = ({
  projectId,
  projectMastery,
  onNavigateTab,
}) => {
  // Data State
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [masteryScore, setMasteryScore] = useState<number | null>(null);
  const [recentScore, setRecentScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Concept Extraction State
  const [extractingConcepts, setExtractingConcepts] = useState(false);

  // Quiz Generation State
  const [creatingQuiz, setCreatingQuiz] = useState(false);
  const [quizTitle, setQuizTitle] = useState("Adaptive Quiz");
  const [questionCount, setQuestionCount] = useState(5);
  const [preferredDifficulty, setPreferredDifficulty] = useState<string>("adaptive");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Active Quiz State
  const [mode, setMode] = useState<TabMode>("list");
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [activeAttempt, setActiveAttempt] = useState<QuizAttempt | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // Current Question Answer State
  const [selectedMcqOption, setSelectedMcqOption] = useState<string>("");
  const [openEndedAnswer, setOpenEndedAnswer] = useState<string>("");
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [submittedAnswer, setSubmittedAnswer] = useState<QuizAnswer | null>(null);

  // Completed Result State
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);

  // -------------------------------------------------------------------------
  // Initial Data Load
  // -------------------------------------------------------------------------
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [conceptsData, quizzesData, masteryData, activityData] = await Promise.all([
        getProjectConceptsApi(projectId).catch(() => []),
        getProjectQuizzesApi(projectId).catch(() => []),
        getProjectMasteryApi(projectId).catch(() => null),
        getRecentActivityApi({ projectId, limit: 15 }).catch(() => []),
      ]);

      setConcepts(conceptsData);
      setQuizzes(quizzesData);

      // Derive Mastery Score
      if (
        masteryData?.overall_average_mastery !== null &&
        masteryData?.overall_average_mastery !== undefined
      ) {
        setMasteryScore(Math.round(masteryData.overall_average_mastery));
      } else if (projectMastery !== undefined && projectMastery !== null) {
        setMasteryScore(Math.round(projectMastery * 100));
      }

      // Derive Most Recent Quiz Score from activity telemetry
      if (activityData && activityData.length > 0) {
        const quizEvent = activityData.find(
          (a: RecentActivityItem) => a.event_type === "quiz_completed"
        );
        if (quizEvent?.detail) {
          const match = quizEvent.detail.match(/Score:\s*(\d+)%/i);
          if (match) {
            setRecentScore(Number(match[1]));
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load quizzes";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      loadData();
    }
  }, [projectId]);

  // -------------------------------------------------------------------------
  // Concept Extraction
  // -------------------------------------------------------------------------
  const handleExtractConcepts = async () => {
    try {
      setExtractingConcepts(true);
      setError(null);
      const updated = await extractProjectConceptsApi(projectId);
      setConcepts(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to extract concepts";
      setError(msg);
    } finally {
      setExtractingConcepts(false);
    }
  };

  // -------------------------------------------------------------------------
  // Quiz Generation
  // -------------------------------------------------------------------------
  const handleCreateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreatingQuiz(true);
      setError(null);
      const newQuiz = await createQuizApi(
        projectId,
        quizTitle,
        questionCount,
        preferredDifficulty
      );
      setQuizzes([newQuiz, ...quizzes]);
      setShowCreateModal(false);
      // Automatically launch the newly created quiz
      await startQuiz(newQuiz.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate quiz";
      setError(msg);
    } finally {
      setCreatingQuiz(false);
    }
  };

  // -------------------------------------------------------------------------
  // Start Quiz Attempt
  // -------------------------------------------------------------------------
  const startQuiz = async (quizId: string) => {
    try {
      setLoading(true);
      setError(null);
      const [quizDetails, attempt] = await Promise.all([
        getQuizApi(projectId, quizId),
        startQuizAttemptApi(projectId, quizId),
      ]);
      setActiveQuiz(quizDetails);
      setActiveAttempt(attempt);
      setCurrentQuestionIndex(0);
      setSelectedMcqOption("");
      setOpenEndedAnswer("");
      setSubmittedAnswer(null);
      setQuizResult(null);
      setMode("active");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start quiz attempt";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Submit Question Answer
  // -------------------------------------------------------------------------
  const handleSubmitAnswer = async () => {
    if (!activeQuiz || !activeAttempt) return;
    const currentQuestion = activeQuiz.questions[currentQuestionIndex];
    if (!currentQuestion) return;

    try {
      setSubmittingAnswer(true);
      setError(null);

      const payload: { selected_answer?: string; answer_text?: string } = {};
      if (currentQuestion.question_type === "mcq") {
        if (!selectedMcqOption) {
          setError("Please select an option first.");
          return;
        }
        payload.selected_answer = selectedMcqOption;
      } else {
        if (!openEndedAnswer.trim()) {
          setError("Please write your answer response.");
          return;
        }
        payload.answer_text = openEndedAnswer.trim();
      }

      const answerRecord = await submitQuizAnswerApi(
        projectId,
        activeQuiz.id,
        activeAttempt.id,
        currentQuestion.id,
        payload
      );
      setSubmittedAnswer(answerRecord);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit answer";
      setError(msg);
    } finally {
      setSubmittingAnswer(false);
    }
  };

  // -------------------------------------------------------------------------
  // Navigate to Next Question or Complete Quiz
  // -------------------------------------------------------------------------
  const handleNextQuestion = async () => {
    if (!activeQuiz || !activeAttempt) return;

    if (currentQuestionIndex + 1 < activeQuiz.questions.length) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedMcqOption("");
      setOpenEndedAnswer("");
      setSubmittedAnswer(null);
    } else {
      // Last question reached: complete quiz
      try {
        setLoading(true);
        const result = await completeQuizAttemptApi(
          projectId,
          activeQuiz.id,
          activeAttempt.id
        );
        setQuizResult(result);
        setMode("result");
        // Refresh quizzes and mastery list in background
        getProjectQuizzesApi(projectId).then(setQuizzes).catch(() => {});
        getProjectMasteryApi(projectId)
          .then((m) => {
            if (m?.overall_average_mastery !== null && m?.overall_average_mastery !== undefined) {
              setMasteryScore(Math.round(m.overall_average_mastery));
            }
          })
          .catch(() => {});
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to finalize quiz attempt";
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
  };

  // Helper: Semantic Quiz Identity
  const getQuizTypeInfo = (title: string) => {
    const lower = title.toLowerCase();
    if (lower.includes("quality") || lower.includes("verification")) {
      return {
        type: "Quality Verification Quiz",
        Icon: CheckCircle2,
        accentColor: "text-sky-500 dark:text-sky-400",
        bgColor: "bg-sky-500/10",
        borderColor: "border-sky-500/20",
        tag: "Verification",
        desc: "Calibrated assessment verifying concept retention and evaluating retrieval grounding.",
      };
    }
    if (lower.includes("mastery") || lower.includes("diagnostic")) {
      return {
        type: "Mastery Diagnostic",
        Icon: Target,
        accentColor: "text-emerald-500 dark:text-emerald-400",
        bgColor: "bg-emerald-500/10",
        borderColor: "border-emerald-500/20",
        tag: "Diagnostic",
        desc: "Diagnostic evaluation measuring depth of understanding across extracted concepts.",
      };
    }
    return {
      type: "Adaptive Quiz",
      Icon: Sparkles,
      accentColor: "text-accent",
      bgColor: "bg-accent/10",
      borderColor: "border-accent/20",
      tag: "Adaptive",
      desc: "Personalized questions based on your current learning state and mastery gaps.",
    };
  };

  // -------------------------------------------------------------------------
  // RENDER: Loading State
  // -------------------------------------------------------------------------
  if (loading && mode === "list" && quizzes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-text-muted">
        <Loader2 className="w-8 h-8 animate-spin text-accent mb-3" />
        <p className="text-xs sm:text-sm font-medium">Loading your adaptive assessment workspace...</p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: Active Quiz View (Focused Taking Experience)
  // -------------------------------------------------------------------------
  if (mode === "active" && activeQuiz) {
    const currentQ: QuizQuestionPublic | undefined = activeQuiz.questions[currentQuestionIndex];
    const totalQ = activeQuiz.questions.length;
    const progressPct = Math.round(((currentQuestionIndex + 1) / totalQ) * 100);

    return (
      <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-300 py-4">
        {/* Navigation & Progress Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/70">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMode("list")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/70 bg-surface text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-muted transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Exit Quiz</span>
            </button>
            <div className="w-px h-4 bg-border/60" />
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="text-sm font-bold text-text-primary tracking-tight">
                {activeQuiz.title || "Adaptive Quiz"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
            <span className="text-xs font-mono font-medium text-text-muted">
              Question {currentQuestionIndex + 1} of {totalQ}
            </span>
            <div className="w-28 sm:w-40 h-2 bg-surface-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300 rounded-full"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs font-mono font-bold text-accent">{progressPct}%</span>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-300 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {currentQ && (
          <div className="space-y-8 py-2">
            {/* Meta Badges */}
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-accent/10 text-accent border border-accent/20">
                <BookOpen className="w-3.5 h-3.5" />
                {currentQ.concept_name || "Core Concept"}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono uppercase tracking-wider font-semibold ${
                  currentQ.difficulty === "easy"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20"
                    : currentQ.difficulty === "hard"
                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-300 border border-rose-500/20"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/20"
                }`}
              >
                <Target className="w-3 h-3" />
                {currentQ.difficulty}
              </span>
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-mono text-text-muted bg-surface-muted border border-border/60">
                {currentQ.question_type === "mcq" ? "Multiple Choice" : "Open-Ended"}
              </span>
            </div>

            {/* Large Focused Question Typography */}
            <div className="max-w-2xl mx-auto text-center sm:text-left py-2">
              <span className="text-xs font-mono uppercase tracking-wider font-semibold text-text-muted block mb-2">
                Question {currentQuestionIndex + 1}
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-text-primary leading-relaxed tracking-tight">
                {currentQ.question_text}
              </h2>
            </div>

            {/* MCQ Interactive Option Rows */}
            {currentQ.question_type === "mcq" && (
              <div className="grid gap-3.5 max-w-2xl mx-auto pt-1">
                {currentQ.options.map((option, idx) => {
                  const isSelected = selectedMcqOption === option;
                  const isSubmitted = Boolean(submittedAnswer);
                  const isCorrectAnswer =
                    submittedAnswer &&
                    option.trim().toLowerCase() === submittedAnswer.correct_answer.trim().toLowerCase();
                  const isUserWrongChoice = isSubmitted && isSelected && !submittedAnswer?.is_correct;

                  let rowStyle =
                    "bg-surface-muted/40 hover:bg-surface-muted/80 border-border/70 hover:border-accent/40 text-text-primary";

                  if (isSubmitted) {
                    if (isCorrectAnswer) {
                      rowStyle =
                        "bg-emerald-500/15 border-emerald-500/70 text-emerald-800 dark:text-emerald-200 font-medium";
                    } else if (isUserWrongChoice) {
                      rowStyle =
                        "bg-rose-500/15 border-rose-500/70 text-rose-800 dark:text-rose-200 font-medium";
                    } else {
                      rowStyle = "bg-surface-muted/20 border-border/30 text-text-muted opacity-40";
                    }
                  } else if (isSelected) {
                    rowStyle =
                      "bg-accent-soft/40 border-accent text-accent font-semibold ring-1 ring-accent/30 shadow-sm";
                  }

                  return (
                    <button
                      key={idx}
                      disabled={isSubmitted}
                      onClick={() => setSelectedMcqOption(option)}
                      className={`w-full text-left p-4 sm:p-5 rounded-2xl border transition-all duration-200 flex items-start gap-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent ${rowStyle}`}
                    >
                      <span className="flex-shrink-0 w-7 h-7 rounded-xl bg-surface border border-border/80 flex items-center justify-center text-xs font-bold text-text-primary shadow-2xs">
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span className="text-sm sm:text-base pt-0.5 leading-relaxed flex-1">
                        {option}
                      </span>
                      {isSubmitted && isCorrectAnswer && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                      )}
                      {isSubmitted && isUserWrongChoice && (
                        <XCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Open-Ended Textarea */}
            {currentQ.question_type === "open_ended" && (
              <div className="space-y-3 max-w-2xl mx-auto pt-1">
                <textarea
                  rows={5}
                  disabled={Boolean(submittedAnswer)}
                  value={openEndedAnswer}
                  onChange={(e) => setOpenEndedAnswer(e.target.value)}
                  placeholder="Explain your understanding thoroughly with supporting concepts..."
                  className="w-full rounded-2xl border border-border bg-surface-muted/50 p-4 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent transition-all resize-y"
                />
                <div className="text-right text-xs text-text-muted">
                  {openEndedAnswer.length} characters
                </div>
              </div>
            )}

            {/* Distinct Highlighted Learning Explanation Area */}
            {submittedAnswer && (
              <div
                className={`max-w-2xl mx-auto p-5 rounded-2xl border-l-4 space-y-3 animate-in fade-in duration-300 ${
                  submittedAnswer.is_correct
                    ? "bg-emerald-500/10 border-l-emerald-500 text-emerald-900 dark:text-emerald-100"
                    : "bg-rose-500/10 border-l-rose-500 text-rose-900 dark:text-rose-100"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    {submittedAnswer.is_correct ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span>✓ Correct (+{submittedAnswer.score ?? 1} pt)</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-rose-500" />
                        <span>Review this concept</span>
                      </>
                    )}
                  </div>
                  {currentQ.concept_name && (
                    <span className="text-[11px] font-medium text-text-muted flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-accent" />
                      {currentQ.concept_name}
                    </span>
                  )}
                </div>

                {submittedAnswer.explanation && (
                  <div className="text-xs sm:text-sm leading-relaxed opacity-95 pt-1 space-y-1">
                    <span className="font-semibold text-text-primary flex items-center gap-1.5 text-xs">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-500" /> Explanation:
                    </span>
                    <p className="text-text-secondary leading-relaxed pl-5 whitespace-pre-line">
                      {submittedAnswer.explanation}
                    </p>
                  </div>
                )}

                {submittedAnswer.evaluation_feedback && (
                  <div className="text-xs leading-relaxed opacity-90 whitespace-pre-line border-t border-current/10 pt-2.5">
                    <span className="font-semibold block mb-1">AI Teacher Assessment:</span>
                    <p className="text-text-secondary">{submittedAnswer.evaluation_feedback}</p>
                  </div>
                )}
              </div>
            )}

            {/* Action Bar */}
            <div className="pt-6 max-w-2xl mx-auto flex items-center justify-end gap-3 border-t border-border/70">
              {!submittedAnswer ? (
                <button
                  disabled={submittingAnswer || (currentQ.question_type === "mcq" && !selectedMcqOption)}
                  onClick={handleSubmitAnswer}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold bg-accent hover:bg-accent-hover text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm shadow-accent/25 cursor-pointer"
                >
                  {submittingAnswer ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Evaluating...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Submit Answer
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleNextQuestion}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold bg-accent hover:bg-accent-hover text-white transition-all shadow-sm shadow-accent/25 cursor-pointer hover:scale-[1.01]"
                >
                  {currentQuestionIndex + 1 < totalQ ? (
                    <>
                      <span>Next Question</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      <span>Complete Quiz &amp; View Results</span>
                      <Trophy className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: Completed Results View (Rewarding & Spacious)
  // -------------------------------------------------------------------------
  if (mode === "result" && quizResult) {
    const isPassing = quizResult.score_percentage >= 70;
    const incorrectCount = quizResult.total_questions - quizResult.correct_answers;

    return (
      <div className="max-w-3xl mx-auto space-y-10 animate-in fade-in duration-300 py-4">
        {/* Results Hero Header */}
        <div className="text-center space-y-4 pb-8 border-b border-border/70">
          <div className="inline-flex p-4 rounded-3xl bg-accent/10 text-accent border border-accent/20 mb-2">
            {isPassing ? <Trophy className="w-12 h-12 text-accent" /> : <Award className="w-12 h-12 text-amber-500" />}
          </div>
          <div className="space-y-1.5">
            <h2 className="text-3xl font-bold text-text-primary tracking-tight">
              {quizResult.score_percentage}%
            </h2>
            <p className="text-base font-semibold text-text-primary">
              {isPassing ? "Good Progress! Strong Concept Retention" : "Practice Completed! Knowledge Gaps Identified"}
            </p>
            <p className="text-xs text-text-muted max-w-md mx-auto">
              You correctly answered {quizResult.correct_answers} of {quizResult.total_questions} questions. Your concept mastery has been updated.
            </p>
          </div>

          {/* Compact Score Breakdown Chips */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <div className="px-4 py-2 rounded-xl bg-surface-muted/60 border border-border/60 text-center">
              <span className="text-[11px] text-text-muted block">Total Score</span>
              <span className={`text-base font-bold font-mono ${isPassing ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500"}`}>
                {quizResult.score_percentage}%
              </span>
            </div>
            <div className="px-4 py-2 rounded-xl bg-surface-muted/60 border border-border/60 text-center">
              <span className="text-[11px] text-text-muted block">Correct</span>
              <span className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {quizResult.correct_answers}
              </span>
            </div>
            <div className="px-4 py-2 rounded-xl bg-surface-muted/60 border border-border/60 text-center">
              <span className="text-[11px] text-text-muted block">Incorrect</span>
              <span className="text-base font-bold font-mono text-rose-500">
                {incorrectCount}
              </span>
            </div>
          </div>

          {/* Action Row */}
          <div className="pt-3 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => startQuiz(quizResult.quiz_id)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-surface-muted hover:bg-surface border border-border text-text-primary transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> <span>Retake Quiz</span>
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" /> <span>Start Another Quiz</span>
            </button>
            <button
              onClick={() => {
                if (onNavigateTab) {
                  onNavigateTab("growth");
                } else {
                  setMode("list");
                }
              }}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-accent hover:bg-accent-hover text-white transition-all shadow-sm cursor-pointer"
            >
              <span>{onNavigateTab ? "Return to Growth" : "Back to Quizzes"}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Concept-Level Performance Breakdown */}
        {quizResult.concept_performance.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <Layers className="w-4 h-4 text-accent" />
                Concept Mastery Breakdown
              </h3>
              <span className="text-xs text-text-muted">
                {quizResult.concept_performance.length} concepts evaluated
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {quizResult.concept_performance.map((cp, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-2xl bg-surface-muted/50 border border-border/60 space-y-2.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-text-primary">{cp.concept_name}</span>
                    <span
                      className={`font-bold font-mono ${
                        cp.accuracy_percentage >= 70
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-amber-500"
                      }`}
                    >
                      {cp.accuracy_percentage}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-surface-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        cp.accuracy_percentage >= 70 ? "bg-emerald-500" : "bg-amber-500"
                      }`}
                      style={{ width: `${cp.accuracy_percentage}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-text-muted">
                    {cp.correct_questions} of {cp.total_questions} questions correct
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Detailed Question Review */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-accent" />
            Detailed Question Review
          </h3>
          <div className="space-y-3">
            {quizResult.answers.map((ans, idx) => (
              <div
                key={idx}
                className="p-4 rounded-2xl bg-surface-muted/40 border border-border/60 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-text-muted font-mono">Question {idx + 1}</span>
                  <span
                    className={`inline-flex items-center gap-1 font-semibold ${
                      ans.is_correct
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {ans.is_correct ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5" />
                    )}
                    {ans.is_correct ? "Correct" : "Needs Review"}
                  </span>
                </div>
                {ans.selected_answer && (
                  <div className="text-text-secondary">
                    <span className="text-text-muted">Your choice:</span> {ans.selected_answer}
                  </div>
                )}
                {ans.answer_text && (
                  <div className="text-text-secondary">
                    <span className="text-text-muted">Your response:</span> {ans.answer_text}
                  </div>
                )}
                {ans.correct_answer && (
                  <div className="text-emerald-700 dark:text-emerald-300">
                    <span className="text-text-muted">Correct solution:</span> {ans.correct_answer}
                  </div>
                )}
                {ans.explanation && (
                  <div className="text-text-secondary pt-2 border-t border-border/50 leading-relaxed">
                    {ans.explanation}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: Dashboard / Quiz List View (Modern, Spacious, De-Boxed)
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-9 animate-in fade-in duration-200">
      {/* 1. ADAPTIVE QUIZ HERO (Intelligent Learning Assessment Workspace Focal Point) */}
      <div className="relative overflow-hidden rounded-3xl p-7 sm:p-9 bg-gradient-to-br from-indigo-500/[0.08] via-purple-500/[0.03] to-transparent dark:from-indigo-500/[0.12] dark:via-purple-500/[0.04] dark:to-transparent border border-indigo-500/10 dark:border-indigo-500/15 space-y-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Intelligent Learning Assessment</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-text-primary tracking-tight">
              Adaptive Quiz
            </h1>
            <p className="text-xs sm:text-sm text-text-secondary leading-relaxed max-w-xl">
              Test your understanding with questions selected around your current mastery, recent performance, and learning history.
            </p>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-accent hover:bg-accent-hover text-white transition-all shadow-md shadow-accent/25 hover:scale-[1.01] cursor-pointer self-start sm:self-auto shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            <span>+ New Adaptive Quiz</span>
          </button>
        </div>

        {/* Supporting Statistics: Compact stat blocks with soft colored backgrounds, NO heavy borders */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 relative z-10">
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-surface/80 dark:bg-[#0E172A]/70 backdrop-blur-sm shadow-xs transition-colors">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 shrink-0">
              <ListChecks className="w-4 h-4" />
            </div>
            <div>
              <div className="text-lg font-bold text-text-primary font-mono tracking-tight leading-none mb-1">
                {quizzes.length}
              </div>
              <div className="text-[11px] text-text-muted font-medium">Available Quizzes</div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-surface/80 dark:bg-[#0E172A]/70 backdrop-blur-sm shadow-xs transition-colors">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <div className="text-lg font-bold text-text-primary font-mono tracking-tight leading-none mb-1">
                {concepts.length}
              </div>
              <div className="text-[11px] text-text-muted font-medium">Concepts</div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-surface/80 dark:bg-[#0E172A]/70 backdrop-blur-sm shadow-xs transition-colors">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono tracking-tight leading-none mb-1">
                {masteryScore !== null ? `${masteryScore}%` : "—"}
              </div>
              <div className="text-[11px] text-text-muted font-medium">Mastery</div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-surface/80 dark:bg-[#0E172A]/70 backdrop-blur-sm shadow-xs transition-colors">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <div className="text-lg font-bold text-amber-600 dark:text-amber-400 font-mono tracking-tight leading-none mb-1">
                {recentScore !== null ? `${recentScore}%` : quizzes.some((q) => q.completed_at) ? "Completed" : "Ready"}
              </div>
              <div className="text-[11px] text-text-muted font-medium">Recent Score</div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-300 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. CONCEPT COVERAGE (Secondary, cleaner horizontal section, soft chips, no heavy outlines) */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-text-muted">
              CONCEPT COVERAGE
            </span>
            <span className="text-xs text-text-muted">
              Your quizzes currently cover {concepts.length} {concepts.length === 1 ? "concept" : "concepts"}:
            </span>
          </div>
          <button
            onClick={handleExtractConcepts}
            disabled={extractingConcepts}
            className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-accent font-medium transition-colors disabled:opacity-50 cursor-pointer"
            title="Analyze materials for additional concepts"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${extractingConcepts ? "animate-spin text-accent" : ""}`} />
            <span>{extractingConcepts ? "Analyzing..." : "Refresh Concepts"}</span>
          </button>
        </div>

        {concepts.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {concepts.map((c) => (
              <span
                key={c.id}
                title={c.description}
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/15 transition-colors cursor-default"
              >
                {c.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-muted italic">
            No concepts extracted yet. Upload PDF materials or click "Refresh Concepts" to extract automatically.
          </p>
        )}
      </div>

      {/* 3. QUIZ LIBRARY & 2-COLUMN QUIZ GRID (Spacious, 2 columns on desktop) */}
      <div className="space-y-5 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-text-primary tracking-tight">Your Quizzes</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Choose a quiz to practice or start a fresh adaptive assessment.
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-accent hover:text-accent-hover hover:bg-accent/5 transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>+ New Adaptive Quiz</span>
          </button>
        </div>

        {quizzes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {quizzes.map((q) => {
              const info = getQuizTypeInfo(q.title);
              const QuizIcon = info.Icon;
              const isCompleted = Boolean(q.completed_at);

              return (
                <div
                  key={q.id}
                  className="p-6 rounded-2xl bg-surface dark:bg-[#0E172A] border border-slate-200/80 dark:border-slate-800/60 hover:border-accent/40 dark:hover:border-accent/40 shadow-xs hover:shadow-md transition-all duration-200 min-h-[210px] flex flex-col justify-between group"
                >
                  {/* Top Row: Date on left, Question Count Badge on right */}
                  <div className="flex items-center justify-between text-xs mb-3">
                    <span className="font-mono text-text-muted text-[11px]">
                      {new Date(q.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-surface-muted text-text-secondary text-[11px] font-medium">
                      {q.question_count} Questions
                    </span>
                  </div>

                  {/* Middle Area: Semantic Icon + Title + Description */}
                  <div className="flex items-start gap-4 flex-1 mb-5">
                    <div
                      className={`w-10 h-10 rounded-xl ${info.bgColor} ${info.accentColor} flex items-center justify-center shrink-0 mt-0.5`}
                    >
                      <QuizIcon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-bold text-text-primary group-hover:text-accent transition-colors truncate">
                          {q.title}
                        </h4>
                      </div>
                      <p className="text-xs text-text-muted leading-relaxed line-clamp-2">
                        {info.desc}
                      </p>
                    </div>
                  </div>

                  {/* Bottom Row: Status on left, obvious Start Attempt action with arrow on right */}
                  <div className="pt-4 border-t border-border/40 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-text-muted font-medium">
                        {q.question_count} Questions
                      </span>
                      <span className="w-1 h-1 rounded-full bg-border" />
                      {isCompleted ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
                          <CheckCircle2 className="w-3 h-3" /> Completed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-text-muted font-medium text-[11px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> Not Started
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => startQuiz(q.id)}
                      className="inline-flex items-center gap-1.5 font-semibold text-accent group-hover:text-accent-hover text-xs transition-all cursor-pointer group-hover:translate-x-0.5"
                    >
                      <span>{isCompleted ? "Retake Quiz" : "Start Attempt"}</span>
                      <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Empty State (Visually Attractive, No Huge Heavy Box) */
          <div className="p-12 sm:p-16 rounded-3xl bg-surface-muted/30 border border-border/50 text-center flex flex-col items-center justify-center max-w-xl mx-auto space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-accent/10 text-accent border border-accent/20 flex items-center justify-center">
              <Brain className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-text-primary">No quizzes yet</h3>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                Create an adaptive quiz based on your learning history, uploaded materials, and current mastery.
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-accent hover:bg-accent-hover text-white transition-all shadow-sm shadow-accent/25 hover:scale-[1.02] cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Create Adaptive Quiz</span>
            </button>
          </div>
        )}
      </div>

      {/* Quiz Creation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 space-y-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                Generate Adaptive Quiz
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-text-muted hover:text-text-primary text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleCreateQuiz} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Quiz Title
                </label>
                <input
                  type="text"
                  required
                  value={quizTitle}
                  onChange={(e) => setQuizTitle(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface-muted px-3.5 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Number of Questions: <span className="text-accent font-bold">{questionCount}</span>
                </label>
                <input
                  type="range"
                  min={2}
                  max={10}
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value))}
                  className="w-full accent-accent cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Difficulty Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: "adaptive", label: "Adaptive (Smart)" },
                    { key: "easy", label: "Easy" },
                    { key: "medium", label: "Medium" },
                    { key: "hard", label: "Hard" },
                  ].map((modeOption) => (
                    <button
                      key={modeOption.key}
                      type="button"
                      onClick={() => setPreferredDifficulty(modeOption.key)}
                      className={`p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                        preferredDifficulty === modeOption.key
                          ? "border-accent bg-accent-soft text-accent font-semibold"
                          : "border-border bg-surface-muted text-text-secondary hover:bg-surface"
                      }`}
                    >
                      {modeOption.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-text-secondary hover:text-text-primary cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingQuiz}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-accent hover:bg-accent-hover text-white disabled:opacity-50 transition-all shadow-sm cursor-pointer"
                >
                  {creatingQuiz ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Generating with Gemini...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Generate &amp; Start
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
