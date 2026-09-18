import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  Calendar,
  CheckCircle2,
  ChevronDown,
  FileText,
  HelpCircle,
  LineChart,
  Loader2,
  MessageSquare,
  Trophy,
} from "lucide-react";
import {
  getGlobalAnalyticsApi,
  getProjectAnalyticsApi,
  getProjectMaterialsApi,
} from "@/lib/api";
import type {
  Material,
  Project,
  ProjectAnalyticsResponse,
} from "@/types";

interface AnalyticsTabProps {
  projectId: string;
  project?: Project | null;
  spaceName?: string;
  onNavigateTab?: (tab: "overview" | "materials" | "tutor" | "quiz" | "growth" | "analytics") => void;
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({
  projectId,
  project,
  spaceName,
  onNavigateTab,
}) => {
  const [data, setData] = useState<ProjectAnalyticsResponse | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [allProjects, setAllProjects] = useState<{ id: string; name: string; spaceName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sub-navigation & Dropdown
  const [activeSubSection, setActiveSubSection] = useState<"overview" | "quiz" | "concepts" | "activity">("overview");
  const [showProjectSwitcher, setShowProjectSwitcher] = useState(false);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const [analyticsRes, matsRes, globRes] = await Promise.all([
        getProjectAnalyticsApi(projectId),
        getProjectMaterialsApi(projectId).catch(() => []),
        getGlobalAnalyticsApi().catch(() => null),
      ]);
      setData(analyticsRes);
      setMaterials(matsRes);

      if (globRes?.projects_by_progress) {
        setAllProjects(
          globRes.projects_by_progress.map((p) => ({
            id: p.project_id,
            name: p.project_name,
            spaceName: p.space_name,
          }))
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load analytics";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [projectId]);

  const getInitials = (name?: string) => {
    if (!name) return "P";
    return name
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  // Derived metrics
  const {
    learning_activity = [],
    quiz_performance_trend = [],
    current_mastery_distribution,
    concept_trends = [],
    tutor_interaction_counts = { total_conversations: 0, total_messages: 0, assistant_messages: 0 },
  } = data || {};

  const totalEvents = learning_activity.reduce((acc, curr) => acc + curr.event_count, 0);
  const activeStudyDays = learning_activity.filter((b) => b.event_count > 0).length;
  const materialsCount = materials.length;
  const quizzesCompletedCount = quiz_performance_trend.length;

  const quizScores = useMemo(
    () => quiz_performance_trend.map((q) => q.score_percentage),
    [quiz_performance_trend]
  );

  const avgScore =
    quizScores.length > 0
      ? Math.round(quizScores.reduce((sum, s) => sum + s, 0) / quizScores.length)
      : null;

  const highestScore = quizScores.length > 0 ? Math.max(...quizScores) : null;
  const lowestScore = quizScores.length > 0 ? Math.min(...quizScores) : null;

  // Weak topics (score < 50% or needs_attention status)
  const weakTopics = useMemo(() => {
    return concept_trends.filter(
      (c) =>
        (c.latest_score !== null && c.latest_score < 50) ||
        c.status === "needs_attention"
    );
  }, [concept_trends]);

  // Topic Mastery Breakdown
  const totalConceptsCount = concept_trends.length;
  const masteredCount = current_mastery_distribution?.mastered ?? 0;
  const stableCount = current_mastery_distribution?.stable ?? 0;
  const needsAttentionCount = current_mastery_distribution?.needs_attention ?? 0;
  const unassessedCount = current_mastery_distribution?.unassessed ?? 0;

  const masteredPct = totalConceptsCount > 0 ? Math.round((masteredCount / totalConceptsCount) * 100) : 0;
  const stablePct = totalConceptsCount > 0 ? Math.round((stableCount / totalConceptsCount) * 100) : 0;
  const needsAttentionPct = totalConceptsCount > 0 ? Math.round((needsAttentionCount / totalConceptsCount) * 100) : 0;
  const unassessedPct = totalConceptsCount > 0 ? Math.round((unassessedCount / totalConceptsCount) * 100) : 0;

  // Activity breakdown by type for donut chart
  const activityDistribution = useMemo(() => {
    let quizEvents = 0;
    let tutorEvents = 0;
    let materialEvents = 0;
    let otherEvents = 0;

    learning_activity.forEach((bucket) => {
      Object.entries(bucket.event_breakdown || {}).forEach(([k, cnt]) => {
        if (k.includes("quiz")) quizEvents += cnt;
        else if (k.includes("tutor") || k.includes("message")) tutorEvents += cnt;
        else if (k.includes("material")) materialEvents += cnt;
        else otherEvents += cnt;
      });
    });

    const sum = quizEvents + tutorEvents + materialEvents + otherEvents;
    if (sum === 0) return null;

    return {
      total: sum,
      quizPct: Math.round((quizEvents / sum) * 100),
      tutorPct: Math.round((tutorEvents / sum) * 100),
      materialPct: Math.round((materialEvents / sum) * 100),
      otherPct: Math.max(0, 100 - (Math.round((quizEvents / sum) * 100) + Math.round((tutorEvents / sum) * 100) + Math.round((materialEvents / sum) * 100))),
    };
  }, [learning_activity]);

  // Grounded answers percentage
  const groundedPct =
    tutor_interaction_counts.total_messages > 0
      ? Math.round(
          (tutor_interaction_counts.assistant_messages /
            tutor_interaction_counts.total_messages) *
            100
        )
      : 0;

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <span className="text-xs text-gray-400 font-medium">Aggregating your learning analytics...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-rose-900/40 bg-rose-950/20 p-8 text-center flex flex-col items-center">
        <AlertCircle className="w-8 h-8 text-rose-400 mb-2" />
        <p className="text-sm font-semibold text-rose-200">Unable to load project analytics</p>
        <p className="text-xs text-rose-400/80 mt-1 max-w-sm">{error || "No data returned"}</p>
        <button
          onClick={fetchAnalytics}
          className="mt-4 px-4 py-2 rounded-xl bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 text-xs font-medium border border-rose-500/30 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ================================================================ */}
      {/* 1. TOP BREADCRUMB & PROJECT HEADER                               */}
      {/* ================================================================ */}
      <div className="space-y-3">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Link to="/spaces" className="hover:text-gray-200 transition-colors">
            Spaces
          </Link>
          <span>&gt;</span>
          <span className="text-gray-300">{spaceName || "Knowledge Space"}</span>
          <span>&gt;</span>
          <span className="text-indigo-400 font-medium">{project?.name || "Project Workspace"}</span>
        </div>

        {/* Header Bar */}
        <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/15 border border-indigo-500/25 flex items-center justify-center font-bold text-indigo-600 dark:text-indigo-400 text-base tracking-wider shrink-0 shadow-inner">
              {getInitials(project?.name)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-text-primary tracking-tight">
                  {project?.name || "Machine Learning Fundamentals"}
                </h1>
              </div>
              <div className="text-xs text-accent font-medium mt-0.5">
                Space: {spaceName || "Knowledge Space"}
              </div>
              <p className="text-xs text-text-muted mt-1 max-w-2xl">
                Detailed insights into your learning activity, quiz performance, and concept understanding.
              </p>
            </div>
          </div>

          {/* Project Switcher Dropdown */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowProjectSwitcher((prev) => !prev)}
              className="px-3 py-1.5 rounded-xl bg-surface-muted hover:bg-surface text-text-primary text-xs font-medium border border-border flex items-center gap-2 transition-colors cursor-pointer"
            >
              <span>Switch Project</span>
              <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
            </button>

            {showProjectSwitcher && allProjects.length > 0 && (
              <div className="absolute right-0 mt-2 w-64 rounded-xl bg-surface border border-border shadow-2xl p-1.5 z-30">
                <div className="px-2 py-1 text-[10px] uppercase font-mono font-bold text-text-muted">
                  Your Projects
                </div>
                {allProjects.map((p) => (
                  <Link
                    key={p.id}
                    to={`/projects/${p.id}?tab=analytics`}
                    onClick={() => setShowProjectSwitcher(false)}
                    className={`block px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      p.id === projectId
                        ? "bg-accent/15 text-accent font-semibold"
                        : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                    }`}
                  >
                    <div className="truncate">{p.name}</div>
                    <div className="text-[10px] text-text-muted truncate">{p.spaceName}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sub-Navigation Pills */}
        <div className="flex items-center gap-2 pt-1 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveSubSection("overview")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
              activeSubSection === "overview"
                ? "bg-accent text-white shadow-md shadow-accent/25"
                : "bg-surface-muted text-text-secondary hover:text-text-primary hover:bg-surface border border-border"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => {
              setActiveSubSection("quiz");
              document.getElementById("quiz-performance-section")?.scrollIntoView({ behavior: "smooth" });
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
              activeSubSection === "quiz"
                ? "bg-accent text-white shadow-md shadow-accent/25"
                : "bg-surface-muted text-text-secondary hover:text-text-primary hover:bg-surface border border-border"
            }`}
          >
            Quiz Scores
          </button>
          <button
            onClick={() => {
              setActiveSubSection("concepts");
              document.getElementById("concept-mastery-section")?.scrollIntoView({ behavior: "smooth" });
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
              activeSubSection === "concepts"
                ? "bg-accent text-white shadow-md shadow-accent/25"
                : "bg-surface-muted text-text-secondary hover:text-text-primary hover:bg-surface border border-border"
            }`}
          >
            Concept Mastery
          </button>
          <button
            onClick={() => {
              setActiveSubSection("activity");
              document.getElementById("study-activity-section")?.scrollIntoView({ behavior: "smooth" });
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
              activeSubSection === "activity"
                ? "bg-accent text-white shadow-md shadow-accent/25"
                : "bg-surface-muted text-text-secondary hover:text-text-primary hover:bg-surface border border-border"
            }`}
          >
            Activity &amp; Engagement
          </button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* 2. TOP 4 SUMMARY CARDS                                           */}
      {/* ================================================================ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Study Days */}
        <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-text-muted">Study Days</div>
            <div className="text-2xl font-bold text-text-primary tracking-tight mt-2 font-mono">{activeStudyDays}</div>
            <div className="text-[11px] text-text-muted mt-1">Active in last 30 days</div>
          </div>
          <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Materials Studied */}
        <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-text-muted">Materials Studied</div>
            <div className="text-2xl font-bold text-text-primary tracking-tight mt-2 font-mono">{materialsCount}</div>
            <div className="text-[11px] text-text-muted mt-1">PDF documents</div>
          </div>
          <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Quizzes Completed */}
        <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-text-muted">Quizzes Completed</div>
            <div className="text-2xl font-bold text-text-primary tracking-tight mt-2 font-mono">{quizzesCompletedCount}</div>
            <div className="text-[11px] text-text-muted mt-1">
              {avgScore !== null ? `Average score: ${avgScore}%` : "No attempts yet"}
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: AI Tutor Sessions */}
        <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-text-muted">AI Tutor Sessions</div>
            <div className="text-2xl font-bold text-text-primary tracking-tight mt-2 font-mono">
              {tutor_interaction_counts.total_conversations}
            </div>
            <div className="text-[11px] text-text-muted mt-1">
              {tutor_interaction_counts.total_messages} questions asked
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
            <MessageSquare className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* 3. ROW 1: YOUR STUDY ACTIVITY & TIME DISTRIBUTION (2 COLUMNS)    */}
      {/* ================================================================ */}
      <div id="study-activity-section" className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Your Study Activity (8 cols) */}
        <div className="lg:col-span-8 p-6 rounded-2xl bg-surface border border-border shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-border">
            <div>
              <h3 className="text-sm font-bold text-text-primary tracking-tight flex items-center gap-2">
                <Activity className="w-4 h-4 text-accent" />
                Your Study Activity
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Learning activity across the last 30 days
              </p>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                <span className="w-2 h-2 rounded-full bg-blue-500" /> Quiz Attempts
              </span>
              <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                <span className="w-2 h-2 rounded-full bg-indigo-500" /> AI Tutor
              </span>
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Materials
              </span>
            </div>
          </div>

          {/* Daily Activity Multi-Bar Chart */}
          {learning_activity.length > 0 ? (
            <div className="pt-2">
              <div className="w-full h-48 flex items-end justify-between gap-1.5">
                {learning_activity.slice(-14).map((bucket, idx) => {
                  let quizCount = 0;
                  let tutorCount = 0;
                  let materialCount = 0;

                  Object.entries(bucket.event_breakdown || {}).forEach(([k, cnt]) => {
                    if (k.includes("quiz")) quizCount += cnt;
                    else if (k.includes("tutor") || k.includes("message")) tutorCount += cnt;
                    else if (k.includes("material")) materialCount += cnt;
                  });

                  const totalBucket = bucket.event_count || 1;
                  const maxHeight = 160;
                  const height = Math.max(8, Math.min(maxHeight, (totalBucket / 8) * maxHeight));

                  const shortDate = new Date(bucket.date).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  });

                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                      {/* Tooltip */}
                      <div className="absolute -top-10 hidden group-hover:flex flex-col items-center px-2 py-1 rounded bg-surface border border-border text-[10px] text-text-primary z-20 whitespace-nowrap shadow-xl">
                        <span className="font-bold text-text-primary">{shortDate}</span>
                        <span className="text-text-muted">{bucket.event_count} actions</span>
                      </div>

                      {/* Stacked bar segments */}
                      <div
                        className="w-full max-w-[20px] rounded-t overflow-hidden flex flex-col-reverse justify-start transition-all duration-300 group-hover:scale-105"
                        style={{ height: `${height}px` }}
                      >
                        {quizCount > 0 && (
                          <div
                            className="w-full bg-blue-500"
                            style={{ height: `${(quizCount / totalBucket) * 100}%` }}
                          />
                        )}
                        {tutorCount > 0 && (
                          <div
                            className="w-full bg-indigo-500"
                            style={{ height: `${(tutorCount / totalBucket) * 100}%` }}
                          />
                        )}
                        {materialCount > 0 && (
                          <div
                            className="w-full bg-emerald-500"
                            style={{ height: `${(materialCount / totalBucket) * 100}%` }}
                          />
                        )}
                        {quizCount === 0 && tutorCount === 0 && materialCount === 0 && (
                          <div className="w-full bg-accent h-full" />
                        )}
                      </div>

                      {/* Day label */}
                      <span className="text-[9px] font-mono text-text-muted mt-2 truncate w-full text-center">
                        {shortDate.split(" ")[1]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-text-muted">
              Your study activity will appear here as you learn.
            </div>
          )}
        </div>

        {/* Right: Time Distribution Donut (4 cols) */}
        <div className="lg:col-span-4 p-6 rounded-2xl bg-surface border border-border shadow-sm space-y-4">
          <div className="pb-3 border-b border-border">
            <h3 className="text-sm font-bold text-text-primary tracking-tight">Time Distribution</h3>
            <p className="text-xs text-text-muted mt-0.5">How you spend your study time</p>
          </div>

          {activityDistribution ? (
            <div className="flex flex-col items-center pt-2">
              {/* Donut Ring */}
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg className="w-36 h-36 -rotate-90" viewBox="0 0 36 36">
                  {/* Background track */}
                  <path
                    className="text-surface-muted"
                    strokeWidth="4"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  {/* Segment 1: Quizzes (blue) */}
                  <path
                    className="text-blue-500"
                    strokeDasharray={`${activityDistribution.quizPct}, 100`}
                    strokeWidth="4"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  {/* Segment 2: AI Tutor (indigo) */}
                  <path
                    className="text-indigo-500"
                    strokeDasharray={`${activityDistribution.tutorPct}, 100`}
                    strokeWidth="4"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  {/* Segment 3: Materials (emerald) */}
                  <path
                    className="text-emerald-500"
                    strokeDasharray={`${activityDistribution.materialPct}, 100`}
                    strokeWidth="4"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute text-center">
                  <div className="text-base font-extrabold text-text-primary tracking-tight font-mono">
                    {totalEvents}
                  </div>
                  <div className="text-[10px] text-text-muted font-medium">Actions</div>
                </div>
              </div>

              {/* Breakdown Legend */}
              <div className="w-full space-y-2 mt-5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-text-secondary">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Quizzes
                  </span>
                  <span className="font-mono font-bold text-text-primary">{activityDistribution.quizPct}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-text-secondary">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> AI Tutor
                  </span>
                  <span className="font-mono font-bold text-text-primary">{activityDistribution.tutorPct}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-text-secondary">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Materials
                  </span>
                  <span className="font-mono font-bold text-text-primary">{activityDistribution.materialPct}%</span>
                </div>
                {activityDistribution.otherPct > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-text-muted">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-400" /> Other
                    </span>
                    <span className="font-mono text-text-muted">{activityDistribution.otherPct}%</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-text-muted">
              Study-time breakdown will appear as you use the different learning activities.
            </div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* 4. ROW 2: QUIZ PERFORMANCE & PERFORMANCE SUMMARY (2 COLUMNS)    */}
      {/* ================================================================ */}
      <div id="quiz-performance-section" className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Quiz Performance Chart (8 cols) */}
        <div className="lg:col-span-8 p-6 rounded-2xl bg-surface border border-border shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div>
              <h3 className="text-sm font-bold text-text-primary tracking-tight flex items-center gap-2">
                <LineChart className="w-4 h-4 text-blue-500" />
                Quiz Performance
              </h3>
              <p className="text-xs text-text-muted mt-0.5">Your quiz scores over time</p>
            </div>
            <span className="text-[11px] font-mono text-text-muted bg-surface-muted px-2 py-0.5 rounded-md border border-border">
              Recent Attempts
            </span>
          </div>

          {quiz_performance_trend.length > 0 ? (
            <div className="pt-2">
              <div className="w-full h-44 relative">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 500 150" preserveAspectRatio="none">
                  {/* Grid lines */}
                  {[0, 25, 50, 75, 100].map((level) => {
                    const y = 135 - (level / 100) * 120;
                    return (
                      <g key={level}>
                        <line
                          x1="30"
                          y1={y}
                          x2="490"
                          y2={y}
                          className="stroke-border"
                          strokeDasharray={level === 70 ? "4 4" : "2 2"}
                          strokeWidth="1"
                        />
                        <text x="5" y={y + 3} className="fill-text-muted" fontSize="9" fontFamily="monospace">
                          {level}
                        </text>
                      </g>
                    );
                  })}

                  {/* Line Path */}
                  {(() => {
                    const width = 460;
                    const items = quiz_performance_trend.slice(-10);
                    const step = items.length > 1 ? width / (items.length - 1) : width;
                    const coords = items.map((q, idx) => ({
                      x: 30 + idx * step,
                      y: 135 - (q.score_percentage / 100) * 120,
                      score: q.score_percentage,
                      date: q.completed_at
                        ? new Date(q.completed_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })
                        : `Attempt #${idx + 1}`,
                    }));

                    const lineD = coords.reduce(
                      (acc, c, idx) => (idx === 0 ? `M ${c.x} ${c.y}` : `${acc} L ${c.x} ${c.y}`),
                      ""
                    );

                    return (
                      <>
                        <path
                          d={lineD}
                          fill="none"
                          stroke="#3b82f6"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        {coords.map((c, idx) => (
                          <g key={idx} className="cursor-pointer group">
                            <circle
                              cx={c.x}
                              cy={c.y}
                              r="4"
                              fill="#2563eb"
                              stroke="currentColor"
                              className="stroke-surface group-hover:r-6 transition-all"
                              strokeWidth="1.5"
                            />
                            <text
                              x={c.x}
                              y={c.y - 8}
                              textAnchor="middle"
                              className="fill-text-primary"
                              fontSize="10"
                              fontWeight="bold"
                              fontFamily="sans-serif"
                            >
                              {c.score}%
                            </text>
                          </g>
                        ))}
                      </>
                    );
                  })()}
                </svg>

                {/* X-axis labels */}
                <div className="flex justify-between pl-8 pr-2 pt-2 text-[10px] text-text-muted font-mono">
                  {quiz_performance_trend.slice(-10).map((q, idx) => (
                    <span key={idx}>
                      {q.completed_at
                        ? new Date(q.completed_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })
                        : `#${idx + 1}`}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-10 text-center flex flex-col items-center">
              <HelpCircle className="w-8 h-8 text-text-muted mb-2" />
              <div className="text-xs font-bold text-text-primary">No quiz results yet</div>
              <p className="text-[11px] text-text-muted mt-1 max-w-sm">
                Complete your first quiz to see your performance.
              </p>
              {onNavigateTab && (
                <button
                  onClick={() => onNavigateTab("quiz")}
                  className="mt-3 px-3.5 py-1.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Start Quiz
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Performance Summary Tiles (4 cols) */}
        <div className="lg:col-span-4 p-6 rounded-2xl bg-surface border border-border shadow-sm space-y-3">
          <div className="pb-3 border-b border-border">
            <h3 className="text-sm font-bold text-text-primary tracking-tight">Performance Summary</h3>
            <p className="text-xs text-text-muted mt-0.5">High-level quiz benchmarks</p>
          </div>

          <div className="space-y-2.5">
            {/* Average Score */}
            <div className="p-3 rounded-xl bg-surface-muted border border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  <Trophy className="w-4 h-4" />
                </div>
                <span className="text-xs text-text-secondary font-medium">Average Score</span>
              </div>
              <span className="font-mono font-bold text-text-primary text-sm">
                {avgScore !== null ? `${avgScore}%` : "—"}
              </span>
            </div>

            {/* Completed Attempts */}
            <div className="p-3 rounded-xl bg-surface-muted border border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <span className="text-xs text-text-secondary font-medium">Completed Attempts</span>
              </div>
              <span className="font-mono font-bold text-text-primary text-sm">{quizzesCompletedCount}</span>
            </div>

            {/* Highest Score */}
            <div className="p-3 rounded-xl bg-surface-muted border border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
                <span className="text-xs text-text-secondary font-medium">Highest Score</span>
              </div>
              <span className="font-mono font-bold text-emerald-500 text-sm">
                {highestScore !== null ? `${highestScore}%` : "—"}
              </span>
            </div>

            {/* Lowest Score */}
            <div className="p-3 rounded-xl bg-surface-muted border border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-rose-500/10 text-rose-500 border border-rose-500/20">
                  <ArrowDownRight className="w-4 h-4" />
                </div>
                <span className="text-xs text-text-secondary font-medium">Lowest Score</span>
              </div>
              <span className="font-mono font-bold text-text-secondary text-sm">
                {lowestScore !== null ? `${lowestScore}%` : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* 5. ROW 3: TOPIC MASTERY DISTRIBUTION & WEAKEST TOPICS (2 COLS)  */}
      {/* ================================================================ */}
      <div id="topic-mastery-section" className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Topic Mastery Distribution (6 cols) */}
        <div className="lg:col-span-6 p-6 rounded-2xl bg-surface border border-border shadow-sm space-y-4">
          <div className="pb-3 border-b border-border">
            <h3 className="text-sm font-bold text-text-primary tracking-tight flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-500" />
              Topic Mastery Distribution
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              Distribution of concepts by mastery level
            </p>
          </div>

          <div className="space-y-3.5 pt-1">
            {/* Mastered */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-text-secondary font-medium">Mastered (&ge;70%)</span>
                <span className="text-emerald-500 font-mono font-bold">
                  {masteredCount} ({masteredPct}%)
                </span>
              </div>
              <div className="w-full bg-surface-muted h-2 rounded-full overflow-hidden border border-border">
                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${masteredPct}%` }} />
              </div>
            </div>

            {/* Building */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-text-secondary font-medium">Building (50&ndash;69%)</span>
                <span className="text-sky-500 font-mono font-bold">
                  {stableCount} ({stablePct}%)
                </span>
              </div>
              <div className="w-full bg-surface-muted h-2 rounded-full overflow-hidden border border-border">
                <div className="bg-sky-500 h-full rounded-full" style={{ width: `${stablePct}%` }} />
              </div>
            </div>

            {/* Needs Practice */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-text-secondary font-medium">Needs Practice (&lt;50%)</span>
                <span className="text-amber-500 font-mono font-bold">
                  {needsAttentionCount} ({needsAttentionPct}%)
                </span>
              </div>
              <div className="w-full bg-surface-muted h-2 rounded-full overflow-hidden border border-border">
                <div className="bg-amber-500 h-full rounded-full" style={{ width: `${needsAttentionPct}%` }} />
              </div>
            </div>

            {/* Not Assessed */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-text-muted font-medium">Not Yet Assessed</span>
                <span className="text-text-muted font-mono font-bold">
                  {unassessedCount} ({unassessedPct}%)
                </span>
              </div>
              <div className="w-full bg-surface-muted h-2 rounded-full overflow-hidden border border-border">
                <div className="bg-slate-400 h-full rounded-full" style={{ width: `${unassessedPct}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Topics That Need More Practice (6 cols) */}
        <div className="lg:col-span-6 p-6 rounded-2xl bg-surface border border-border shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div>
              <h3 className="text-sm font-bold text-text-primary tracking-tight flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                Topics That Need More Practice
              </h3>
              <p className="text-xs text-text-muted mt-0.5">Topics that need more attention</p>
            </div>
            {weakTopics.length > 0 && (
              <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                {weakTopics.length} topics
              </span>
            )}
          </div>

          {weakTopics.length > 0 ? (
            <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
              {weakTopics.map((c) => (
                <div
                  key={c.concept_id}
                  className="p-3 rounded-xl bg-surface-muted border border-border flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-text-primary truncate">{c.concept_name}</div>
                    <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium mt-0.5">
                      Needs Practice &bull; {c.latest_score !== null ? `${Math.round(c.latest_score)}% mastery` : "Unassessed"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="font-mono font-bold text-amber-500 text-xs">
                      {c.latest_score !== null ? `${Math.round(c.latest_score)}%` : "—"}
                    </span>
                    {onNavigateTab && (
                      <button
                        onClick={() => onNavigateTab("quiz")}
                        className="px-2.5 py-1 rounded-lg bg-surface hover:bg-amber-500/15 text-text-secondary hover:text-amber-600 dark:hover:text-amber-400 border border-border text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        Practice &rarr;
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-text-muted">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <div className="font-semibold text-text-primary">Great job!</div>
              <p className="mt-1">No topics currently below 50% mastery.</p>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* 6. ROW 4: AI TUTOR USAGE & ENCOURAGEMENT (2 COLUMNS)             */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left: AI Tutor Usage (8 cols) */}
        <div className="lg:col-span-8 p-5 rounded-2xl bg-surface border border-border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-indigo-600/15 text-accent border border-indigo-500/25 flex items-center justify-center shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-text-primary">AI Tutor Usage</h4>
              <p className="text-xs text-text-muted mt-0.5">Interaction and grounding telemetry</p>
            </div>
          </div>

          <div className="flex items-center gap-6 text-xs">
            <div>
              <div className="text-lg font-bold text-text-primary font-mono">
                {tutor_interaction_counts.total_messages}
              </div>
              <div className="text-[10px] text-text-muted">Total questions</div>
            </div>
            <div>
              <div className="text-lg font-bold text-emerald-500 font-mono">{groundedPct}%</div>
              <div className="text-[10px] text-text-muted">Grounded answers</div>
            </div>
            <div>
              <div className="text-lg font-bold text-accent font-mono">
                {tutor_interaction_counts.total_conversations}
              </div>
              <div className="text-[10px] text-text-muted">Study sessions</div>
            </div>
          </div>
        </div>

        {/* Right: Keep Asking! (4 cols) */}
        <div className="lg:col-span-4 p-5 rounded-2xl bg-surface border border-border shadow-sm flex flex-col justify-between gap-3">
          <div>
            <h4 className="text-xs font-bold text-text-primary">Keep Asking!</h4>
            <p className="text-[11px] text-text-muted mt-1 leading-relaxed">
              The AI Tutor is here to help you understand difficult concepts.
            </p>
          </div>
          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab("tutor")}
              className="px-3.5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow-md shadow-accent/25 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              Ask a Question &rarr;
            </button>
          )}
        </div>
      </div>

      {/* Footer Quote */}
      <div className="text-center pt-4 pb-2 text-xs text-text-muted italic">
        &ldquo;Data turns effort into insight, and insight into progress.&rdquo;
      </div>
    </div>
  );
};
