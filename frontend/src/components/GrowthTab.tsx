import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronDown,
  Compass,
  Flame,
  Lightbulb,
  LineChart,
  Loader2,
  Minus,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  generateLearningPlanApi,
  getGlobalAnalyticsApi,
  getLearningPlanApi,
  getProjectGrowthApi,
  getProjectMasteryApi,
  getProjectRecommendationsApi,
  getRecentActivityApi,
} from "@/lib/api";
import type {
  ConceptGrowthItem,
  ConfidenceLevel,
  GrowthSummary,
  LearningPlan,
  MasteryListResponse,
  Project,
  Recommendation,
} from "@/types";
import { LearningRoadmap } from "./LearningRoadmap";

interface GrowthTabProps {
  projectId: string;
  project?: Project | null;
  spaceName?: string;
  onNavigateTab?: (
    tab: "overview" | "materials" | "tutor" | "quiz" | "growth" | "analytics" | "flashcards"
  ) => void;
}

export const GrowthTab: React.FC<GrowthTabProps> = ({
  projectId,
  project,
  spaceName,
  onNavigateTab,
}) => {
  const [masteryData, setMasteryData] = useState<MasteryListResponse | null>(null);
  const [growthData, setGrowthData] = useState<GrowthSummary | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [allProjects, setAllProjects] = useState<{ id: string; name: string; spaceName: string }[]>([]);
  const [activeDays, setActiveDays] = useState<Set<number>>(new Set()); // 0=Mon, 6=Sun
  const [streakCount, setStreakCount] = useState<number>(0);

  // Learning Plan state
  const [learningPlan, setLearningPlan] = useState<LearningPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Sub-nav
  const [activeSubSection, setActiveSubSection] = useState<
    "overview" | "plan" | "concepts" | "journey" | "recommendations"
  >("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showProjectSwitcher, setShowProjectSwitcher] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [mRes, gRes, rRes, globRes, actRes, pRes] = await Promise.all([
        getProjectMasteryApi(projectId),
        getProjectGrowthApi(projectId),
        getProjectRecommendationsApi(projectId).catch(() => []),
        getGlobalAnalyticsApi().catch(() => null),
        getRecentActivityApi({ projectId, limit: 40 }).catch(() => []),
        getLearningPlanApi(projectId).catch(() => null),
      ]);

      setMasteryData(mRes);
      setGrowthData(gRes);
      setRecommendations(rRes);
      setLearningPlan(pRes);

      // Populate project list for the project switcher dropdown
      if (globRes?.projects_by_progress) {
        setAllProjects(
          globRes.projects_by_progress.map((p) => ({
            id: p.project_id,
            name: p.project_name,
            spaceName: p.space_name,
          }))
        );
      }

      // Calculate streak & week days from real activity events
      if (actRes && actRes.length > 0) {
        const now = new Date();
        const startOfWeek = new Date(now);
        // Set to Monday of current week
        const day = startOfWeek.getDay();
        const diff = (day === 0 ? -6 : 1) - day;
        startOfWeek.setDate(startOfWeek.getDate() + diff);
        startOfWeek.setHours(0, 0, 0, 0);

        const currentWeekDays = new Set<number>();
        const uniqueActivityDates = new Set<string>();

        actRes.forEach((e) => {
          const d = new Date(e.created_at);
          uniqueActivityDates.add(d.toDateString());
          if (d >= startOfWeek) {
            const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1; // 0=Mon..6=Sun
            currentWeekDays.add(dayIdx);
          }
        });
        setActiveDays(currentWeekDays);

        // Simple streak count based on recent distinct active days
        setStreakCount(Math.min(uniqueActivityDates.size, 7));
      } else {
        setActiveDays(new Set());
        setStreakCount(0);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load growth data.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshPlan = async (forceReorder = false) => {
    setPlanLoading(true);
    try {
      const res = await generateLearningPlanApi(projectId, forceReorder);
      setLearningPlan(res);
    } finally {
      setPlanLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  // Derived metrics
  const totalConcepts = masteryData?.total_concepts ?? 0;
  const assessedCount = masteryData?.assessed_count ?? 0;
  const assessedPct = totalConcepts > 0 ? Math.round((assessedCount / totalConcepts) * 100) : 0;
  const avgMastery =
    masteryData?.overall_average_mastery !== null && masteryData?.overall_average_mastery !== undefined
      ? Math.round(masteryData.overall_average_mastery)
      : null;

  const strongCount =
    masteryData?.masteries?.filter((m) => (m.mastery_score ?? 0) >= 70).length ?? 0;

  // Flatten all concept growth items
  const allGrowthMap = useMemo(() => {
    const map = new Map<string, ConceptGrowthItem>();
    if (!growthData) return map;
    [...growthData.improving, ...growthData.stable, ...growthData.needs_attention, ...growthData.unassessed].forEach((g) => {
      map.set(g.concept_id, g);
    });
    return map;
  }, [growthData]);

  // Calculate real growth trajectory points across history snapshots
  const trajectoryPoints = useMemo(() => {
    const pts: { date: string; score: number; rawDate: Date }[] = [];
    allGrowthMap.forEach((g) => {
      if (g.history && g.history.length > 0) {
        g.history.forEach((h) => {
          pts.push({
            date: new Date(h.recorded_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
            score: h.score,
            rawDate: new Date(h.recorded_at),
          });
        });
      }
    });

    // Sort chronologically and group by date
    pts.sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());

    // Deduplicate by date with average score
    const dateMap = new Map<string, { total: number; count: number }>();
    pts.forEach((p) => {
      const entry = dateMap.get(p.date) || { total: 0, count: 0 };
      entry.total += p.score;
      entry.count += 1;
      dateMap.set(p.date, entry);
    });

    return Array.from(dateMap.entries()).map(([date, val]) => ({
      date,
      score: Math.round(val.total / val.count),
    }));
  }, [allGrowthMap]);

  // Growth delta calculation: requires at least 2 distinct historical points
  const recentGrowthDelta = useMemo(() => {
    if (trajectoryPoints.length >= 2) {
      const first = trajectoryPoints[0].score;
      const last = trajectoryPoints[trajectoryPoints.length - 1].score;
      return last - first;
    }
    return null;
  }, [trajectoryPoints]);

  // Concept list with search and status filtering
  const filteredConcepts = useMemo(() => {
    if (!masteryData?.masteries) return [];
    return masteryData.masteries.filter((m) => {
      const matchesSearch =
        m.concept_name.toLowerCase().includes(searchQuery.toLowerCase().trim());
      if (!matchesSearch) return false;

      const score = m.mastery_score;

      if (statusFilter === "mastered") return score !== null && score >= 70;
      if (statusFilter === "building") return score !== null && score >= 50 && score < 70;
      if (statusFilter === "needs_practice") return score !== null && score < 50;
      if (statusFilter === "unassessed") return score === null || !m.is_assessed;
      return true;
    });
  }, [masteryData, searchQuery, statusFilter]);

  // Clean status pill helper
  const getStatusBadge = (score: number | null, isAssessed: boolean, confidence: number) => {
    if (!isAssessed || score === null || confidence === 0) {
      return {
        label: "Not Yet Assessed",
        pill: "bg-gray-800 text-gray-400 border-gray-700",
        dot: "bg-gray-500",
      };
    }
    if (confidence < 0.35) {
      return {
        label: "Early Evidence",
        pill: "bg-purple-950/40 text-purple-300 border-purple-800/40",
        dot: "bg-purple-400",
      };
    }
    if (score >= 70) {
      return {
        label: "Mastered",
        pill: "bg-emerald-950/40 text-emerald-300 border-emerald-800/40",
        dot: "bg-emerald-400",
      };
    }
    if (score >= 50) {
      return {
        label: "Building",
        pill: "bg-sky-950/40 text-sky-300 border-sky-800/40",
        dot: "bg-sky-400",
      };
    }
    return {
      label: "Needs Practice",
      pill: "bg-amber-950/40 text-amber-300 border-amber-800/40",
      dot: "bg-amber-400",
    };
  };

  const getConfidencePill = (level: ConfidenceLevel) => {
    switch (level) {
      case "high":
        return "Strong practice confidence";
      case "medium":
        return "Building understanding";
      case "low":
        return "Early evidence";
      default:
        return "Not yet assessed";
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return "P";
    return name
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <span className="text-xs text-gray-400 font-medium">
          Loading your learning progress...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-900/40 bg-rose-950/20 p-8 text-center flex flex-col items-center">
        <AlertCircle className="w-8 h-8 text-rose-400 mb-2" />
        <p className="text-sm font-semibold text-rose-200">Unable to load learning progress</p>
        <p className="text-xs text-rose-400/80 mt-1 max-w-sm">{error}</p>
        <button
          onClick={loadData}
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
        <div className="rounded-2xl border border-gray-800 bg-[#0d1222] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center font-bold text-white text-base tracking-wider shrink-0 shadow-inner">
              {getInitials(project?.name)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white tracking-tight">
                  {project?.name || "Machine Learning Fundamentals"}
                </h1>
              </div>
              <div className="text-xs text-indigo-400 font-medium mt-0.5">
                Space: {spaceName || "Knowledge Space"}
              </div>
              <p className="text-xs text-gray-400 mt-1 max-w-2xl">
                Track your progress, see how your understanding is improving, and focus on what to learn next.
              </p>
            </div>
          </div>

          {/* Project Switcher Dropdown */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowProjectSwitcher((prev) => !prev)}
              className="px-3 py-1.5 rounded-xl bg-gray-900/80 hover:bg-gray-800 text-gray-200 text-xs font-medium border border-gray-700/60 flex items-center gap-2 transition-colors"
            >
              <span>Switch Project</span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>

            {showProjectSwitcher && allProjects.length > 0 && (
              <div className="absolute right-0 mt-2 w-64 rounded-xl bg-gray-900 border border-gray-800 shadow-2xl p-1.5 z-30">
                <div className="px-2 py-1 text-[10px] uppercase font-mono font-bold text-gray-500">
                  Your Projects
                </div>
                {allProjects.map((p) => (
                  <Link
                    key={p.id}
                    to={`/projects/${p.id}?tab=growth`}
                    onClick={() => setShowProjectSwitcher(false)}
                    className={`block px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      p.id === projectId
                        ? "bg-indigo-600/20 text-indigo-300 font-semibold"
                        : "text-gray-300 hover:bg-gray-800 hover:text-white"
                    }`}
                  >
                    <div className="truncate">{p.name}</div>
                    <div className="text-[10px] text-gray-500 truncate">{p.spaceName}</div>
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
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${
              activeSubSection === "overview"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "bg-gray-900/40 text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 border border-gray-800/80"
            }`}
          >
            Progress Overview
          </button>
          <button
            onClick={() => setActiveSubSection("plan")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ${
              activeSubSection === "plan"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "bg-gray-900/40 text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 border border-gray-800/80"
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Learning Roadmap</span>
          </button>
          <button
            onClick={() => {
              setActiveSubSection("concepts");
              document.getElementById("concept-mastery-section")?.scrollIntoView({ behavior: "smooth" });
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${
              activeSubSection === "concepts"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "bg-gray-900/40 text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 border border-gray-800/80"
            }`}
          >
            Concept Mastery
          </button>
          <button
            onClick={() => {
              setActiveSubSection("journey");
              document.getElementById("progress-chart-card")?.scrollIntoView({ behavior: "smooth" });
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${
              activeSubSection === "journey"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "bg-gray-900/40 text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 border border-gray-800/80"
            }`}
          >
            Learning Journey
          </button>
          <button
            onClick={() => {
              setActiveSubSection("recommendations");
              document.getElementById("recommended-next-step")?.scrollIntoView({ behavior: "smooth" });
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${
              activeSubSection === "recommendations"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "bg-gray-900/40 text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 border border-gray-800/80"
            }`}
          >
            Recommendations
          </button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* 1.5 DEDICATED ROADMAP SUB-SECTION OR OVERVIEW SUMMARY             */}
      {/* ================================================================ */}
      {activeSubSection === "plan" ? (
        <LearningRoadmap
          projectId={projectId}
          plan={learningPlan}
          loading={planLoading}
          onRefreshPlan={handleRefreshPlan}
          onNavigateTab={onNavigateTab}
        />
      ) : (
        <>
          {/* Overview Roadmap Hero Widget */}
          {learningPlan && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-[#0d1222] via-[#0f172a] to-[#1e1b4b]/30 border border-indigo-900/40 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shrink-0">
                  <Compass className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white tracking-tight">
                      {learningPlan.title}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {learningPlan.progress.completed_count}/{learningPlan.progress.total_concepts} Concepts ({learningPlan.progress.progress_percentage}%)
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {learningPlan.next_recommended_concept ? (
                      <span>
                        Next Milestone:{" "}
                        <strong className="text-white">
                          #{learningPlan.next_recommended_concept.position + 1} {learningPlan.next_recommended_concept.concept_name}
                        </strong>{" "}
                        ({learningPlan.next_recommended_concept.recommended_action || "Study"})
                      </span>
                    ) : (
                      <span className="text-emerald-400 font-medium">All curriculum milestones completed!</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setActiveSubSection("plan")}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition-all hover:scale-[1.02]"
                >
                  View Full Roadmap &rarr;
                </button>
              </div>
            </div>
          )}

      {/* ================================================================ */}
      {/* 2. TOP 4 SUMMARY CARDS                                           */}
      {/* ================================================================ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Overall Mastery */}
        <div className="p-5 rounded-2xl bg-[#0d1222] border border-gray-800 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-medium text-gray-400">Overall Mastery</div>
            <div className="text-2xl font-bold text-white tracking-tight mt-2">
              {avgMastery !== null ? `${avgMastery}%` : "Not assessed"}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Across assessed concepts</div>
          </div>
          {/* Circular Progress Indicator */}
          <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
            <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-gray-800"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-indigo-500 transition-all duration-700"
                strokeDasharray={`${avgMastery || 0}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="absolute text-[10px] font-bold text-indigo-300">
              {avgMastery !== null ? `${avgMastery}%` : "—"}
            </span>
          </div>
        </div>

        {/* Card 2: Assessed Concepts */}
        <div className="p-5 rounded-2xl bg-[#0d1222] border border-gray-800 flex flex-col justify-between shadow-sm">
          <div>
            <div className="text-xs font-medium text-gray-400">Assessed Concepts</div>
            <div className="text-2xl font-bold text-white tracking-tight mt-2">
              {assessedCount} <span className="text-base font-normal text-gray-400">of {totalConcepts}</span>
            </div>
          </div>
          <div className="mt-3">
            <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${assessedPct}%` }}
              />
            </div>
            <div className="text-[11px] text-gray-500 mt-1">{assessedPct}% assessed</div>
          </div>
        </div>

        {/* Card 3: Recent Growth */}
        <div className="p-5 rounded-2xl bg-[#0d1222] border border-gray-800 flex flex-col justify-between shadow-sm">
          <div>
            <div className="text-xs font-medium text-gray-400">Recent Growth</div>
            <div className="mt-2">
              {recentGrowthDelta !== null ? (
                <div
                  className={`text-2xl font-bold tracking-tight flex items-center gap-1.5 ${
                    recentGrowthDelta >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {recentGrowthDelta >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                  {recentGrowthDelta >= 0 ? `+${recentGrowthDelta.toFixed(1)}%` : `${recentGrowthDelta.toFixed(1)}%`}
                </div>
              ) : (
                <div className="text-base font-semibold text-gray-300">Not enough history</div>
              )}
            </div>
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            {recentGrowthDelta !== null
              ? "Since previous assessment period"
              : "Complete more assessments to see trend"}
          </div>
        </div>

        {/* Card 4: Strong Concepts */}
        <div className="p-5 rounded-2xl bg-[#0d1222] border border-gray-800 flex flex-col justify-between shadow-sm">
          <div>
            <div className="text-xs font-medium text-gray-400">Strong Concepts</div>
            <div className="text-2xl font-bold text-white tracking-tight mt-2">{strongCount}</div>
          </div>
          <div className="text-[11px] text-gray-500 mt-1">Mastered concepts (&ge;70%)</div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* 3. MAIN GROWTH CHART & LEARNING INSIGHTS (2 COLUMNS)             */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Your Learning Progress Chart (8 cols) */}
        <div
          id="progress-chart-card"
          className="lg:col-span-8 p-6 rounded-2xl bg-[#0d1222] border border-gray-800 shadow-sm"
        >
          <div className="flex items-center justify-between pb-4 border-b border-gray-800/80 mb-4">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                <LineChart className="w-4 h-4 text-indigo-400" />
                Your Learning Progress
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                How your understanding has changed over time
              </p>
            </div>
            {trajectoryPoints.length >= 2 && (
              <span className="text-[11px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                {trajectoryPoints.length} snapshots
              </span>
            )}
          </div>

          {trajectoryPoints.length >= 2 ? (
            <div className="pt-2">
              {/* SVG Line / Area Chart */}
              <div className="w-full h-56 relative">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 500 200" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="growthGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid lines at 25, 50, 75, 100 */}
                  {[0, 25, 50, 75, 100].map((level) => {
                    const y = 180 - (level / 100) * 160;
                    return (
                      <g key={level}>
                        <line
                          x1="30"
                          y1={y}
                          x2="490"
                          y2={y}
                          stroke="#1e293b"
                          strokeDasharray={level === 50 ? "4 4" : "2 2"}
                          strokeWidth="1"
                        />
                        <text x="5" y={y + 3} fill="#64748b" fontSize="9" fontFamily="monospace">
                          {level}
                        </text>
                      </g>
                    );
                  })}

                  {/* Calculate plot points */}
                  {(() => {
                    const width = 460;
                    const step = width / (trajectoryPoints.length - 1);
                    const coords = trajectoryPoints.map((pt, idx) => ({
                      x: 30 + idx * step,
                      y: 180 - (Math.max(0, Math.min(100, pt.score)) / 100) * 160,
                      score: pt.score,
                      date: pt.date,
                    }));

                    const lineD = coords.reduce(
                      (acc, c, idx) => (idx === 0 ? `M ${c.x} ${c.y}` : `${acc} L ${c.x} ${c.y}`),
                      ""
                    );
                    const areaD = `${lineD} L ${coords[coords.length - 1].x} 180 L ${coords[0].x} 180 Z`;

                    return (
                      <>
                        <path d={areaD} fill="url(#growthGradient)" />
                        <path
                          d={lineD}
                          fill="none"
                          stroke="#818cf8"
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
                              fill="#6366f1"
                              stroke="#ffffff"
                              strokeWidth="1.5"
                              className="group-hover:r-6 transition-all"
                            />
                            {/* Hover tooltip */}
                            <text
                              x={c.x}
                              y={c.y - 8}
                              textAnchor="middle"
                              fill="#e2e8f0"
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

                {/* X-axis Date labels */}
                <div className="flex justify-between pl-8 pr-2 pt-2 text-[10px] text-gray-500 font-mono">
                  {trajectoryPoints.map((p, idx) => (
                    <span key={idx}>{p.date}</span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-gray-800/60 border border-gray-700/60 flex items-center justify-center text-gray-400 mb-3">
                <LineChart className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-white">Your progress trend will appear here</h4>
              <p className="text-xs text-gray-400 mt-1 max-w-sm">
                Complete a few more assessments to see how your understanding changes over time.
              </p>
              {onNavigateTab && (
                <button
                  onClick={() => onNavigateTab("quiz")}
                  className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition-all"
                >
                  Take an Adaptive Quiz
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Learning Insights (4 cols) */}
        <div className="lg:col-span-4 p-6 rounded-2xl bg-[#0d1222] border border-gray-800 shadow-sm space-y-4">
          <div className="pb-3 border-b border-gray-800/80">
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Learning Insights
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Key takeaways from your recent study</p>
          </div>

          <div className="space-y-3">
            {/* Insight 1: Progress */}
            <div className="p-3.5 rounded-xl bg-gray-900/50 border border-gray-800/80 flex items-start gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">
                  {recentGrowthDelta !== null && recentGrowthDelta > 0
                    ? "You're improving!"
                    : strongCount > 0
                    ? "Solid foundation!"
                    : "Ready to accelerate"}
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                  {recentGrowthDelta !== null && recentGrowthDelta > 0
                    ? `Your mastery has increased by ${recentGrowthDelta.toFixed(1)}% across assessment periods.`
                    : strongCount > 0
                    ? `${strongCount} topics have reached mastery standing (≥70%).`
                    : "Complete quiz assessments to establish your topic mastery baseline."}
                </div>
              </div>
            </div>

            {/* Insight 2: Focus areas */}
            <div className="p-3.5 rounded-xl bg-gray-900/50 border border-gray-800/80 flex items-start gap-3">
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
                <Brain className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Keep going</div>
                <div className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                  {growthData?.needs_attention && growthData.needs_attention.length > 0
                    ? `${growthData.needs_attention.length} ${
                        growthData.needs_attention.length === 1 ? "topic needs" : "topics need"
                      } focused practice.`
                    : "All tested concepts are in stable or mastered standing."}
                </div>
              </div>
            </div>

            {/* Insight 3: Consistency */}
            <div className="p-3.5 rounded-xl bg-gray-900/50 border border-gray-800/80 flex items-start gap-3">
              <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Stay consistent</div>
                <div className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                  Consistent practice sessions with the AI Tutor and Adaptive Quizzes reinforce retention.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* 4. CONCEPT MASTERY TABLE / HORIZONTAL CARDS                     */}
      {/* ================================================================ */}
      <div
        id="concept-mastery-section"
        className="p-6 rounded-2xl bg-[#0d1222] border border-gray-800 shadow-sm space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-gray-800/80">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-400" />
              Concept Mastery
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Progress for each concept in this project
            </p>
          </div>

          {/* Search & Filter Controls */}
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search concepts..."
                className="pl-8 pr-3 py-1.5 rounded-xl bg-gray-900/80 border border-gray-700/60 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 w-40 sm:w-48 transition-colors"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-gray-900/80 border border-gray-700/60 text-xs text-gray-300 focus:outline-none focus:border-indigo-500 transition-colors"
            >
              <option value="all">All Concepts</option>
              <option value="mastered">Mastered (&ge;70%)</option>
              <option value="building">Building (50-69%)</option>
              <option value="needs_practice">Needs Practice (&lt;50%)</option>
              <option value="unassessed">Not Yet Assessed</option>
            </select>
          </div>
        </div>

        {/* Table / Row Cards */}
        {filteredConcepts.length > 0 ? (
          <div className="space-y-2.5">
            {filteredConcepts.map((m) => {
              const growth = allGrowthMap.get(m.concept_id);
              const status = getStatusBadge(m.mastery_score, m.is_assessed, m.confidence);
              const confPill = getConfidencePill(m.confidence_level);

              return (
                <div
                  key={m.concept_id}
                  className="p-4 rounded-xl bg-gray-900/40 border border-gray-800/80 hover:border-gray-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
                >
                  {/* Concept Name & Progress Bar */}
                  <div className="min-w-[200px] md:max-w-xs flex-1">
                    <div className="font-semibold text-white text-sm truncate">
                      {m.concept_name}
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="font-mono text-gray-300 font-bold shrink-0">
                        {m.mastery_score !== null ? `${Math.round(m.mastery_score)}%` : "—"}
                      </span>
                      <div className="flex-1 max-w-[160px] bg-gray-800 h-1.5 rounded-full overflow-hidden">
                        {m.mastery_score !== null ? (
                          <div
                            className={`h-full rounded-full ${
                              m.mastery_score >= 70
                                ? "bg-emerald-500"
                                : m.mastery_score >= 50
                                ? "bg-sky-500"
                                : "bg-amber-500"
                            }`}
                            style={{ width: `${Math.round(m.mastery_score)}%` }}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Confidence Pill */}
                  <div className="shrink-0 text-gray-400 text-[11px]">
                    <span className="px-2 py-0.5 rounded-md bg-gray-800/60 border border-gray-700/50">
                      {confPill}
                    </span>
                  </div>

                  {/* Trend Indicator */}
                  <div className="shrink-0 w-24 flex items-center gap-1 font-mono text-[11px]">
                    {growth?.status === "improving" ? (
                      <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                        <ArrowUpRight className="w-3.5 h-3.5" /> Improving
                      </span>
                    ) : growth?.status === "needs_attention" ? (
                      <span className="text-amber-400 flex items-center gap-1 font-semibold">
                        <TrendingDown className="w-3.5 h-3.5" /> Practice
                      </span>
                    ) : growth?.status === "stable" ? (
                      <span className="text-gray-400 flex items-center gap-1">
                        <Minus className="w-3.5 h-3.5" /> Stable
                      </span>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </div>

                  {/* Status Pill */}
                  <div className="shrink-0">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${status.pill}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                      {status.label}
                    </span>
                  </div>

                  {/* Action: Practice Button */}
                  <div className="shrink-0">
                    {onNavigateTab && (
                      <button
                        onClick={() => onNavigateTab("quiz")}
                        className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-indigo-600/30 text-gray-200 hover:text-indigo-200 border border-gray-700 hover:border-indigo-500/40 text-xs font-semibold transition-all flex items-center gap-1"
                      >
                        Practice &rarr;
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-gray-500">
            No concepts matched your search.
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* 5. BOTTOM ROW: WHAT TO DO NEXT & STUDY STREAK (2 COLUMNS)        */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: What to Do Next (8 cols) */}
        <div
          id="recommended-next-step"
          className="lg:col-span-8 p-6 rounded-2xl bg-[#0d1222] border border-gray-800 shadow-sm space-y-3"
        >
          <div className="pb-2 border-b border-gray-800/80 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-400" />
              What to Do Next
            </h3>
            <span className="text-[11px] text-gray-500">Targeted study recommendations</span>
          </div>

          {recommendations.length > 0 ? (
            <div className="p-4 rounded-xl bg-gray-900/60 border border-gray-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-mono font-semibold uppercase text-indigo-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Recommended Next Step
                </div>
                <h4 className="text-sm font-bold text-white">
                  {recommendations[0].title}
                </h4>
                <p className="text-xs text-gray-400 leading-relaxed max-w-xl">
                  {recommendations[0].reasoning || recommendations[0].body}
                </p>
              </div>

              {onNavigateTab && (
                <button
                  onClick={() => onNavigateTab("quiz")}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 shrink-0 transition-all"
                >
                  Start Practice &rarr;
                </button>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-gray-900/30 border border-gray-800/60 text-center py-6">
              <h4 className="text-xs font-bold text-gray-300">Keep learning</h4>
              <p className="text-[11px] text-gray-500 mt-1 max-w-md mx-auto">
                Complete another assessment to receive a personalized next step recommendation.
              </p>
              {onNavigateTab && (
                <button
                  onClick={() => onNavigateTab("quiz")}
                  className="mt-3 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium border border-gray-700/60 transition-colors"
                >
                  Take a Practice Quiz
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Study Streak (4 cols) */}
        <div className="lg:col-span-4 p-6 rounded-2xl bg-[#0d1222] border border-gray-800 shadow-sm space-y-4">
          <div className="pb-2 border-b border-gray-800/80">
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-400" />
              Study Streak
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Your study habit consistency</p>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center text-xl shrink-0">
              🔥
            </div>
            <div>
              <div className="text-xl font-bold text-white">
                {streakCount > 0 ? `${streakCount} days` : "0 days"}
              </div>
              <div className="text-[11px] text-gray-400">
                {streakCount > 0 ? "Keep it up!" : "No study activity yet"}
              </div>
            </div>
          </div>

          {/* Weekly Days M T W T F S S */}
          <div className="pt-2">
            <div className="grid grid-cols-7 gap-1.5 text-center">
              {["M", "T", "W", "T", "F", "S", "S"].map((dayName, idx) => {
                const isActive = activeDays.has(idx);
                return (
                  <div key={idx} className="flex flex-col items-center gap-1.5">
                    <span className="text-[10px] font-mono text-gray-500 font-semibold">
                      {dayName}
                    </span>
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] transition-all ${
                        isActive
                          ? "bg-indigo-600 text-white font-bold shadow-sm shadow-indigo-600/40"
                          : "bg-gray-800/60 text-gray-600 border border-gray-700/40"
                      }`}
                    >
                      {isActive ? "●" : "○"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          </div>
        </div>
      </>
      )}

      {/* Footer Quote */}
      <div className="text-center pt-4 pb-2 text-xs text-gray-500 italic">
        &ldquo;Progress, not perfection, leads to mastery.&rdquo;
      </div>
    </div>
  );
};
