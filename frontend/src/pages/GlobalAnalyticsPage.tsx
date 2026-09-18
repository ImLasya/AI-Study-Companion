import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Bot,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Download,
  FolderKanban,
  Layers,
  Loader2,
  Quote,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { getGlobalAnalyticsApi } from "@/lib/api";
import type { GlobalAnalyticsResponse } from "@/types";

export const GlobalAnalyticsPage: React.FC = () => {
  const [data, setData] = useState<GlobalAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Navigation states
  const [activeTab, setActiveTab] = useState<
    "overview" | "projects" | "concepts" | "activity" | "ai"
  >("overview");
  const [dateRange, setDateRange] = useState<string>("30d");
  const [showDateMenu, setShowDateMenu] = useState(false);
  const [showAllConcepts, setShowAllConcepts] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  // Hovered day on trend chart
  const [hoveredDayIdx, setHoveredDayIdx] = useState<number | null>(null);

  // Section Refs for smooth scrolling
  const overviewRef = useRef<HTMLDivElement>(null);
  const projectsRef = useRef<HTMLDivElement>(null);
  const conceptsRef = useRef<HTMLDivElement>(null);
  const activityRef = useRef<HTMLDivElement>(null);
  const aiRef = useRef<HTMLDivElement>(null);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getGlobalAnalyticsApi();
      setData(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load global analytics";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const handleTabClick = (tabKey: "overview" | "projects" | "concepts" | "activity" | "ai") => {
    setActiveTab(tabKey);
    let targetEl: HTMLElement | null = null;
    if (tabKey === "overview") targetEl = overviewRef.current;
    if (tabKey === "projects") targetEl = projectsRef.current;
    if (tabKey === "concepts") targetEl = conceptsRef.current;
    if (tabKey === "activity") targetEl = activityRef.current;
    if (tabKey === "ai") targetEl = aiRef.current;

    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Export real report to JSON
  const handleExportReport = () => {
    if (!data) return;
    const reportData = {
      exportedAt: new Date().toISOString(),
      studyActivity: data.total_study_activity,
      projects: data.projects_by_progress,
      weakestAreas: data.weakest_areas,
      aiUsage: data.ai_usage_summary,
      trend: data.overall_trend,
    };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `edumind-global-analytics-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // -------------------------------------------------------------------------
  // 1. Real Database KPI Metrics
  // -------------------------------------------------------------------------
  const studyDays = data?.total_study_activity?.active_study_days ?? 0;
  const quizzesCompleted = data?.total_study_activity?.total_quizzes_completed ?? 0;
  const tutorSessions = data?.total_study_activity?.total_tutor_conversations ?? 0;
  const totalActivityEvents = data?.total_study_activity?.total_events ?? 0;

  // -------------------------------------------------------------------------
  // 2. Real Activity Distribution (Quizzes, AI Tutor, Materials)
  // -------------------------------------------------------------------------
  const { quizzesShare, tutorShare, materialsShare, totalDistribution, quizPct, tutorPct, materialsPct } =
    useMemo(() => {
      const dist = data?.total_study_activity?.activity_distribution;
      let q = dist?.quizzes ?? 0;
      let t = dist?.tutor ?? 0;
      let m = dist?.materials ?? 0;

      // If backend activity_distribution wasn't cached yet, derive from overall_trend
      if (q === 0 && t === 0 && m === 0 && data?.overall_trend) {
        for (const bucket of data.overall_trend) {
          const bd = bucket.event_breakdown || {};
          for (const [key, val] of Object.entries(bd)) {
            if (key.includes("quiz") || key.includes("question")) q += val;
            else if (key.includes("tutor")) t += val;
            else if (key.includes("material") || key.includes("flashcard")) m += val;
          }
        }
      }

      // Default to real counts or safe zeros
      const total = q + t + m || totalActivityEvents || 1;
      const qp = Math.round((q / total) * 100);
      const tp = Math.round((t / total) * 100);
      const mp = Math.max(0, 100 - qp - tp);

      return {
        quizzesShare: q,
        tutorShare: t,
        materialsShare: m,
        totalDistribution: q + t + m || totalActivityEvents,
        quizPct: qp,
        tutorPct: tp,
        materialsPct: mp,
      };
    }, [data, totalActivityEvents]);

  // SVG Circumference for Donut Chart
  const circumference = 238.76;
  const quizDash = (quizPct / 100) * circumference;
  const tutorDash = (tutorPct / 100) * circumference;
  const materialsDash = (materialsPct / 100) * circumference;

  // -------------------------------------------------------------------------
  // 3. 30-Day Dynamic Trend Line & Area Chart
  // -------------------------------------------------------------------------
  const { trendDays, maxTrendEvents, chartPathD, chartAreaD } = useMemo(() => {
    // Generate 30 daily slots ending on the latest available date or today
    const daysCount = 30;
    const now = new Date();
    const trendMap = new Map<string, { event_count: number; breakdown: Record<string, number> }>();

    if (data?.overall_trend) {
      for (const item of data.overall_trend) {
        trendMap.set(item.date, {
          event_count: item.event_count,
          breakdown: item.event_breakdown || {},
        });
      }
    }

    const days: {
      dateStr: string;
      label: string;
      count: number;
      quizzes: number;
      tutor: number;
      materials: number;
      x: number;
      y: number;
    }[] = [];

    // Construct 30 consecutive days
    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const key = `${yyyy}-${mm}-${dd}`;
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      const found = trendMap.get(key);
      const cnt = found?.event_count ?? 0;
      const bd = found?.breakdown || {};

      let qCnt = 0;
      let tCnt = 0;
      let mCnt = 0;
      for (const [k, v] of Object.entries(bd)) {
        if (k.includes("quiz") || k.includes("question")) qCnt += v;
        else if (k.includes("tutor")) tCnt += v;
        else if (k.includes("material") || k.includes("flashcard")) mCnt += v;
      }

      days.push({
        dateStr: key,
        label,
        count: cnt,
        quizzes: qCnt,
        tutor: tCnt,
        materials: mCnt,
        x: 0,
        y: 0,
      });
    }

    const maxCnt = Math.max(20, ...days.map((d) => d.count));
    const width = 700;
    const height = 200;
    const padX = 35;
    const padY = 25;
    const plotW = width - padX - 15;
    const plotH = height - padY * 2;

    days.forEach((day, idx) => {
      day.x = padX + (idx / (daysCount - 1)) * plotW;
      day.y = height - padY - (day.count / maxCnt) * plotH;
    });

    // Build SVG Path strings
    const pathParts = days.map((d, i) => `${i === 0 ? "M" : "L"} ${d.x.toFixed(1)},${d.y.toFixed(1)}`);
    const linePath = pathParts.join(" ");
    const areaPath = `${linePath} L ${days[days.length - 1].x.toFixed(1)},${(height - padY).toFixed(1)} L ${days[0].x.toFixed(1)},${(height - padY).toFixed(1)} Z`;

    return {
      trendDays: days,
      maxTrendEvents: maxCnt,
      chartPathD: linePath,
      chartAreaD: areaPath,
    };
  }, [data]);

  // Active or hovered day for the floating tooltip
  const activeTooltipDay = useMemo(() => {
    if (hoveredDayIdx !== null && trendDays[hoveredDayIdx]) {
      return trendDays[hoveredDayIdx];
    }
    // Find the latest day with activity or the peak day
    const withActivity = trendDays.filter((d) => d.count > 0);
    if (withActivity.length > 0) {
      return withActivity[withActivity.length - 1];
    }
    return trendDays[trendDays.length - 1];
  }, [hoveredDayIdx, trendDays]);

  // -------------------------------------------------------------------------
  // 4. Real Projects & Mastery
  // -------------------------------------------------------------------------
  const projectsList = data?.projects_by_progress || [];

  // -------------------------------------------------------------------------
  // 5. Real Weakest Areas (Top Concepts to Improve)
  // -------------------------------------------------------------------------
  const weakConceptsList = useMemo(() => {
    const areas = data?.weakest_areas || [];
    return areas.map((c, i) => ({
      id: c.concept_id,
      rank: i + 1,
      name: c.concept_name,
      projectName: c.project_name,
      score: Math.round(c.mastery_score),
    }));
  }, [data]);

  // -------------------------------------------------------------------------
  // 6. Real Activity History Table Rows
  // -------------------------------------------------------------------------
  const historyRows = useMemo(() => {
    if (!data?.overall_trend || data.overall_trend.length === 0) return [];
    const rows = data.overall_trend.slice().reverse().map((day) => {
      const bd = day.event_breakdown || {};
      let q = 0;
      let t = 0;
      for (const [k, v] of Object.entries(bd)) {
        if (k.includes("quiz") || k.includes("question")) q += v;
        else if (k.includes("tutor")) t += v;
      }
      return {
        date: day.date,
        events: day.event_count,
        quizzes: q,
        tutor: t,
      };
    });
    return showAllHistory ? rows : rows.slice(0, 5);
  }, [data, showAllHistory]);

  // -------------------------------------------------------------------------
  // 7. Real AI Telemetry
  // -------------------------------------------------------------------------
  const totalAICalls = data?.ai_usage_summary?.total_calls ?? 0;
  const totalTokens = data?.ai_usage_summary?.total_tokens ?? 0;

  if (loading && !data) {
    return (
      <div className="min-h-[460px] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#4F46E5]" />
        <span className="text-xs text-slate-500 font-medium">Aggregating live learning telemetry...</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-[380px] flex flex-col items-center justify-center gap-4 text-center p-6 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700">
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
      {/* 1. GLOBAL ANALYTICS TOP HEADER CARD                                  */}
      {/* ==================================================================== */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700 p-6 sm:p-7 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          {/* Lavender Multi-Bar Chart Icon */}
          <div className="w-14 h-14 rounded-2xl bg-[#EEF2FF] dark:bg-indigo-950/60 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center shadow-2xs shrink-0">
            <svg
              className="w-7 h-7"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="12" width="3" height="8" rx="1.5" />
              <rect x="9" y="8" width="3" height="12" rx="1.5" />
              <rect x="15" y="4" width="3" height="16" rx="1.5" />
              <rect x="21" y="10" width="3" height="10" rx="1.5" />
            </svg>
          </div>

          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#4F46E5] dark:text-indigo-400 mb-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4F46E5] dark:bg-indigo-400" />
              <span>ANALYTICS</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A] dark:text-white tracking-tight">
              Global Analytics
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Cross-project learning engagement, concept mastery, and AI usage metrics.
            </p>
          </div>
        </div>

        {/* Right Controls: Date Selector & Export Report */}
        <div className="flex items-center gap-3 self-start md:self-auto shrink-0 relative">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowDateMenu(!showDateMenu)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-2xs transition-all cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>{dateRange === "7d" ? "Last 7 days" : dateRange === "all" ? "All time" : "Last 30 days"}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showDateMenu && (
              <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg py-1 z-30 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setDateRange("7d");
                    setShowDateMenu(false);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                >
                  Last 7 days
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateRange("30d");
                    setShowDateMenu(false);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-[#4F46E5] dark:text-indigo-400"
                >
                  Last 30 days
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateRange("all");
                    setShowDateMenu(false);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                >
                  All time
                </button>
              </div>
            )}
          </div>

          {/* Export Report Button */}
          <button
            type="button"
            onClick={handleExportReport}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-white dark:bg-slate-800 text-xs font-semibold text-[#4F46E5] dark:text-indigo-400 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/40 shadow-2xs transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 2. FOUR KPI METRIC CARDS (100% Dynamic from Database)                */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Card 1: Study Days */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 p-5 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-[#0F172A] dark:text-white tracking-tight">
              {studyDays}
            </div>
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Study Days
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              Active in last 30 days
            </div>
          </div>
        </div>

        {/* Card 2: Quizzes Completed */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 p-5 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Target className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-[#0F172A] dark:text-white tracking-tight">
              {quizzesCompleted}
            </div>
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Quizzes Completed
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              Adaptive practice tests
            </div>
          </div>
        </div>

        {/* Card 3: AI Tutor Sessions */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 p-5 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-[#0F172A] dark:text-white tracking-tight">
              {tutorSessions}
            </div>
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              AI Tutor Sessions
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              Grounded RAG chats
            </div>
          </div>
        </div>

        {/* Card 4: Total Activity */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 p-5 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-[#0F172A] dark:text-white tracking-tight">
              {totalActivityEvents}
            </div>
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Total Activity
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              Recorded events
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. TAB NAVIGATION STRIP                                               */}
      {/* ==================================================================== */}
      <div className="border-b border-slate-200/80 dark:border-slate-700 flex items-center gap-6 sm:gap-8 text-sm overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => handleTabClick("overview")}
          className={`pb-3 font-semibold text-sm transition-colors relative whitespace-nowrap cursor-pointer ${
            activeTab === "overview"
              ? "text-[#4F46E5] dark:text-indigo-400"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          Overview
          {activeTab === "overview" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#4F46E5] dark:bg-indigo-400 rounded-full" />
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabClick("projects")}
          className={`pb-3 font-semibold text-sm transition-colors relative whitespace-nowrap cursor-pointer ${
            activeTab === "projects"
              ? "text-[#4F46E5] dark:text-indigo-400"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          Project Insights
          {activeTab === "projects" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#4F46E5] dark:bg-indigo-400 rounded-full" />
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabClick("concepts")}
          className={`pb-3 font-semibold text-sm transition-colors relative whitespace-nowrap cursor-pointer ${
            activeTab === "concepts"
              ? "text-[#4F46E5] dark:text-indigo-400"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          Concept Mastery
          {activeTab === "concepts" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#4F46E5] dark:bg-indigo-400 rounded-full" />
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabClick("activity")}
          className={`pb-3 font-semibold text-sm transition-colors relative whitespace-nowrap cursor-pointer ${
            activeTab === "activity"
              ? "text-[#4F46E5] dark:text-indigo-400"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          Activity History
          {activeTab === "activity" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#4F46E5] dark:bg-indigo-400 rounded-full" />
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabClick("ai")}
          className={`pb-3 font-semibold text-sm transition-colors relative whitespace-nowrap cursor-pointer ${
            activeTab === "ai"
              ? "text-[#4F46E5] dark:text-indigo-400"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          AI Telemetry
          {activeTab === "ai" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#4F46E5] dark:bg-indigo-400 rounded-full" />
          )}
        </button>
      </div>

      {/* ==================================================================== */}
      {/* 4. ROW 1: DYNAMIC LEARNING ACTIVITY TREND & TIME SPENT BY ACTIVITY   */}
      {/* ==================================================================== */}
      <div ref={overviewRef} className="grid grid-cols-1 lg:grid-cols-12 gap-6 scroll-mt-24">
        {/* Left: Learning Activity Trend */}
        <div className="lg:col-span-7 xl:col-span-8 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700 p-6 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#0F172A] dark:text-white">
                    Learning Activity Trend
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Daily learning activity over the last 30 days
                  </p>
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]" />
                  <span>Quizzes</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6]" />
                  <span>AI Tutor</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                  <span>Materials</span>
                </div>
              </div>
            </div>

            {/* Dynamic SVG Wave Chart with Real Data & Interactive Hover Tooltip */}
            <div className="relative w-full h-[210px] sm:h-[230px] pt-4">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 700 200" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="globalTrendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#4F46E5" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Y-Axis Horizontal Gridlines */}
                {[0, 1, 2, 3, 4].map((step) => {
                  const yVal = 25 + step * 37.5;
                  const labelVal = Math.round(maxTrendEvents - (step / 4) * maxTrendEvents);
                  return (
                    <g key={step}>
                      <line
                        x1="35"
                        y1={yVal}
                        x2="685"
                        y2={yVal}
                        stroke="currentColor"
                        strokeDasharray="4 4"
                        className="text-slate-100 dark:text-slate-700/60"
                        strokeWidth="1"
                      />
                      <text
                        x="24"
                        y={yVal + 4}
                        textAnchor="end"
                        className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono"
                      >
                        {labelVal}
                      </text>
                    </g>
                  );
                })}

                {/* Dynamic Area Fill */}
                <path d={chartAreaD} fill="url(#globalTrendGradient)" />

                {/* Dynamic Stroke Line */}
                <path
                  d={chartPathD}
                  fill="none"
                  stroke="#4F46E5"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Data Points with Hover Detection */}
                {trendDays.map((d, idx) => (
                  <g
                    key={d.dateStr}
                    className="cursor-pointer group"
                    onMouseEnter={() => setHoveredDayIdx(idx)}
                    onClick={() => setHoveredDayIdx(idx)}
                  >
                    {/* Invisible hit area for easier hover */}
                    <rect x={d.x - 10} y="15" width="20" height="165" fill="transparent" />
                    {/* Visible circle marker */}
                    <circle
                      cx={d.x}
                      cy={d.y}
                      r={activeTooltipDay?.dateStr === d.dateStr ? 5 : d.count > 0 ? 3.5 : 2}
                      fill={activeTooltipDay?.dateStr === d.dateStr ? "#4F46E5" : "#818CF8"}
                      stroke="#FFFFFF"
                      strokeWidth={activeTooltipDay?.dateStr === d.dateStr ? 2.5 : 1.5}
                      className="transition-all duration-150"
                    />
                  </g>
                ))}
              </svg>

              {/* Floating Tooltip Box matching Reference UI */}
              {activeTooltipDay && (
                <div
                  className="absolute top-[10px] -translate-x-1/2 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200/90 dark:border-slate-700 p-2.5 text-xs min-w-[125px] pointer-events-none z-10 animate-in fade-in zoom-in-95 duration-150"
                  style={{
                    left: `${Math.max(15, Math.min(85, (activeTooltipDay.x / 700) * 100))}%`,
                  }}
                >
                  <div className="font-bold text-slate-900 dark:text-white mb-1.5 pb-1 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span>{activeTooltipDay.label}</span>
                    <span className="text-[10px] font-mono text-slate-400">{activeTooltipDay.count} events</span>
                  </div>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                        <span className="w-2 h-2 rounded-full bg-[#3B82F6]" />
                        Quizzes
                      </span>
                      <span className="font-bold text-slate-800 dark:text-white">
                        {activeTooltipDay.quizzes}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                        <span className="w-2 h-2 rounded-full bg-[#8B5CF6]" />
                        AI Tutor
                      </span>
                      <span className="font-bold text-slate-800 dark:text-white">
                        {activeTooltipDay.tutor}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                        <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                        Materials
                      </span>
                      <span className="font-bold text-slate-800 dark:text-white">
                        {activeTooltipDay.materials}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* X-Axis Date Labels */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 pl-8 pt-3 border-t border-slate-100 dark:border-slate-700/60 font-mono">
              <span>{trendDays[0]?.label || "Day 1"}</span>
              <span>{trendDays[5]?.label || "Day 5"}</span>
              <span>{trendDays[10]?.label || "Day 10"}</span>
              <span>{trendDays[15]?.label || "Day 15"}</span>
              <span>{trendDays[20]?.label || "Day 20"}</span>
              <span>{trendDays[25]?.label || "Day 25"}</span>
              <span>{trendDays[29]?.label || "Day 30"}</span>
            </div>
          </div>
        </div>

        {/* Right: Time Spent by Activity (100% Dynamic Donut Chart) */}
        <div className="lg:col-span-5 xl:col-span-4 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700 p-6 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                  <path d="M22 12A10 10 0 0 0 12 2v10z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-[#0F172A] dark:text-white">
                  Time Spent by Activity
                </h3>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Distribution of your learning time
                </p>
              </div>
            </div>

            {/* Donut Chart and Legend Container */}
            <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center justify-center gap-6 py-4">
              {/* SVG Donut */}
              <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  {/* Track background */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="transparent"
                    stroke="currentColor"
                    className="text-slate-100 dark:text-slate-700"
                    strokeWidth="11"
                  />
                  {/* Segment 1: Quizzes */}
                  {quizDash > 0 && (
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      fill="transparent"
                      stroke="#6366F1"
                      strokeWidth="11"
                      strokeDasharray={`${quizDash.toFixed(1)} ${circumference.toFixed(1)}`}
                      strokeDashoffset="0"
                      strokeLinecap="round"
                    />
                  )}
                  {/* Segment 2: AI Tutor */}
                  {tutorDash > 0 && (
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      fill="transparent"
                      stroke="#8B5CF6"
                      strokeWidth="11"
                      strokeDasharray={`${tutorDash.toFixed(1)} ${circumference.toFixed(1)}`}
                      strokeDashoffset={`-${quizDash.toFixed(1)}`}
                      strokeLinecap="round"
                    />
                  )}
                  {/* Segment 3: Materials */}
                  {materialsDash > 0 && (
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      fill="transparent"
                      stroke="#10B981"
                      strokeWidth="11"
                      strokeDasharray={`${materialsDash.toFixed(1)} ${circumference.toFixed(1)}`}
                      strokeDashoffset={`-${(quizDash + tutorDash).toFixed(1)}`}
                      strokeLinecap="round"
                    />
                  )}
                </svg>

                {/* Donut Center */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-xl font-bold text-[#0F172A] dark:text-white leading-none">
                    {totalDistribution}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">
                    Total Events
                  </span>
                </div>
              </div>

              {/* Donut Legend */}
              <div className="space-y-3 text-xs w-full max-w-[200px]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#6366F1]" />
                    <span className="text-slate-700 dark:text-slate-200 font-medium">Quizzes</span>
                  </div>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {quizzesShare} ({quizPct}%)
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6]" />
                    <span className="text-slate-700 dark:text-slate-200 font-medium">AI Tutor</span>
                  </div>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {tutorShare} ({tutorPct}%)
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                    <span className="text-slate-700 dark:text-slate-200 font-medium">Materials</span>
                  </div>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {materialsShare} ({materialsPct}%)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 5. ROW 2: REAL PROJECT PROGRESS & TOP CONCEPTS TO IMPROVE            */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Real Project Progress */}
        <div
          ref={projectsRef}
          className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700 p-6 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between scroll-mt-24"
        >
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <FolderKanban className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-[#0F172A] dark:text-white">
                  Project Progress
                </h3>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                {projectsList.length} tracked
              </span>
            </div>

            {/* List of projects from database */}
            {projectsList.length === 0 ? (
              <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs">
                No active projects found. Create a project in Spaces to track mastery.
              </div>
            ) : (
              <div className="space-y-4">
                {projectsList.map((p) => {
                  const mastery = p.average_mastery !== null ? Math.round(p.average_mastery) : null;
                  return (
                    <div key={p.project_id} className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#4F46E5] dark:text-indigo-400 font-mono">
                            {p.space_name.toUpperCase()}
                          </span>
                          <h4 className="text-sm font-bold text-[#0F172A] dark:text-white mt-0.5">
                            {p.project_name}
                          </h4>
                        </div>
                        <span className="text-sm font-bold text-[#4F46E5] dark:text-indigo-400">
                          {mastery !== null ? `${mastery}%` : "0%"}
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-500"
                          style={{ width: `${mastery || 0}%` }}
                        />
                      </div>

                      {/* Meta stats & Link */}
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
                        <span className="flex items-center gap-1.5 text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          {p.assessed_concepts} / {p.total_concepts} concepts assessed
                        </span>
                        <Link
                          to={`/projects/${p.project_id}`}
                          className="text-xs font-semibold text-[#4F46E5] dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 inline-flex items-center gap-1 transition-colors"
                        >
                          <span>Open Project</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Real Top Concepts to Improve */}
        <div
          ref={conceptsRef}
          className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700 p-6 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between scroll-mt-24"
        >
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                  <Target className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-[#0F172A] dark:text-white">
                  Top Concepts to Improve
                </h3>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40 text-[11px] font-semibold">
                {weakConceptsList.length} topics
              </span>
            </div>

            {/* Ranked List from real database concepts */}
            {weakConceptsList.length === 0 ? (
              <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                <p className="font-semibold text-slate-800 dark:text-white">All caught up!</p>
                <p className="text-slate-400 mt-1">No concepts requiring urgent reinforcement.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(showAllConcepts ? weakConceptsList : weakConceptsList.slice(0, 4)).map((concept, idx) => {
                  const rankBg =
                    idx === 0
                      ? "bg-[#F87171] text-white"
                      : idx === 1
                      ? "bg-[#FBBF24] text-white"
                      : idx === 2
                      ? "bg-[#FDBA74] text-white"
                      : "bg-[#818CF8] text-white";

                  return (
                    <div
                      key={concept.id}
                      className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition-colors gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${rankBg}`}
                        >
                          {concept.rank}
                        </div>
                        <div className="truncate">
                          <span className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 truncate block">
                            {concept.name}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate block">
                            {concept.projectName}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-rose-500 dark:text-rose-400 shrink-0">
                        {concept.score}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {weakConceptsList.length > 4 && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-700/60 flex justify-end mt-4">
              <button
                type="button"
                onClick={() => setShowAllConcepts(!showAllConcepts)}
                className="text-xs font-semibold text-[#4F46E5] dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span>{showAllConcepts ? "Show Less" : "View All"}</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 6. ROW 3: REAL ACTIVITY HISTORY & REAL AI TELEMETRY                  */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Real Activity History Table */}
        <div
          ref={activityRef}
          className="lg:col-span-7 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700 p-6 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between scroll-mt-24"
        >
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-[#0F172A] dark:text-white">
                  Activity History
                </h3>
              </div>
              {historyRows.length > 5 && (
                <button
                  type="button"
                  onClick={() => setShowAllHistory(!showAllHistory)}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-[#4F46E5] dark:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  {showAllHistory ? "Show Less" : "View All →"}
                </button>
              )}
            </div>

            {/* Table */}
            {historyRows.length === 0 ? (
              <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs">
                No activity logged yet. Take quizzes or chat with the AI tutor to see your history.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      <th className="pb-3 font-medium">Date</th>
                      <th className="pb-3 font-medium">Events</th>
                      <th className="pb-3 font-medium">Quizzes</th>
                      <th className="pb-3 font-medium">Tutor Turns</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {historyRows.map((row) => (
                      <tr
                        key={row.date}
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-700/30 transition-colors"
                      >
                        <td className="py-3 font-mono text-slate-500 dark:text-slate-400">
                          {row.date}
                        </td>
                        <td className="py-3 font-bold text-[#0F172A] dark:text-white">
                          {row.events}
                        </td>
                        <td className="py-3 font-bold text-emerald-600 dark:text-emerald-400">
                          {row.quizzes}
                        </td>
                        <td className="py-3 font-bold text-blue-600 dark:text-blue-400">
                          {row.tutor}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right: Real AI Telemetry Card */}
        <div
          ref={aiRef}
          className="lg:col-span-5 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700 p-6 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between scroll-mt-24"
        >
          <div>
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-[#0F172A] dark:text-white">
                AI Telemetry
              </h3>
            </div>

            {/* List items from real database sums */}
            <div className="space-y-3.5">
              {/* Row 1: Total AI Calls */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-700/40 border border-slate-100 dark:border-slate-700/60">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-100/60 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Zap className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Total AI Calls
                  </span>
                </div>
                <span className="text-sm font-bold text-[#0F172A] dark:text-white font-mono">
                  {totalAICalls}
                </span>
              </div>

              {/* Row 2: Total Tokens Processed */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-700/40 border border-slate-100 dark:border-slate-700/60">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-purple-100/60 dark:bg-purple-950/80 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                    <Layers className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Total Tokens Processed
                  </span>
                </div>
                <span className="text-sm font-bold text-[#0F172A] dark:text-white font-mono">
                  {totalTokens.toLocaleString()}
                </span>
              </div>

              {/* Row 3: Grounded Citations */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-700/40 border border-slate-100 dark:border-slate-700/60">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100/60 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Grounded Citations
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 text-xs font-semibold border border-emerald-200/60 dark:border-emerald-800/40">
                  pgvector Verified
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 mt-4">
            <span>Powered by Gemini &amp; pgvector</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 7. MOTIVATIONAL FOOTER BANNER                                        */}
      {/* ==================================================================== */}
      <div className="bg-gradient-to-r from-[#F0F3FF] via-[#F5F3FF] to-[#EFF6FF] dark:from-slate-800 dark:via-indigo-950/30 dark:to-slate-800 rounded-3xl border border-indigo-100/70 dark:border-indigo-900/40 p-6 sm:p-8 shadow-2xs hover:shadow-md transition-all duration-200 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative">
        <div className="flex items-start gap-4 z-10">
          <div className="w-10 h-10 rounded-2xl bg-[#EEF2FF] dark:bg-indigo-950/80 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-2xs">
            <Quote className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-base sm:text-lg font-bold text-[#1E1B4B] dark:text-white tracking-tight">
              “Progress today, a smarter you tomorrow.”
            </h4>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Data turns effort into insight, and insight into progress.
            </p>
          </div>
        </div>

        {/* Mountain Trail & Summit Flag SVG Illustration */}
        <div className="w-56 h-28 shrink-0 relative flex items-end justify-center z-0 opacity-90 sm:opacity-100">
          <svg className="w-full h-full" viewBox="0 0 240 120" fill="none">
            {/* Soft background clouds */}
            <path
              d="M30 40 Q40 25 60 30 Q75 25 85 40 Z"
              fill="rgba(255, 255, 255, 0.7)"
              className="dark:fill-slate-700/40"
            />
            <path
              d="M160 30 Q170 18 190 22 Q205 18 215 30 Z"
              fill="rgba(255, 255, 255, 0.6)"
              className="dark:fill-slate-700/30"
            />

            {/* Back Mountain Silhouette */}
            <polygon
              points="60,120 130,35 200,120"
              fill="#C7D2FE"
              className="dark:fill-indigo-900/50"
            />

            {/* Front Mountain Silhouette (Summit) */}
            <polygon
              points="110,120 170,20 230,120"
              fill="#A5B4FC"
              className="dark:fill-indigo-700/60"
            />

            {/* Mountain Snow Cap */}
            <polygon
              points="155,42 170,20 185,42 177,38 170,44 163,38"
              fill="#FFFFFF"
              className="dark:fill-slate-200"
            />

            {/* Mountain Base Left Layer */}
            <polygon
              points="20,120 80,60 140,120"
              fill="#E0E7FF"
              className="dark:fill-indigo-950/70"
            />

            {/* Winding Trail */}
            <path
              d="M40 120 Q80 100 100 85 T145 50 T170 20"
              stroke="#6366F1"
              strokeWidth="2"
              strokeDasharray="3 3"
              fill="none"
            />

            {/* Flag at Summit */}
            <line x1="170" y1="20" x2="170" y2="8" stroke="#4F46E5" strokeWidth="2" />
            <polygon points="170,8 184,13 170,18" fill="#4F46E5" />

            {/* Sparkles / Stars */}
            <circle cx="150" cy="15" r="1.5" fill="#818CF8" />
            <circle cx="195" cy="25" r="1.5" fill="#818CF8" />
            <circle cx="120" cy="30" r="1.5" fill="#A5B4FC" />
          </svg>
        </div>
      </div>
    </div>
  );
};
