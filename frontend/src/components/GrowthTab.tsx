import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  Brain,
  CheckCircle2,
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
  project: _project,
  spaceName: _spaceName,
  onNavigateTab,
}) => {
  const [masteryData, setMasteryData] = useState<MasteryListResponse | null>(null);
  const [growthData, setGrowthData] = useState<GrowthSummary | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
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

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [mRes, gRes, rRes, _globRes, actRes, pRes] = await Promise.all([
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
  const avgMastery =
    masteryData?.overall_average_mastery !== null && masteryData?.overall_average_mastery !== undefined
      ? Math.round(masteryData.overall_average_mastery)
      : null;

  const strongCount =
    masteryData?.masteries?.filter((m) => (m.mastery_score ?? 0) >= 70).length ?? 0;

  const masteredCount = strongCount;
  const learningCount =
    masteryData?.masteries?.filter((m) => m.mastery_score !== null && m.mastery_score >= 50 && m.mastery_score < 70).length ?? 0;
  const needsReviewCount =
    masteryData?.masteries?.filter((m) => m.mastery_score !== null && m.mastery_score < 50 && m.evidence_count > 0).length ?? 0;
  const notStartedCount =
    masteryData?.masteries?.filter((m) => m.mastery_score === null || m.evidence_count === 0).length ?? 0;

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
        pill: "bg-surface-muted text-text-muted border-border",
        dot: "bg-text-muted",
      };
    }
    if (confidence < 0.35) {
      return {
        label: "Early Evidence",
        pill: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
        dot: "bg-purple-500",
      };
    }
    if (score >= 70) {
      return {
        label: "Mastered",
        pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
        dot: "bg-emerald-500",
      };
    }
    if (score >= 50) {
      return {
        label: "Building",
        pill: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
        dot: "bg-sky-500",
      };
    }
    return {
      label: "Needs Practice",
      pill: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      dot: "bg-amber-500",
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

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
        <span className="text-xs text-text-secondary font-medium">
          Loading your learning progress...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-8 text-center flex flex-col items-center">
        <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
        <p className="text-sm font-semibold text-rose-600 dark:text-rose-200">Unable to load learning progress</p>
        <p className="text-xs text-rose-500/80 mt-1 max-w-sm">{error}</p>
        <button
          onClick={loadData}
          className="mt-4 px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-600 dark:text-rose-200 text-xs font-medium border border-rose-500/30 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header (Open Section) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
        <div>
          <h2 className="text-xl font-bold text-text-primary tracking-tight">Growth</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Track how your understanding changes over time.
          </p>
        </div>

        {/* Sub-Navigation Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setActiveSubSection("overview")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
              activeSubSection === "overview"
                ? "bg-accent text-white shadow-sm"
                : "bg-surface-muted text-text-secondary hover:text-text-primary border border-border/70"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveSubSection("plan")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
              activeSubSection === "plan"
                ? "bg-accent text-white shadow-sm"
                : "bg-surface-muted text-text-secondary hover:text-text-primary border border-border/70"
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
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
              activeSubSection === "concepts"
                ? "bg-accent text-white shadow-sm"
                : "bg-surface-muted text-text-secondary hover:text-text-primary border border-border/70"
            }`}
          >
            Concept Mastery
          </button>
          <button
            onClick={() => {
              setActiveSubSection("journey");
              document.getElementById("progress-chart-card")?.scrollIntoView({ behavior: "smooth" });
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
              activeSubSection === "journey"
                ? "bg-accent text-white shadow-sm"
                : "bg-surface-muted text-text-secondary hover:text-text-primary border border-border/70"
            }`}
          >
            Learning Journey
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
          {/* Main Visual: Large Mastery Ring Alongside Status Categories */}
          <div className="p-6 rounded-3xl bg-surface/80 border border-border/70 shadow-xs flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Left: Large Mastery Ring */}
            <div className="flex items-center gap-6">
              <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
                <svg className="w-28 h-28 -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-surface-muted"
                    strokeWidth="3.2"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-accent transition-all duration-700"
                    strokeDasharray={`${avgMastery || 0}, 100`}
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center text-center">
                  <span className="text-2xl font-extrabold text-text-primary font-mono tracking-tight">
                    {avgMastery !== null ? `${avgMastery}%` : "0%"}
                  </span>
                  <span className="text-[10px] text-text-muted font-medium">Overall Mastery</span>
                </div>
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-bold text-text-primary">Bayesian Mastery Engine</h3>
                <p className="text-xs text-text-muted max-w-xs leading-relaxed">
                  Confidence-weighted mastery progression across your project's {totalConcepts} extracted concepts.
                </p>
              </div>
            </div>

            {/* Right: 4 Status Breakdowns Alongside */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full md:w-auto">
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center min-w-[100px]">
                <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono block">
                  {masteredCount}
                </span>
                <span className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                  Mastered
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-center min-w-[100px]">
                <span className="text-xl font-bold text-sky-600 dark:text-sky-400 font-mono block">
                  {learningCount}
                </span>
                <span className="text-[11px] text-sky-700 dark:text-sky-300 font-medium">
                  Learning
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-center min-w-[100px]">
                <span className="text-xl font-bold text-amber-600 dark:text-amber-400 font-mono block">
                  {needsReviewCount}
                </span>
                <span className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                  Needs Review
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-surface-muted border border-border text-center min-w-[100px]">
                <span className="text-xl font-bold text-text-muted font-mono block">
                  {notStartedCount}
                </span>
                <span className="text-[11px] text-text-secondary font-medium">
                  Not Started
                </span>
              </div>
            </div>
          </div>

          {/* Overview Roadmap Hero Widget */}
          {learningPlan && (
            <div className="p-4 rounded-2xl bg-surface border border-border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-600/15 border border-indigo-500/25 text-accent flex items-center justify-center shrink-0">
                  <Compass className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-text-primary tracking-tight">
                      {learningPlan.title}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/15 text-accent border border-indigo-500/25">
                      {learningPlan.progress.completed_count}/{learningPlan.progress.total_concepts} Concepts ({learningPlan.progress.progress_percentage}%)
                    </span>
                  </div>
                  <div className="text-[11px] text-text-muted mt-0.5">
                    {learningPlan.next_recommended_concept ? (
                      <span>
                        Next Milestone:{" "}
                        <strong className="text-text-primary">
                          #{learningPlan.next_recommended_concept.position + 1} {learningPlan.next_recommended_concept.concept_name}
                        </strong>{" "}
                        ({learningPlan.next_recommended_concept.recommended_action || "Study"})
                      </span>
                    ) : (
                      <span className="text-emerald-500 font-medium">All curriculum milestones completed!</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setActiveSubSection("plan")}
                  className="px-3.5 py-1.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow-md shadow-accent/25 transition-all hover:scale-[1.02] cursor-pointer"
                >
                  View Full Roadmap &rarr;
                </button>
              </div>
            </div>
          )}

      {/* ================================================================ */}
      {/* 3. MAIN GROWTH CHART & LEARNING INSIGHTS (2 COLUMNS)             */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Your Learning Progress Chart (8 cols) */}
        <div
          id="progress-chart-card"
          className="lg:col-span-8 p-6 rounded-2xl bg-surface border border-border shadow-sm"
        >
          <div className="flex items-center justify-between pb-4 border-b border-border mb-4">
            <div>
              <h3 className="text-sm font-bold text-text-primary tracking-tight flex items-center gap-2">
                <LineChart className="w-4 h-4 text-emerald-500" />
                Your Learning Progress
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                How your understanding has changed over time
              </p>
            </div>
            {trajectoryPoints.length >= 2 && (
              <span className="text-[11px] font-mono text-accent bg-accent/10 px-2 py-0.5 rounded-full border border-accent/20 font-bold">
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
                <div className="flex justify-between pl-8 pr-2 pt-2 text-[10px] text-text-muted font-mono">
                  {trajectoryPoints.map((p, idx) => (
                    <span key={idx}>{p.date}</span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-surface-muted border border-border flex items-center justify-center text-text-muted mb-3">
                <LineChart className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-text-primary">Your progress trend will appear here</h4>
              <p className="text-xs text-text-muted mt-1 max-w-sm">
                Complete a few more assessments to see how your understanding changes over time.
              </p>
              {onNavigateTab && (
                <button
                  onClick={() => onNavigateTab("quiz")}
                  className="mt-4 px-4 py-2 rounded-xl bg-accent hover:opacity-90 text-white text-xs font-semibold shadow-md shadow-accent/20 transition-all"
                >
                  Take an Adaptive Quiz
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Learning Insights (4 cols) */}
        <div className="lg:col-span-4 p-6 rounded-2xl bg-surface border border-border shadow-sm space-y-4">
          <div className="pb-3 border-b border-border">
            <h3 className="text-sm font-bold text-text-primary tracking-tight flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Learning Insights
            </h3>
            <p className="text-xs text-text-muted mt-0.5">Key takeaways from your recent study</p>
          </div>

          <div className="space-y-3">
            {/* Insight 1: Progress */}
            <div className="p-3.5 rounded-xl bg-surface-muted/50 border border-border flex items-start gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-text-primary">
                  {recentGrowthDelta !== null && recentGrowthDelta > 0
                    ? "You're improving!"
                    : strongCount > 0
                    ? "Solid foundation!"
                    : "Ready to accelerate"}
                </div>
                <div className="text-[11px] text-text-muted mt-0.5 leading-relaxed">
                  {recentGrowthDelta !== null && recentGrowthDelta > 0
                    ? `Your mastery has increased by ${recentGrowthDelta.toFixed(1)}% across assessment periods.`
                    : strongCount > 0
                    ? `${strongCount} topics have reached mastery standing (≥70%).`
                    : "Complete quiz assessments to establish your topic mastery baseline."}
                </div>
              </div>
            </div>

            {/* Insight 2: Focus areas */}
            <div className="p-3.5 rounded-xl bg-surface-muted/50 border border-border flex items-start gap-3">
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0">
                <Brain className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-text-primary">Keep going</div>
                <div className="text-[11px] text-text-muted mt-0.5 leading-relaxed">
                  {growthData?.needs_attention && growthData.needs_attention.length > 0
                    ? `${growthData.needs_attention.length} ${
                        growthData.needs_attention.length === 1 ? "topic needs" : "topics need"
                      } focused practice.`
                    : "All tested concepts are in stable or mastered standing."}
                </div>
              </div>
            </div>

            {/* Insight 3: Consistency */}
            <div className="p-3.5 rounded-xl bg-surface-muted/50 border border-border flex items-start gap-3">
              <div className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-text-primary">Stay consistent</div>
                <div className="text-[11px] text-text-muted mt-0.5 leading-relaxed">
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
        className="p-6 rounded-2xl bg-surface border border-border shadow-sm space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border">
          <div>
            <h3 className="text-sm font-bold text-text-primary tracking-tight flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-accent" />
              Concept Mastery
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              Progress for each concept in this project
            </p>
          </div>

          {/* Search & Filter Controls */}
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search concepts..."
                className="pl-8 pr-3 py-1.5 rounded-xl bg-surface border border-border text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent w-40 sm:w-48 transition-colors"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-surface border border-border text-xs text-text-secondary focus:outline-none focus:border-accent transition-colors"
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
                  className="p-4 rounded-xl bg-surface-muted/40 border border-border hover:border-accent/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
                >
                  {/* Concept Name & Progress Bar */}
                  <div className="min-w-[200px] md:max-w-xs flex-1">
                    <div className="font-semibold text-text-primary text-sm truncate">
                      {m.concept_name}
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="font-mono text-text-secondary font-bold shrink-0">
                        {m.mastery_score !== null ? `${Math.round(m.mastery_score)}%` : "—"}
                      </span>
                      <div className="flex-1 max-w-[160px] bg-surface-muted border border-border/50 h-1.5 rounded-full overflow-hidden">
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
                  <div className="shrink-0 text-text-muted text-[11px]">
                    <span className="px-2 py-0.5 rounded-md bg-surface border border-border">
                      {confPill}
                    </span>
                  </div>

                  {/* Trend Indicator */}
                  <div className="shrink-0 w-24 flex items-center gap-1 font-mono text-[11px]">
                    {growth?.status === "improving" ? (
                      <span className="text-emerald-500 flex items-center gap-1 font-semibold">
                        <ArrowUpRight className="w-3.5 h-3.5" /> Improving
                      </span>
                    ) : growth?.status === "needs_attention" ? (
                      <span className="text-amber-500 flex items-center gap-1 font-semibold">
                        <TrendingDown className="w-3.5 h-3.5" /> Practice
                      </span>
                    ) : growth?.status === "stable" ? (
                      <span className="text-text-muted flex items-center gap-1">
                        <Minus className="w-3.5 h-3.5" /> Stable
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
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
                        className="px-3 py-1.5 rounded-lg bg-surface hover:bg-accent/10 text-text-secondary hover:text-accent border border-border hover:border-accent/40 text-xs font-semibold transition-all flex items-center gap-1"
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
          <div className="py-8 text-center text-xs text-text-muted">
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
          className="lg:col-span-8 p-6 rounded-2xl bg-surface border border-border shadow-sm space-y-3"
        >
          <div className="pb-2 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-bold text-text-primary tracking-tight flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              What to Do Next
            </h3>
            <span className="text-[11px] text-text-muted">Targeted study recommendations</span>
          </div>

          {recommendations.length > 0 ? (
            <div className="p-4 rounded-xl bg-surface-muted/60 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-mono font-semibold uppercase text-accent flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Recommended Next Step
                </div>
                <h4 className="text-sm font-bold text-text-primary">
                  {recommendations[0].title}
                </h4>
                <p className="text-xs text-text-muted leading-relaxed max-w-xl">
                  {recommendations[0].reasoning || recommendations[0].body}
                </p>
              </div>

              {onNavigateTab && (
                <button
                  onClick={() => onNavigateTab("quiz")}
                  className="px-4 py-2 rounded-xl bg-accent hover:opacity-90 text-white text-xs font-semibold shadow-md shadow-accent/20 shrink-0 transition-all"
                >
                  Start Practice &rarr;
                </button>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-surface-muted/30 border border-border text-center py-6">
              <h4 className="text-xs font-bold text-text-secondary">Keep learning</h4>
              <p className="text-[11px] text-text-muted mt-1 max-w-md mx-auto">
                Complete another assessment to receive a personalized next step recommendation.
              </p>
              {onNavigateTab && (
                <button
                  onClick={() => onNavigateTab("quiz")}
                  className="mt-3 px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-muted text-text-secondary text-xs font-medium border border-border transition-colors"
                >
                  Take a Practice Quiz
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Study Streak (4 cols) */}
        <div className="lg:col-span-4 p-6 rounded-2xl bg-surface border border-border shadow-sm space-y-4">
          <div className="pb-2 border-b border-border">
            <h3 className="text-sm font-bold text-text-primary tracking-tight flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" />
              Study Streak
            </h3>
            <p className="text-xs text-text-muted mt-0.5">Your study habit consistency</p>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-500 flex items-center justify-center text-xl shrink-0">
              🔥
            </div>
            <div>
              <div className="text-xl font-bold text-text-primary">
                {streakCount > 0 ? `${streakCount} days` : "0 days"}
              </div>
              <div className="text-[11px] text-text-muted">
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
                    <span className="text-[10px] font-mono text-text-muted font-semibold">
                      {dayName}
                    </span>
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] transition-all ${
                        isActive
                          ? "bg-accent text-white font-bold shadow-sm shadow-accent/30"
                          : "bg-surface-muted text-text-muted border border-border"
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
      <div className="text-center pt-4 pb-2 text-xs text-text-muted italic">
        &ldquo;Progress, not perfection, leads to mastery.&rdquo;
      </div>
    </div>
  );
};
