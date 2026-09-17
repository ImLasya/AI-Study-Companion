/**
 * QuizTab — Adaptive Quiz & Assessment Interface
 *
 * Features:
 * - Concept inventory display and on-demand extraction
 * - Grounded adaptive quiz generation with question count and difficulty preferences
 * - Multi-choice (MCQ) deterministic interactive testing with instant feedback
 * - Open-ended conceptual assessment with Gemini rubric evaluation
 * - Complete attempt summary with concept-level performance breakdown
 */

import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  Layers,
  Lightbulb,
  Loader2,
  Play,
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
  getProjectQuizzesApi,
  getQuizApi,
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
} from "@/types";

interface QuizTabProps {
  projectId: string;
}

type TabMode = "list" | "active" | "result";

export const QuizTab: React.FC<QuizTabProps> = ({ projectId }) => {
  // Data State
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
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
      const [conceptsData, quizzesData] = await Promise.all([
        getProjectConceptsApi(projectId).catch(() => []),
        getProjectQuizzesApi(projectId).catch(() => []),
      ]);
      setConcepts(conceptsData);
      setQuizzes(quizzesData);
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
        // Refresh quizzes list in background
        getProjectQuizzesApi(projectId).then(setQuizzes).catch(() => {});
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to finalize quiz attempt";
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
  };

  // -------------------------------------------------------------------------
  // RENDER: Loading State
  // -------------------------------------------------------------------------
  if (loading && mode === "list" && quizzes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
        <p className="text-sm">Loading quizzes and concept inventory...</p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: Active Quiz View
  // -------------------------------------------------------------------------
  if (mode === "active" && activeQuiz) {
    const currentQ: QuizQuestionPublic | undefined = activeQuiz.questions[currentQuestionIndex];
    const totalQ = activeQuiz.questions.length;
    const progressPct = Math.round(((currentQuestionIndex + 1) / totalQ) * 100);

    return (
      <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-200">
        {/* Navigation / Progress Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-800">
          <button
            onClick={() => setMode("list")}
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Exit Quiz
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-gray-400">
              Question {currentQuestionIndex + 1} of {totalQ}
            </span>
            <div className="w-32 h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-300 rounded-full"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {currentQ && (
          <div className="rounded-2xl border border-gray-800/80 bg-gray-950/60 p-6 sm:p-8 space-y-6 shadow-xl backdrop-blur-sm">
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                <BookOpen className="w-3 h-3" />
                {currentQ.concept_name || "Core Concept"}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium uppercase tracking-wider ${
                  currentQ.difficulty === "easy"
                    ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                    : currentQ.difficulty === "hard"
                    ? "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                    : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                }`}
              >
                <Target className="w-3 h-3" />
                {currentQ.difficulty}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-800 text-gray-300">
                {currentQ.question_type === "mcq" ? "Multiple Choice" : "Open-Ended Evaluation"}
              </span>
            </div>

            {/* Question Text */}
            <h3 className="text-lg sm:text-xl font-semibold text-white leading-relaxed">
              {currentQ.question_text}
            </h3>

            {/* MCQ Options */}
            {currentQ.question_type === "mcq" && (
              <div className="grid gap-3 pt-2">
                {currentQ.options.map((option, idx) => {
                  const isSelected = selectedMcqOption === option;
                  const isSubmitted = Boolean(submittedAnswer);
                  const isCorrectAnswer =
                    submittedAnswer && option.trim().toLowerCase() === submittedAnswer.correct_answer.trim().toLowerCase();
                  const isUserWrongChoice = isSubmitted && isSelected && !submittedAnswer?.is_correct;

                  let cardStyle =
                    "border-gray-800 bg-gray-900/50 hover:bg-gray-800/60 hover:border-gray-700 text-gray-200";

                  if (isSubmitted) {
                    if (isCorrectAnswer) {
                      cardStyle = "border-emerald-500/60 bg-emerald-500/10 text-emerald-200";
                    } else if (isUserWrongChoice) {
                      cardStyle = "border-rose-500/60 bg-rose-500/10 text-rose-200";
                    } else {
                      cardStyle = "border-gray-800 bg-gray-900/30 text-gray-500 opacity-60";
                    }
                  } else if (isSelected) {
                    cardStyle = "border-indigo-500 bg-indigo-500/10 text-white ring-1 ring-indigo-500";
                  }

                  return (
                    <button
                      key={idx}
                      disabled={isSubmitted}
                      onClick={() => setSelectedMcqOption(option)}
                      className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-3.5 ${cardStyle}`}
                    >
                      <span className="flex-shrink-0 w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs font-bold">
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span className="text-sm pt-0.5 leading-relaxed flex-1">{option}</span>
                      {isSubmitted && isCorrectAnswer && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                      )}
                      {isSubmitted && isUserWrongChoice && (
                        <XCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Open-Ended Textarea */}
            {currentQ.question_type === "open_ended" && (
              <div className="space-y-3 pt-2">
                <textarea
                  rows={5}
                  disabled={Boolean(submittedAnswer)}
                  value={openEndedAnswer}
                  onChange={(e) => setOpenEndedAnswer(e.target.value)}
                  placeholder="Explain your answer thoroughly with supporting concepts..."
                  className="w-full rounded-xl border border-gray-800 bg-gray-900/60 p-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-y"
                />
                <div className="text-right text-xs text-gray-500">
                  {openEndedAnswer.length} characters
                </div>
              </div>
            )}

            {/* Instant Answer Feedback Card */}
            {submittedAnswer && (
              <div
                className={`p-5 rounded-xl border space-y-3 animate-in fade-in duration-300 ${
                  submittedAnswer.is_correct
                    ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-200"
                    : "bg-rose-950/30 border-rose-500/30 text-rose-200"
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-sm">
                  {submittedAnswer.is_correct ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Correct Answer (+{submittedAnswer.score ?? 1} pt)</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-rose-400" />
                      <span>Incorrect / Incomplete</span>
                    </>
                  )}
                </div>

                {submittedAnswer.explanation && (
                  <div className="text-xs leading-relaxed opacity-90 whitespace-pre-line border-t border-current/10 pt-2">
                    <span className="font-semibold block mb-1">Explanation:</span>
                    {submittedAnswer.explanation}
                  </div>
                )}

                {submittedAnswer.evaluation_feedback && (
                  <div className="text-xs leading-relaxed opacity-90 whitespace-pre-line border-t border-current/10 pt-2">
                    <span className="font-semibold block mb-1">AI Teacher Assessment:</span>
                    {submittedAnswer.evaluation_feedback}
                  </div>
                )}
              </div>
            )}

            {/* Action Bar */}
            <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-800">
              {!submittedAnswer ? (
                <button
                  disabled={submittingAnswer || (currentQ.question_type === "mcq" && !selectedMcqOption)}
                  onClick={handleSubmitAnswer}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-600/20"
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
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-lg shadow-indigo-600/20"
                >
                  {currentQuestionIndex + 1 < totalQ ? (
                    <>
                      Next Question
                      <ArrowRight className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      Complete Quiz & View Results
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
  // RENDER: Completed Results View
  // -------------------------------------------------------------------------
  if (mode === "result" && quizResult) {
    const isPassing = quizResult.score_percentage >= 70;

    return (
      <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-300">
        {/* Results Banner */}
        <div className="text-center rounded-2xl border border-gray-800 bg-gradient-to-b from-gray-900/80 to-gray-950 p-8 space-y-4 shadow-xl">
          <div className="inline-flex p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-1">
            {isPassing ? <Trophy className="w-10 h-10" /> : <Award className="w-10 h-10" />}
          </div>
          <h2 className="text-2xl font-bold text-white">Quiz Attempt Completed!</h2>
          <p className="text-sm text-gray-400 max-w-md mx-auto">
            {isPassing
              ? "Great job! You demonstrated strong mastery of the core concepts."
              : "Review the question breakdowns below to reinforce your knowledge gaps."}
          </p>

          <div className="flex items-center justify-center gap-6 pt-4">
            <div className="px-6 py-3 rounded-xl bg-gray-900 border border-gray-800 text-center">
              <div className="text-xs text-gray-400">Score</div>
              <div className={`text-2xl font-bold ${isPassing ? "text-emerald-400" : "text-amber-400"}`}>
                {quizResult.score_percentage}%
              </div>
            </div>
            <div className="px-6 py-3 rounded-xl bg-gray-900 border border-gray-800 text-center">
              <div className="text-xs text-gray-400">Correct</div>
              <div className="text-2xl font-bold text-white">
                {quizResult.correct_answers} / {quizResult.total_questions}
              </div>
            </div>
          </div>

          <div className="pt-4 flex items-center justify-center gap-3">
            <button
              onClick={() => startQuiz(quizResult.quiz_id)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gray-800 hover:bg-gray-700 text-white transition-all"
            >
              <RotateCcw className="w-4 h-4" /> Retake Quiz
            </button>
            <button
              onClick={() => setMode("list")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-lg shadow-indigo-600/20"
            >
              Back to Quizzes
            </button>
          </div>
        </div>

        {/* Concept-Level Performance Breakdown */}
        {quizResult.concept_performance.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              Concept Mastery Breakdown
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {quizResult.concept_performance.map((cp, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl border border-gray-800 bg-gray-950/60 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-gray-200">{cp.concept_name}</span>
                    <span
                      className={`font-bold ${
                        cp.accuracy_percentage >= 70 ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {cp.accuracy_percentage}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        cp.accuracy_percentage >= 70 ? "bg-emerald-500" : "bg-amber-500"
                      }`}
                      style={{ width: `${cp.accuracy_percentage}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {cp.correct_questions} of {cp.total_questions} questions correct
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Question Review Breakdown */}
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-indigo-400" />
            Detailed Review
          </h3>
          <div className="space-y-3">
            {quizResult.answers.map((ans, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl border border-gray-800/80 bg-gray-950/40 space-y-2 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-400">Question {idx + 1}</span>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-semibold ${
                      ans.is_correct ? "text-emerald-400" : "text-rose-400"
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
                  <div className="text-xs text-gray-300">
                    <span className="text-gray-500">Your choice:</span> {ans.selected_answer}
                  </div>
                )}
                {ans.answer_text && (
                  <div className="text-xs text-gray-300">
                    <span className="text-gray-500">Your response:</span> {ans.answer_text}
                  </div>
                )}
                {ans.correct_answer && (
                  <div className="text-xs text-emerald-300">
                    <span className="text-gray-500">Correct solution:</span> {ans.correct_answer}
                  </div>
                )}
                {ans.explanation && (
                  <div className="text-xs text-gray-400 pt-1 border-t border-gray-800/50">
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
  // RENDER: Dashboard / Quiz List View
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header & Concept Inventory Ribbon */}
      <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-6 space-y-4 shadow-lg backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              Project Concept Inventory
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Knowledge concepts automatically extracted from your uploaded materials.
            </p>
          </div>
          <button
            onClick={handleExtractConcepts}
            disabled={extractingConcepts}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${extractingConcepts ? "animate-spin" : ""}`} />
            {extractingConcepts ? "Analyzing Materials..." : "Refresh Concepts"}
          </button>
        </div>

        {concepts.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {concepts.map((c) => (
              <span
                key={c.id}
                title={c.description}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
              >
                <BookOpen className="w-3 h-3 text-indigo-400" />
                {c.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 italic">
            No concepts extracted yet. Upload PDF materials or click "Refresh Concepts" above.
          </p>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Quizzes List Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white">Adaptive Quizzes</h2>
            {quizzes.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-purple-500/15 text-purple-300 border border-purple-500/30 font-medium">
                {quizzes.length} Available Quizzes
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Targeted evaluations calibrated against your personal learning history. Start an attempt to measure mastery.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-lg shadow-indigo-600/20 self-start sm:self-auto"
        >
          <Sparkles className="w-4 h-4" />
          New Adaptive Quiz
        </button>
      </div>

      {/* Quizzes Cards / Empty State */}
      {quizzes.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quizzes.map((q) => (
            <div
              key={q.id}
              className="p-5 rounded-2xl border border-gray-800 bg-gray-950/60 hover:border-gray-700 transition-all flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span className="font-mono">{new Date(q.created_at).toLocaleDateString()}</span>
                  <span className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 font-medium text-[11px]">
                    {q.question_count} questions
                  </span>
                </div>
                <h4 className="text-base font-semibold text-white group-hover:text-indigo-300 transition-colors">
                  {q.title}
                </h4>
                <p className="text-[11px] text-slate-400">
                  Available Quiz • Targeted Assessment
                </p>
              </div>

              <button
                onClick={() => startQuiz(q.id)}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-indigo-600/10 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/20 hover:border-transparent transition-all"
              >
                <Play className="w-3.5 h-3.5" /> Start Attempt
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-950/40 p-12 text-center flex flex-col items-center justify-center">
          <div className="p-3.5 rounded-2xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 mb-4">
            <HelpCircle className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-white">No Quizzes Generated Yet</h3>
          <p className="text-xs text-gray-400 mt-2 max-w-sm">
            Generate an adaptive quiz to evaluate your understanding of core concepts from your learning materials.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-lg shadow-indigo-600/20"
          >
            <Sparkles className="w-3.5 h-3.5" /> Create Your First Quiz
          </button>
        </div>
      )}

      {/* Quiz Creation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-950 p-6 space-y-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                Generate Adaptive Quiz
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-white text-xs"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleCreateQuiz} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Quiz Title
                </label>
                <input
                  type="text"
                  required
                  value={quizTitle}
                  onChange={(e) => setQuizTitle(e.target.value)}
                  className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3.5 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Number of Questions: <span className="text-indigo-400 font-bold">{questionCount}</span>
                </label>
                <input
                  type="range"
                  min={2}
                  max={10}
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
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
                      className={`p-2.5 rounded-xl border text-xs font-medium transition-all ${
                        preferredDifficulty === modeOption.key
                          ? "border-indigo-500 bg-indigo-500/15 text-indigo-200"
                          : "border-gray-800 bg-gray-900/50 text-gray-400 hover:bg-gray-800"
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
                  className="px-4 py-2 rounded-xl text-xs font-medium text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingQuiz}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-all shadow-lg shadow-indigo-600/20"
                >
                  {creatingQuiz ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Generating with Gemini...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Generate & Start
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
