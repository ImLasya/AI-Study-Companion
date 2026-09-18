/**
 * AnalyticsTab — EduMind Learning Analytics Dashboard
 *
 * Matching reference image: media_1789736972416.jpg
 *
 * Provides all 3 portions seamlessly laid out on one scrolling page:
 *
 * 1. Overview & Study Activity (Left Large Portion)
 *    - Breadcrumbs: Spaces > Deep learning > Neural networks and transformers > Analytics
 *    - Project Header Card: [NN] Neural networks and transformers, space subtitle, date range, Switch Project
 *    - Pill Tabs: Overview | Quiz Performance | Concept Mastery | Activity & Engagement (smooth auto-scrolling & active observer)
 *    - Top 4 Metric Cards: Study Days (2, ^ 33%), Materials Studied (2), Quizzes Completed (5, Avg 44%), AI Tutor Sessions (4, 18 questions)
 *    - Your Study Activity Card: 30-day multi-colored activity bar chart (Quiz Attempts, AI Tutor, Materials)
 *    - 2-Column Row: Time Distribution Donut Chart (79 Actions) & Performance Summary benchmarks (Avg 44%, Highest 60%, Lowest 20%)
 *    - Motivational Banner: "Data turns effort into insight, and insight into progress."
 *
 * 2. Quiz Performance (Top-Right Portion)
 *    - Section Header with calendar icon, "Quiz Performance", subtitle, and "Last 30 days v"
 *    - 4 Metric Cards: Total Attempts (5), Average Score (44%), Highest Score (60%), Lowest Score (20%)
 *    - Quiz Scores Over Time: Line chart with percentage badges (20%, 60%, 60%, 40%, 40%)
 *    - 2-Column Row: Score Distribution (5 buckets) & Top Performing Topics (ranked 1-5 with colored bars)
 *
 * 3. Concept Mastery & Grounded Practice (Bottom-Right Portion)
 *    - Section Header with graph icon, "Concept Mastery", subtitle, and "All Concepts v"
 *    - Ranked Concept Mastery List: numbered circles (1-5), concept name, percentage, colored bar, and status pills
 *    - 2-Column Row: Topic Mastery Distribution (Mastered 2, Building 0, Needs Practice 6) & Topics That Need More Practice with [ Practice -> ]
 *    - AI Tutor Usage (18 questions, 50% grounded, 4 sessions) & Keep Asking! card with [ Ask a Question -> ]
 *    - Motivational Banner: "Mastery is a journey, not a destination." with mountain trail illustration
 *
 * Preserves 100% of telemetry data, API calls, and navigation handlers.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Award,
  BarChart3,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Compass,
  FileText,
  HelpCircle,
  LineChart,
  Loader2,
  MessageSquare,
  Sparkles,
  Target,
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
  spaceId?: string;
  onNavigateTab?: (
    tab: "overview" | "materials" | "tutor" | "quiz" | "growth" | "analytics" | "flashcards"
  ) => void;
}

// Minimalist Mountain Landscape Graphic with summit flag and trail
const MountainLandscapeSvg: React.FC = () => (
  <svg
    viewBox="0 0 280 120"
    className="w-48 sm:w-64 h-auto shrink-0 select-none pointer-events-none opacity-90 dark:opacity-75"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient id="anMtnGrad1" x1="190" y1="30" x2="190" y2="120" gradientUnits="userSpaceOnUse">
        <stop stopColor="#C7D2FE" />
        <stop offset="1" stopColor="#E0E7FF" stopOpacity="0.2" />
      </linearGradient>
      <linearGradient id="anMtnGrad2" x1="130" y1="40" x2="130" y2="120" gradientUnits="userSpaceOnUse">
        <stop stopColor="#A5B4FC" />
        <stop offset="1" stopColor="#C7D2FE" stopOpacity="0.3" />
      </linearGradient>
      <linearGradient id="anMtnGrad3" x1="220" y1="15" x2="220" y2="120" gradientUnits="userSpaceOnUse">
        <stop stopColor="#818CF8" />
        <stop offset="1" stopColor="#C7D2FE" stopOpacity="0.4" />
      </linearGradient>
    </defs>
    <path d="M 120 120 L 190 32 L 260 120 Z" fill="url(#anMtnGrad1)" />
    <path d="M 50 120 L 130 42 L 210 120 Z" fill="url(#anMtnGrad2)" />
    <path d="M 140 120 L 220 18 L 280 120 Z" fill="url(#anMtnGrad3)" />
    <line x1="220" y1="18" x2="220" y2="5" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" />
    <path d="M 220 5 L 236 10 L 220 15 Z" fill="#4F46E5" />
    <path
      d="M 70 120 Q 120 95 145 82 T 185 52 T 220 18"
      stroke="white"
      strokeWidth="2"
      strokeDasharray="4 3"
      strokeLinecap="round"
      fill="none"
      opacity="0.9"
    />
  </svg>
);

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({
  projectId,
  project,
  spaceName,
  spaceId,
  onNavigateTab,
}) => {
  const [data, setData] = useState<ProjectAnalyticsResponse | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [allProjects, setAllProjects] = useState<{ id: string; name: string; spaceName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active Pill Tab (tracks scroll position or manual click)
  const [activeTab, setActiveTab] = useState<"overview" | "quiz" | "concepts" | "activity">("overview");
  const [timeRange, setTimeRange] = useState<string>("30d");
  const [conceptFilter, setConceptFilter] = useState<string>("all");
  const [showProjectSwitcher, setShowProjectSwitcher] = useState(false);

  // Section references for smooth scrolling & intersection observing
  const overviewRef = useRef<HTMLDivElement>(null);
  const quizRef = useRef<HTMLDivElement>(null);
  const conceptsRef = useRef<HTMLDivElement>(null);
  const activityRef = useRef<HTMLDivElement>(null);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const [analyticsRes, matsRes, globRes] = await Promise.all([
        getProjectAnalyticsApi(projectId).catch(() => null),
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

  // Immediate state reset when projectId changes
  useEffect(() => {
    setData(null);
    setMaterials([]);
    setLoading(true);
    setError(null);
  }, [projectId]);

  useEffect(() => {
    fetchAnalytics();
  }, [projectId]);

  // Smooth scroll to section when tab pill is clicked
  const handleTabClick = (tabKey: "overview" | "quiz" | "concepts" | "activity") => {
    setActiveTab(tabKey);
    let targetEl: HTMLElement | null = null;
    if (tabKey === "overview") targetEl = overviewRef.current;
    if (tabKey === "quiz") targetEl = quizRef.current;
    if (tabKey === "concepts") targetEl = conceptsRef.current;
    if (tabKey === "activity") targetEl = activityRef.current;

    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Scroll listener to update active tab pill automatically as user scrolls
  useEffect(() => {
    const handleScroll = () => {
      const scrollPos = window.scrollY + 200;

      if (activityRef.current && scrollPos >= activityRef.current.offsetTop) {
        setActiveTab("activity");
      } else if (conceptsRef.current && scrollPos >= conceptsRef.current.offsetTop) {
        setActiveTab("concepts");
      } else if (quizRef.current && scrollPos >= quizRef.current.offsetTop) {
        setActiveTab("quiz");
      } else {
        setActiveTab("overview");
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Project Initials helper
  const getInitials = (name?: string) => {
    if (!name) return "P";
    const parts = name.split(" ");
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  // -------------------------------------------------------------------------
  // Metrics & Derived Analytics (from real API response)
  // -------------------------------------------------------------------------
  const projectName = project?.name || "Project";
  const spaceDisplayName = spaceName || "Space";

  const studyDays = data?.active_days_past_30 ?? 0;
  const materialsCount = materials.length;
  const quizTrend = data?.quiz_performance_trend || [];
  const quizzesCompleted = quizTrend.length;
  const avgQuizScore =
    quizTrend.length > 0
      ? Math.round(quizTrend.reduce((acc, q) => acc + q.score_percentage, 0) / quizTrend.length)
      : null;
  const highestQuizScore =
    quizTrend.length > 0
      ? Math.max(...quizTrend.map((q) => Math.round(q.score_percentage)))
      : null;
  const lowestQuizScore =
    quizTrend.length > 0
      ? Math.min(...quizTrend.map((q) => Math.round(q.score_percentage)))
      : null;

  const tutorSessions = data?.tutor_interaction_counts?.total_conversations ?? 0;
  const tutorQuestions = data?.tutor_interaction_counts?.total_messages ?? 0;
  const groundedRate =
    data?.tutor_interaction_counts && data.tutor_interaction_counts.total_messages > 0
      ? Math.round(
          (data.tutor_interaction_counts.assistant_messages / data.tutor_interaction_counts.total_messages) * 100
        )
      : null;

  // Time Distribution (Quizzes, AI Tutor, Materials)
  const quizActions = quizzesCompleted;
  const tutorActions = tutorQuestions;
  const materialActions = materialsCount;
  const totalActions = quizActions + tutorActions + materialActions;

  const quizPct = totalActions > 0 ? Math.round((quizActions / totalActions) * 100) : 0;
  const tutorPct = totalActions > 0 ? Math.round((tutorActions / totalActions) * 100) : 0;
  const materialPct = totalActions > 0 ? Math.max(0, 100 - quizPct - tutorPct) : 0;

  // Recent quiz trend line points
  const quizScores = useMemo(() => {
    if (data?.quiz_performance_trend && data.quiz_performance_trend.length > 0) {
      return data.quiz_performance_trend.slice(-7).map((q) => ({
        score: Math.round(q.score_percentage),
        date: q.completed_at
          ? new Date(q.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "Recent",
      }));
    }
    return [];
  }, [data]);

  // Score distribution buckets
  const scoreBuckets = useMemo(() => {
    const buckets = [
      { label: "0-20%", count: 0 },
      { label: "21-40%", count: 0 },
      { label: "41-60%", count: 0 },
      { label: "61-80%", count: 0 },
      { label: "81-100%", count: 0 },
    ];
    quizTrend.forEach((q) => {
      const s = q.score_percentage;
      if (s <= 20) buckets[0].count++;
      else if (s <= 40) buckets[1].count++;
      else if (s <= 60) buckets[2].count++;
      else if (s <= 80) buckets[3].count++;
      else buckets[4].count++;
    });
    return buckets;
  }, [quizTrend]);

  // Top Performing Topics
  const topTopics = useMemo(() => {
    if (!data?.concept_trends || data.concept_trends.length === 0) return [];
    return data.concept_trends
      .filter((c) => c.latest_score !== null && c.latest_score > 0)
      .sort((a, b) => (b.latest_score ?? 0) - (a.latest_score ?? 0))
      .slice(0, 5)
      .map((c, idx) => ({
        rank: idx + 1,
        name: c.concept_name,
        score: Math.round(c.latest_score ?? 0),
        barColor:
          (c.latest_score ?? 0) >= 70
            ? "bg-emerald-500"
            : (c.latest_score ?? 0) >= 50
            ? "bg-sky-500"
            : "bg-amber-500",
      }));
  }, [data?.concept_trends]);

  // Ranked Concept Mastery List
  const rankedConcepts = useMemo(() => {
    if (!data?.concept_trends || data.concept_trends.length === 0) return [];
    let list = data.concept_trends;
    if (conceptFilter === "mastered") {
      list = list.filter((c) => (c.latest_score ?? 0) >= 70);
    } else if (conceptFilter === "needs_practice") {
      list = list.filter(
        (c) => c.status === "needs_attention" || ((c.latest_score ?? 0) < 50 && c.latest_score !== null)
      );
    }
    return list.map((c, idx) => {
      const score = c.latest_score !== null ? Math.round(c.latest_score) : 0;
      const isMastered = (c.latest_score ?? 0) >= 70;
      return {
        rank: idx + 1,
        name: c.concept_name,
        score,
        status: isMastered ? "Mastered" : "Needs Practice",
        statusType: isMastered ? "mastered" : "needs_practice",
        color: isMastered ? "bg-emerald-500" : score > 0 ? "bg-amber-500" : "bg-slate-200 dark:bg-slate-700",
      };
    });
  }, [data?.concept_trends, conceptFilter]);

  // Topics Needing Practice
  const practiceTopics = useMemo(() => {
    if (!data?.concept_trends || data.concept_trends.length === 0) return [];
    return data.concept_trends
      .filter((c) => c.status === "needs_attention" || (c.latest_score !== null && c.latest_score < 50))
      .slice(0, 5)
      .map((c) => ({
        name: c.concept_name,
        score: c.latest_score !== null ? Math.round(c.latest_score) : 0,
      }));
  }, [data?.concept_trends]);

  // Derived study activity from real telemetry
  const activityItems = useMemo(() => {
    if (!data?.learning_activity || data.learning_activity.length === 0) {
      return [];
    }
    return data.learning_activity.slice(-7).map((bucket) => {
      const breakdown = bucket.event_breakdown || {};
      let quiz = 0;
      let tutor = 0;
      let mat = 0;
      Object.entries(breakdown).forEach(([k, v]) => {
        const kl = k.toLowerCase();
        if (kl.includes("quiz")) quiz += v;
        else if (kl.includes("tutor") || kl.includes("chat")) tutor += v;
        else if (kl.includes("material") || kl.includes("document")) mat += v;
        else quiz += v;
      });
      const d = bucket.date
        ? new Date(bucket.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : "";
      return { date: d, quiz, tutor, mat, total: bucket.event_count || quiz + tutor + mat };
    });
  }, [data?.learning_activity]);

  // Topic Mastery Distribution calculation
  const distribution = data?.current_mastery_distribution;
  const distTotal =
    (distribution?.mastered ?? 0) +
    (distribution?.stable ?? 0) +
    (distribution?.needs_attention ?? 0) +
    (distribution?.unassessed ?? 0);
  const masteredCount = distribution?.mastered ?? 0;
  const buildingCount = distribution?.stable ?? 0;
  const needsAttentionCount = distribution?.needs_attention ?? 0;
  const unassessedCount = distribution?.unassessed ?? 0;

  const masteredPct = distTotal > 0 ? Math.round((masteredCount / distTotal) * 100) : 0;
  const buildingPct = distTotal > 0 ? Math.round((buildingCount / distTotal) * 100) : 0;
  const needsAttentionPct = distTotal > 0 ? Math.round((needsAttentionCount / distTotal) * 100) : 0;
  const unassessedPct = distTotal > 0 ? Math.round((unassessedCount / distTotal) * 100) : 0;

  // Donut chart stroke dashes
  const quizDash = totalActions > 0 ? (quizPct / 100) * 238.8 : 0;
  const tutorDash = totalActions > 0 ? (tutorPct / 100) * 238.8 : 0;
  const materialDash = totalActions > 0 ? (materialPct / 100) * 238.8 : 0;

  if (loading && !data) {
    return (
      <div className="min-h-[420px] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#4F46E5]" />
        <span className="text-xs text-slate-500 font-medium">Loading Analytics telemetry...</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-[420px] flex flex-col items-center justify-center gap-4 text-center p-6 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700">
        <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>
        <button
          type="button"
          onClick={() => fetchAnalytics()}
          className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* ==================================================================== */}
      {/* 1. BREADCRUMBS & TOP HEADER                                          */}
      {/* ==================================================================== */}
      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <Link to="/spaces" className="hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
          Spaces
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        {spaceId ? (
          <Link to={`/spaces/${spaceId}`} className="hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
            {spaceDisplayName}
          </Link>
        ) : (
          <span className="hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
            {spaceDisplayName}
          </span>
        )}
        <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <button
          type="button"
          onClick={() => onNavigateTab && onNavigateTab("overview")}
          className="hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer truncate"
        >
          {projectName}
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="text-[#0F172A] dark:text-white font-bold">Analytics</span>
        {activeTab === "quiz" && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-[#4F46E5] dark:text-indigo-400 font-bold">Quiz Performance</span>
          </>
        )}
        {activeTab === "concepts" && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-[#4F46E5] dark:text-indigo-400 font-bold">Concept Mastery</span>
          </>
        )}
      </div>

      {/* ==================================================================== */}
      {/* 2. LARGE WHITE PROJECT HEADER CARD                                   */}
      {/* ==================================================================== */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700 p-6 sm:p-7 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Square NN Icon */}
          <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-[#EEF2FF] dark:bg-indigo-950/60 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center font-bold text-base shadow-2xs shrink-0">
            {getInitials(projectName)}
          </div>

          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-white tracking-tight">
                {projectName}
              </h1>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                Space: {spaceDisplayName}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Detailed insights into your learning activity, quiz performance, and concept understanding.
            </p>
          </div>
        </div>

        {/* Right Controls: Date Range Dropdown & Switch Project */}
        <div className="flex items-center gap-2.5 self-start md:self-auto shrink-0 flex-wrap">
          {/* Date Range Selector */}
          <div className="relative">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="appearance-none pl-3.5 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs focus:outline-none focus:border-[#4F46E5] cursor-pointer"
            >
              <option value="7d">Last 7 days</option>
              <option value="14d">Last 14 days</option>
              <option value="30d">Last 30 days</option>
              <option value="all">All time</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Switch Project Dropdown */}
          {allProjects.length > 1 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowProjectSwitcher((p) => !p)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs transition-colors cursor-pointer"
              >
                <span>Switch Project</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {showProjectSwitcher && (
                <div className="absolute right-0 top-full mt-1.5 w-60 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl py-2 z-30 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3.5 py-1 text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                    Available Projects
                  </div>
                  {allProjects.map((p) => (
                    <Link
                      key={p.id}
                      to={`/projects/${p.id}?tab=analytics`}
                      onClick={() => setShowProjectSwitcher(false)}
                      className={`px-3.5 py-2 text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors ${
                        p.id === projectId ? "font-bold text-[#4F46E5] bg-indigo-50/50 dark:bg-indigo-950/40" : "text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      <span className="truncate">{p.name}</span>
                      {p.id === projectId && <Check className="w-3.5 h-3.5 text-[#4F46E5]" />}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. ANALYTICS PILL-STYLE TABS (Scroll Anchors)                        */}
      {/* ==================================================================== */}
      <div className="sticky top-16 z-20 bg-[#F7F9FC]/90 dark:bg-slate-900/90 backdrop-blur-md py-2.5 -my-2 border-b border-slate-200/60 dark:border-slate-800/60">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => handleTabClick("overview")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "overview"
                ? "bg-[#4F46E5] text-white shadow-sm"
                : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => handleTabClick("quiz")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "quiz"
                ? "bg-[#4F46E5] text-white shadow-sm"
                : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}
          >
            Quiz Performance
          </button>
          <button
            type="button"
            onClick={() => handleTabClick("concepts")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "concepts"
                ? "bg-[#4F46E5] text-white shadow-sm"
                : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}
          >
            Concept Mastery
          </button>
          <button
            type="button"
            onClick={() => handleTabClick("activity")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "activity"
                ? "bg-[#4F46E5] text-white shadow-sm"
                : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}
          >
            Activity &amp; Engagement
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* PORTION 1: OVERVIEW & STUDY ACTIVITY (Left Large Screenshot)        */}
      {/* ==================================================================== */}
      <div ref={overviewRef} id="overview" className="space-y-6 pt-2 scroll-mt-32">
        {/* Row of 4 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Study Days */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 p-5 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between">
            <div className="w-10 h-10 rounded-xl bg-[#EEF2FF] dark:bg-indigo-950/60 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center shadow-2xs">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="mt-4">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-bold text-[#0F172A] dark:text-white font-mono">
                  {studyDays}
                </span>
                {studyDays > 0 && (
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                    Active
                  </span>
                )}
              </div>
              <div className="text-xs font-bold text-[#0F172A] dark:text-white mt-1">
                Study Days
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Active in last 30 days</div>
            </div>
          </div>

          {/* Card 2: Materials Studied */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 p-5 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between">
            <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center shadow-2xs">
              <FileText className="w-5 h-5" />
            </div>
            <div className="mt-4">
              <div className="text-2xl sm:text-3xl font-bold text-[#0F172A] dark:text-white font-mono">
                {materialsCount}
              </div>
              <div className="text-xs font-bold text-[#0F172A] dark:text-white mt-1">
                Materials Studied
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">PDF documents</div>
            </div>
          </div>

          {/* Card 3: Quizzes Completed */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 p-5 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-2xs">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="mt-4">
              <div className="text-2xl sm:text-3xl font-bold text-[#0F172A] dark:text-white font-mono">
                {quizzesCompleted}
              </div>
              <div className="text-xs font-bold text-[#0F172A] dark:text-white mt-1">
                Quizzes Completed
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {avgQuizScore !== null ? `Avg. score: ${avgQuizScore}%` : "No quizzes completed"}
              </div>
            </div>
          </div>

          {/* Card 4: AI Tutor Sessions */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 p-5 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between">
            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shadow-2xs">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div className="mt-4">
              <div className="text-2xl sm:text-3xl font-bold text-[#0F172A] dark:text-white font-mono">
                {tutorSessions}
              </div>
              <div className="text-xs font-bold text-[#0F172A] dark:text-white mt-1">
                AI Tutor Sessions
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {tutorQuestions} {tutorQuestions === 1 ? "question" : "questions"} asked
              </div>
            </div>
          </div>
        </div>

        {/* Your Study Activity Bar Chart Card */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700 p-6 shadow-2xs space-y-4 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#EEF2FF] dark:bg-indigo-950/60 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[#0F172A] dark:text-white">
                  Your Study Activity
                </h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  Learning activity across the last 30 days
                </p>
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs font-semibold">
              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6]" />
                <span>Quiz Attempts</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]" />
                <span>AI Tutor</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                <span>Materials</span>
              </div>
            </div>
          </div>

          {/* SVG Activity Multi-Bar Chart */}
          <div className="pt-4 pb-2">
            {activityItems.length === 0 ? (
              <div className="h-56 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
                <Activity className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No study activity recorded yet</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Activity will appear here as you read materials, ask the AI Tutor questions, and take quizzes.
                </p>
              </div>
            ) : (
              <div className="w-full h-56 relative">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 600 190" preserveAspectRatio="none">
                  {/* Horizontal Grid lines */}
                  {[20, 15, 10, 5, 0].map((val) => {
                    const y = 20 + ((20 - val) / 20) * 130;
                    return (
                      <g key={val}>
                        <text x="10" y={y + 3} fill="#94A3B8" fontSize="10" fontFamily="monospace">
                          {val}
                        </text>
                        <line
                          x1="35"
                          y1={y}
                          x2="590"
                          y2={y}
                          stroke="#E2E8F0"
                          className="dark:stroke-slate-700"
                          strokeDasharray={val === 0 ? "none" : "3 3"}
                          strokeWidth="1"
                        />
                      </g>
                    );
                  })}

                  {activityItems.map((item, idx) => {
                    const step = Math.min(78, 520 / Math.max(1, activityItems.length));
                    const xCenter = 70 + idx * step;
                    const baseY = 150;
                    const totalH = Math.min(130, (item.mat + item.tutor + item.quiz) * 6.5);
                    const matH = item.mat * 6.5;
                    const tutH = item.tutor * 6.5;
                    const qzH = item.quiz * 6.5;

                    return (
                      <g key={idx} className="group/bar cursor-pointer">
                        {/* Stacked bar segments */}
                        {/* Base: Quizzes (Purple) */}
                        {qzH > 0 && (
                          <rect
                            x={xCenter - 7}
                            y={baseY - qzH}
                            width="14"
                            height={qzH}
                            rx="3"
                            fill="#8B5CF6"
                            className="transition-all hover:opacity-80"
                          />
                        )}
                        {/* Mid: Tutor (Blue) */}
                        {tutH > 0 && (
                          <rect
                            x={xCenter - 7}
                            y={baseY - qzH - tutH}
                            width="14"
                            height={tutH}
                            rx="3"
                            fill="#3B82F6"
                            className="transition-all hover:opacity-80"
                          />
                        )}
                        {/* Top: Materials (Teal/Emerald) */}
                        {matH > 0 && (
                          <rect
                            x={xCenter - 7}
                            y={baseY - totalH}
                            width="14"
                            height={matH}
                            rx="3"
                            fill="#10B981"
                            className="transition-all hover:opacity-80"
                          />
                        )}

                        {/* X-axis date label */}
                        <text x={xCenter} y="172" fill="#94A3B8" fontSize="10" textAnchor="middle">
                          {item.date}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* 2-Column Row: Time Distribution & Performance Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Time Distribution Donut Chart */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700 p-6 shadow-2xs space-y-4 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-700/60">
                <div className="w-8 h-8 rounded-xl bg-[#EEF2FF] dark:bg-indigo-950/60 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">Time Distribution</h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500">How you spend your study time</p>
                </div>
              </div>

              {/* Donut Chart + Legend */}
              <div className="pt-6 pb-2 flex flex-col sm:flex-row sm:items-center justify-around gap-6">
                {/* Donut Graphic */}
                <div className="relative w-36 h-36 mx-auto sm:mx-0 flex items-center justify-center shrink-0">
                  <svg className="w-36 h-36 -rotate-90 transform" viewBox="0 0 100 100">
                    {/* Circle Radius: 38, Circumference ~ 238.76 */}
                    {totalActions === 0 ? (
                      <circle
                        cx="50"
                        cy="50"
                        r="38"
                        stroke="#E2E8F0"
                        strokeWidth="11"
                        fill="transparent"
                        className="dark:stroke-slate-700"
                      />
                    ) : (
                      <>
                        {/* Quizzes */}
                        {quizDash > 0 && (
                          <circle
                            cx="50"
                            cy="50"
                            r="38"
                            stroke="#8B5CF6"
                            strokeWidth="11"
                            fill="transparent"
                            strokeDasharray={`${quizDash} 238.8`}
                            strokeDashoffset="0"
                          />
                        )}
                        {/* AI Tutor */}
                        {tutorDash > 0 && (
                          <circle
                            cx="50"
                            cy="50"
                            r="38"
                            stroke="#3B82F6"
                            strokeWidth="11"
                            fill="transparent"
                            strokeDasharray={`${tutorDash} 238.8`}
                            strokeDashoffset={`${-quizDash}`}
                          />
                        )}
                        {/* Materials */}
                        {materialDash > 0 && (
                          <circle
                            cx="50"
                            cy="50"
                            r="38"
                            stroke="#10B981"
                            strokeWidth="11"
                            fill="transparent"
                            strokeDasharray={`${materialDash} 238.8`}
                            strokeDashoffset={`${-(quizDash + tutorDash)}`}
                          />
                        )}
                      </>
                    )}
                  </svg>
                  <div className="absolute text-center">
                    <div className="text-2xl font-bold font-mono text-[#0F172A] dark:text-white">
                      {totalActions}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                      Actions
                    </div>
                  </div>
                </div>

                {/* Legend List */}
                <div className="space-y-3 text-xs w-full max-w-[200px]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6]" />
                      <span className="font-semibold text-slate-700 dark:text-slate-200">Quizzes</span>
                    </div>
                    <span className="font-mono text-slate-500 dark:text-slate-400">
                      {quizActions} ({quizPct}%)
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]" />
                      <span className="font-semibold text-slate-700 dark:text-slate-200">AI Tutor</span>
                    </div>
                    <span className="font-mono text-slate-500 dark:text-slate-400">
                      {tutorActions} ({tutorPct}%)
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                      <span className="font-semibold text-slate-700 dark:text-slate-200">Materials</span>
                    </div>
                    <span className="font-mono text-slate-500 dark:text-slate-400">
                      {materialActions} ({materialPct}%)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Performance Summary Card */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700 p-6 shadow-2xs space-y-4 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-700/60">
                <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Trophy className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">Performance Summary</h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500">High-level quiz benchmarks</p>
                </div>
              </div>

              {/* 4 Horizontal Metric Rows */}
              <div className="space-y-2.5 pt-3">
                {/* Row 1: Average Score */}
                <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-750/50 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                      <Trophy className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Average Score</span>
                  </div>
                  <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                    {avgQuizScore !== null ? `${avgQuizScore}%` : "—"}
                  </span>
                </div>

                {/* Row 2: Completed Attempts */}
                <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-750/50 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Completed Attempts</span>
                  </div>
                  <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                    {quizzesCompleted}
                  </span>
                </div>

                {/* Row 3: Highest Score */}
                <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-750/50 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Highest Score</span>
                  </div>
                  <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                    {highestQuizScore !== null ? `${highestQuizScore}%` : "—"}
                  </span>
                </div>

                {/* Row 4: Lowest Score */}
                <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-750/50 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                      <ArrowDownRight className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Lowest Score</span>
                  </div>
                  <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                    {lowestQuizScore !== null ? `${lowestQuizScore}%` : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Motivational Banner 1 */}
        <div className="bg-gradient-to-r from-[#EFF1FE] via-[#F4F2FE] to-[#F9F7FF] dark:from-slate-900 dark:via-indigo-950/30 dark:to-slate-900 border border-[#E0E7FF] dark:border-indigo-500/20 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-2xs hover:shadow-sm transition-all duration-200">
          <div className="space-y-2 max-w-lg">
            <span className="text-2xl text-[#4F46E5] dark:text-indigo-400 font-serif leading-none block">
              &ldquo;
            </span>
            <h3 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-white leading-snug">
              &ldquo;Data turns effort into insight, and insight into progress.&rdquo;
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
              Keep learning, keep growing!
            </p>
          </div>
          <MountainLandscapeSvg />
        </div>
      </div>

      {/* ==================================================================== */}
      {/* PORTION 2: QUIZ PERFORMANCE (Top-Right Screenshot)                  */}
      {/* ==================================================================== */}
      <div ref={quizRef} id="quiz-performance" className="space-y-6 pt-6 border-t border-slate-200/80 dark:border-slate-800 scroll-mt-32">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#EEF2FF] dark:bg-indigo-950/60 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-2xs">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-white tracking-tight">
                Quiz Performance
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Your quiz scores over time and topic-wise insights.
              </p>
            </div>
          </div>

          <div className="relative shrink-0 self-start sm:self-auto">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="appearance-none pl-3.5 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs focus:outline-none focus:border-[#4F46E5] cursor-pointer"
            >
              <option value="30d">Last 30 days</option>
              <option value="14d">Last 14 days</option>
              <option value="7d">Last 7 days</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* 4 Quiz Stat Cards in One Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Stat 1: Total Attempts */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 p-5 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 shadow-2xs">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[#0F172A] dark:text-white font-mono">
                {quizzesCompleted}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Total Attempts</div>
            </div>
          </div>

          {/* Stat 2: Average Score */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 p-5 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-[#EEF2FF] dark:bg-indigo-950/60 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-2xs">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[#0F172A] dark:text-white font-mono">
                {avgQuizScore !== null ? `${avgQuizScore}%` : "—"}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Average Score</div>
            </div>
          </div>

          {/* Stat 3: Highest Score */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 p-5 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-2xs">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[#0F172A] dark:text-white font-mono">
                {highestQuizScore !== null ? `${highestQuizScore}%` : "—"}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Highest Score</div>
            </div>
          </div>

          {/* Stat 4: Lowest Score */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 p-5 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 shadow-2xs">
              <ArrowDownRight className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[#0F172A] dark:text-white font-mono">
                {lowestQuizScore !== null ? `${lowestQuizScore}%` : "—"}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Lowest Score</div>
            </div>
          </div>
        </div>

        {/* Large Line Chart: Quiz Scores Over Time */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700 p-6 shadow-2xs space-y-4 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#EEF2FF] dark:bg-indigo-950/60 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center shrink-0">
                <LineChart className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[#0F172A] dark:text-white">
                  Quiz Scores Over Time
                </h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  Your performance across recent attempts
                </p>
              </div>
            </div>

            <div className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Recent Attempts
            </div>
          </div>

          {/* SVG Line Graph */}
          <div className="pt-4 pb-2">
            {quizScores.length === 0 ? (
              <div className="h-56 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
                <LineChart className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No quiz attempts recorded yet</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Complete quizzes in this project to see your score trajectory and trend analysis.
                </p>
              </div>
            ) : (
              <div className="w-full h-56 relative">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 580 185" preserveAspectRatio="none">
                  {/* Horizontal Grid lines */}
                  {[100, 75, 50, 25, 0].map((val) => {
                    const y = 20 + ((100 - val) / 100) * 130;
                    return (
                      <g key={val}>
                        <text x="10" y={y + 3} fill="#94A3B8" fontSize="10" fontFamily="monospace">
                          {val}
                        </text>
                        <line
                          x1="38"
                          y1={y}
                          x2="570"
                          y2={y}
                          stroke="#E2E8F0"
                          className="dark:stroke-slate-700"
                          strokeDasharray={val === 0 ? "none" : "3 3"}
                          strokeWidth="1"
                        />
                      </g>
                    );
                  })}

                  {/* Line Path */}
                  {(() => {
                    const startX = 55;
                    const totalW = 490;
                    const stepX = quizScores.length > 1 ? totalW / (quizScores.length - 1) : 0;

                    const coords = quizScores.map((pt, idx) => ({
                      x: quizScores.length === 1 ? startX + totalW / 2 : startX + idx * stepX,
                      y: 20 + ((100 - pt.score) / 100) * 130,
                      score: pt.score,
                      date: pt.date,
                    }));

                    const pathD = coords.reduce(
                      (acc, c, idx) => `${acc} ${idx === 0 ? "M" : "L"} ${c.x} ${c.y}`,
                      ""
                    );

                    return (
                      <>
                        {coords.length > 1 && (
                          <path
                            d={pathD}
                            fill="none"
                            stroke="#4F46E5"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}

                        {coords.map((c, idx) => (
                          <g key={idx}>
                            <circle
                              cx={c.x}
                              cy={c.y}
                              r="4.5"
                              fill="#4F46E5"
                              stroke="white"
                              strokeWidth="2"
                              className="dark:stroke-slate-900"
                            />
                            {/* Percentage Pill floating above point */}
                            <g transform={`translate(${c.x - 17}, ${c.y - 23})`}>
                              <rect width="34" height="17" rx="8.5" fill="#4F46E5" />
                              <text
                                x="17"
                                y="12"
                                fill="white"
                                fontSize="9.5"
                                fontWeight="bold"
                                textAnchor="middle"
                                fontFamily="monospace"
                              >
                                {c.score}%
                              </text>
                            </g>
                            <text x={c.x} y="172" fill="#94A3B8" fontSize="10" textAnchor="middle">
                              {c.date}
                            </text>
                          </g>
                        ))}
                      </>
                    );
                  })()}
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* 2-Column Row: Score Distribution + Top Performing Topics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Score Distribution Column Chart */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700 p-6 shadow-2xs space-y-4 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-700/60">
                <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">Score Distribution</h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Distribution of your quiz scores</p>
                </div>
              </div>

              {/* Column Chart */}
              <div className="pt-6 pb-2 h-48 flex items-end justify-around gap-2 px-2">
                {scoreBuckets.map((b, idx) => {
                  const maxCount = Math.max(1, ...scoreBuckets.map((item) => item.count));
                  const heightPct = b.count > 0 ? (b.count / maxCount) * 100 : 4;
                  return (
                    <div key={idx} className="flex flex-col items-center gap-2 flex-1 group cursor-pointer">
                      <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                        {b.count}
                      </span>
                      <div className="w-8 sm:w-10 bg-slate-100 dark:bg-slate-700/60 h-28 rounded-t-xl overflow-hidden flex items-end">
                        <div
                          className="w-full bg-[#6366F1] hover:bg-[#4F46E5] rounded-t-xl transition-all duration-500"
                          style={{ height: `${heightPct}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-medium text-slate-400 text-center whitespace-nowrap">
                        {b.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Top Performing Topics */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700 p-6 shadow-2xs space-y-4 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-700/60">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <Award className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">Top Performing Topics</h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Topics where you score the highest</p>
                </div>
              </div>

              {/* Ranked Topic Rows */}
              <div className="space-y-3.5 pt-3">
                {topTopics.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                    No topic scores available yet.
                  </div>
                ) : (
                  topTopics.map((t) => (
                    <div key={t.rank} className="flex items-center gap-3 text-xs">
                      <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold flex items-center justify-center text-[10px] shrink-0">
                        {t.rank}
                      </span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200 truncate flex-1">
                        {t.name}
                      </span>
                      <div className="w-28 sm:w-36 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden shrink-0">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${t.barColor}`}
                          style={{ width: `${t.score}%` }}
                        />
                      </div>
                      <span className="w-9 text-right font-mono font-bold text-slate-700 dark:text-slate-300 shrink-0">
                        {t.score}%
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* PORTION 3: CONCEPT MASTERY & ENGAGEMENT (Bottom-Right Screenshot)   */}
      {/* ==================================================================== */}
      <div ref={conceptsRef} id="concept-mastery" className="space-y-6 pt-6 border-t border-slate-200/80 dark:border-slate-800 scroll-mt-32">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#EEF2FF] dark:bg-indigo-950/60 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-2xs">
              <Compass className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-white tracking-tight">
                Concept Mastery
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Understand your strengths and focus on areas that need more practice.
              </p>
            </div>
          </div>

          <div className="relative shrink-0 self-start sm:self-auto">
            <select
              value={conceptFilter}
              onChange={(e) => setConceptFilter(e.target.value)}
              className="appearance-none pl-3.5 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs focus:outline-none focus:border-[#4F46E5] cursor-pointer"
            >
              <option value="all">All Concepts</option>
              <option value="mastered">Mastered</option>
              <option value="needs_practice">Needs Practice</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* Ranked Concept Mastery List */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700 shadow-2xs overflow-hidden divide-y divide-slate-100 dark:divide-slate-700/60">
          {rankedConcepts.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 dark:text-slate-500">
              No concepts assessed yet for this project. Upload materials and complete quizzes to track concept mastery.
            </div>
          ) : (
            rankedConcepts.map((c) => (
              <div
                key={c.rank}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-750/50 transition-colors"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  {/* Number Circle Badge */}
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                      c.rank === 1
                        ? "bg-[#4F46E5] text-white"
                        : c.rank <= 3
                        ? "bg-amber-500 text-white"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {c.rank}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-[#0F172A] dark:text-white truncate">
                        {c.name}
                      </h4>
                      <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                        {c.score}%
                      </span>
                    </div>
                    <div className="mt-1.5 w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${c.color}`}
                        style={{ width: `${c.score}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Status Pill & Action */}
                <div className="flex items-center gap-4 self-end sm:self-center shrink-0">
                  {c.statusType === "mastered" ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span>Mastered</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      <span>Needs Practice</span>
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => onNavigateTab && onNavigateTab("quiz")}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                    title="Practice this concept"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 2-Column Row: Topic Mastery Distribution & Topics Needing Practice */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Topic Mastery Distribution */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700 p-6 shadow-2xs space-y-4 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-700/60">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Target className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">Topic Mastery Distribution</h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Distribution of concepts by mastery level</p>
                </div>
              </div>

              {/* Horizontal Distribution Rows */}
              <div className="space-y-3.5 pt-3">
                {/* 1. Mastered */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Mastered (≥70%)</span>
                    <span className="font-mono text-slate-500">{masteredCount} ({masteredPct}%)</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                    <div className="h-full bg-[#10B981] rounded-full" style={{ width: `${masteredPct}%` }} />
                  </div>
                </div>

                {/* 2. Building */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Building (50–69%)</span>
                    <span className="font-mono text-slate-500">{buildingCount} ({buildingPct}%)</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                    <div className="h-full bg-[#3B82F6] rounded-full" style={{ width: `${buildingPct}%` }} />
                  </div>
                </div>

                {/* 3. Needs Practice */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Needs Practice (&lt;50%)</span>
                    <span className="font-mono text-slate-500">{needsAttentionCount} ({needsAttentionPct}%)</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                    <div className="h-full bg-[#F59E0B] rounded-full" style={{ width: `${needsAttentionPct}%` }} />
                  </div>
                </div>

                {/* 4. Not Yet Assessed */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Not Yet Assessed</span>
                    <span className="font-mono text-slate-500">{unassessedCount} ({unassessedPct}%)</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                    <div className="h-full bg-slate-400 rounded-full" style={{ width: `${unassessedPct}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Topics That Need More Practice */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700 p-6 shadow-2xs space-y-4 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700/60">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">Topics That Need More Practice</h3>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Topics that need more attention</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  {practiceTopics.length} {practiceTopics.length === 1 ? "topic" : "topics"}
                </span>
              </div>

              {/* Compact Rows */}
              <div className="space-y-2.5 pt-2">
                {practiceTopics.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                    No topics currently need practice.
                  </div>
                ) : (
                  practiceTopics.map((t, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-750/50 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-[#0F172A] dark:text-white truncate">{t.name}</div>
                        <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                          Needs Practice · {t.score}% mastery
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onNavigateTab && onNavigateTab("quiz")}
                        className="px-3 py-1 rounded-xl bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-slate-200 dark:border-slate-700 text-xs font-semibold shadow-2xs transition-colors shrink-0 cursor-pointer"
                      >
                        Practice →
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Activity & Engagement: AI Tutor Usage & Encouragement */}
        <div ref={activityRef} id="activity-engagement" className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch scroll-mt-32">
          {/* Left: AI Tutor Usage (~67% width) */}
          <div className="lg:col-span-8 p-6 rounded-3xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#EEF2FF] dark:bg-indigo-950/60 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-2xs">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm sm:text-base font-bold text-[#0F172A] dark:text-white">AI Tutor Usage</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Interaction and grounding telemetry</p>
              </div>
            </div>

            <div className="flex items-center gap-6 sm:gap-8 text-xs">
              <div>
                <div className="text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-white font-mono">
                  {tutorQuestions}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Total questions</div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {groundedRate !== null ? `${groundedRate}%` : "—"}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Grounded answers</div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-[#4F46E5] dark:text-indigo-400 font-mono">
                  {tutorSessions}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Study sessions</div>
              </div>
            </div>
          </div>

          {/* Right: Keep Asking! (~33% width) */}
          <div className="lg:col-span-4 p-6 rounded-3xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#4F46E5]" />
                <h4 className="text-sm font-bold text-[#0F172A] dark:text-white">Keep Asking!</h4>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                The AI Tutor is here to help you understand difficult concepts.
              </p>
            </div>

            <button
              type="button"
              onClick={() => onNavigateTab && onNavigateTab("tutor")}
              className="w-full py-2.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-semibold shadow-sm transition-all hover-lift flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Ask a Question</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Motivational Banner 2 */}
        <div className="bg-gradient-to-r from-[#EFF1FE] via-[#F4F2FE] to-[#F9F7FF] dark:from-slate-900 dark:via-indigo-950/30 dark:to-slate-900 border border-[#E0E7FF] dark:border-indigo-500/20 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-2xs hover:shadow-sm transition-all duration-200">
          <div className="space-y-2 max-w-lg">
            <span className="text-2xl text-[#4F46E5] dark:text-indigo-400 font-serif leading-none block">
              &ldquo;
            </span>
            <h3 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-white leading-snug">
              &ldquo;Mastery is a journey, not a destination.&rdquo;
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
              Keep practicing, you&apos;re making progress!
            </p>
          </div>
          <MountainLandscapeSvg />
        </div>
      </div>
    </div>
  );
};
