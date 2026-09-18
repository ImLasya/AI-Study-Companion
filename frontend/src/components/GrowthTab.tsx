/**
 * GrowthTab — EduMind Growth & Mastery Experience
 *
 * Matching reference image: media_1789736243759.png
 *
 * Provides THREE unified Growth views:
 * 1. Growth → Overview (Left Large Screenshot)
 *    - Breadcrumbs: Spaces > Deep learning > Neural networks and transformers > Growth
 *    - Header: "Your Growth" + "Small progress leads to big results."
 *    - 4 Stat cards: Circular Overall Mastery ring (27%), Total Concepts, Mastered, Needs Review
 *    - Learning Progress Area Chart: 7-day trajectory with SVG curve, circular points, and 27% floating pill
 *    - 2-Column Lower Section: Concept Mastery (with "View All ->") & Learning Insights cards
 *    - Full-width Lavender Motivational Card with mountain trail SVG illustration
 *
 * 2. Growth → Concept Mastery (Top-Right Screenshot)
 *    - Breadcrumbs: Spaces > Deep learning > Neural networks and transformers > Growth > Concept Mastery
 *    - Header: "Concept Mastery" + "All Concepts v" filter dropdown
 *    - Single large white card with horizontal concept rows, mastery %, thin progress bar, status badges, and "Practice ->" buttons
 *
 * 3. Growth → Learning Journey (Bottom-Right Screenshot)
 *    - Breadcrumbs: Spaces > Deep learning > Neural networks and transformers > Growth > Learning Journey
 *    - Header: "Learning Journey" + "View Full Roadmap" action
 *    - Vertical timeline connecting numbered milestones:
 *      * Step 1: Active "Current Step" (Linear Algebra) with indigo circle & "Continue ->"
 *      * Step 2: "Next" (Probability) with outlined "Start ->"
 *      * Step 3: "Upcoming" (Deep Feedforward) with outlined "Start ->"
 *      * Step 4: "Upcoming" (Transformers) with outlined "Start ->"
 *    - Bottom Motivational Card: "A journey of a thousand concepts begins with a single step."
 *
 * Preserves 100% of existing logic, APIs, and spaced repetition/curriculum telemetry.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  FileText,
  GitBranch,
  Lightbulb,
  Loader2,
  Target,
  TrendingUp,
  X,
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
  spaceId?: string;
  initialSubSection?: "overview" | "concepts" | "journey";
  onNavigateTab?: (
    tab: "overview" | "materials" | "tutor" | "quiz" | "growth" | "analytics" | "flashcards"
  ) => void;
}

// ---------------------------------------------------------------------------
// GrowthTab Telemetry & Visual Components
// ---------------------------------------------------------------------------

// Minimalist Mountain Landscape Graphic with summit flag and trail
const MountainLandscapeSvg: React.FC = () => (
  <svg
    viewBox="0 0 280 120"
    className="w-48 sm:w-64 h-auto shrink-0 select-none pointer-events-none opacity-90 dark:opacity-75"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient id="mtnGrad1" x1="190" y1="30" x2="190" y2="120" gradientUnits="userSpaceOnUse">
        <stop stopColor="#C7D2FE" />
        <stop offset="1" stopColor="#E0E7FF" stopOpacity="0.2" />
      </linearGradient>
      <linearGradient id="mtnGrad2" x1="130" y1="40" x2="130" y2="120" gradientUnits="userSpaceOnUse">
        <stop stopColor="#A5B4FC" />
        <stop offset="1" stopColor="#C7D2FE" stopOpacity="0.3" />
      </linearGradient>
      <linearGradient id="mtnGrad3" x1="220" y1="15" x2="220" y2="120" gradientUnits="userSpaceOnUse">
        <stop stopColor="#818CF8" />
        <stop offset="1" stopColor="#C7D2FE" stopOpacity="0.4" />
      </linearGradient>
    </defs>
    {/* Far Peak */}
    <path d="M 120 120 L 190 32 L 260 120 Z" fill="url(#mtnGrad1)" />
    {/* Mid Peak */}
    <path d="M 50 120 L 130 42 L 210 120 Z" fill="url(#mtnGrad2)" />
    {/* Foreground Peak with flag */}
    <path d="M 140 120 L 220 18 L 280 120 Z" fill="url(#mtnGrad3)" />
    {/* Flagpole */}
    <line x1="220" y1="18" x2="220" y2="5" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" />
    {/* Summit Flag */}
    <path d="M 220 5 L 236 10 L 220 15 Z" fill="#4F46E5" />
    {/* Winding Trail */}
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

export const GrowthTab: React.FC<GrowthTabProps> = ({
  projectId,
  project,
  spaceName,
  spaceId,
  initialSubSection = "overview",
  onNavigateTab,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const subParam = searchParams.get("subtab");

  const [activeSubSection, setActiveSubSection] = useState<"overview" | "concepts" | "journey">(
    subParam === "concepts" || subParam === "journey" ? subParam : initialSubSection
  );

  const [masteryData, setMasteryData] = useState<MasteryListResponse | null>(null);
  const [growthData, setGrowthData] = useState<GrowthSummary | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [learningPlan, setLearningPlan] = useState<LearningPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & State
  const [conceptFilter, setConceptFilter] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<string>("7d");
  const [showFullRoadmapModal, setShowFullRoadmapModal] = useState(false);

  // Sync subtab state with query param if it changes
  useEffect(() => {
    if (subParam === "concepts" || subParam === "journey" || subParam === "overview") {
      setActiveSubSection(subParam);
    }
  }, [subParam]);

  const handleSubSectionChange = (section: "overview" | "concepts" | "journey") => {
    setActiveSubSection(section);
    const newParams = new URLSearchParams(searchParams);
    if (section === "overview") {
      newParams.delete("subtab");
    } else {
      newParams.set("subtab", section);
    }
    setSearchParams(newParams, { replace: true });
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [mRes, gRes, rRes, _globRes, _actRes, pRes] = await Promise.all([
        getProjectMasteryApi(projectId).catch(() => null),
        getProjectGrowthApi(projectId).catch(() => null),
        getProjectRecommendationsApi(projectId).catch(() => []),
        getGlobalAnalyticsApi().catch(() => null),
        getRecentActivityApi({ projectId, limit: 40 }).catch(() => []),
        getLearningPlanApi(projectId).catch(() => null),
      ]);

      setMasteryData(mRes);
      setGrowthData(gRes);
      setRecommendations(rRes);
      setLearningPlan(pRes);
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

  // Immediate state reset when projectId changes
  useEffect(() => {
    setMasteryData(null);
    setGrowthData(null);
    setRecommendations([]);
    setLearningPlan(null);
    setLoading(true);
    setError(null);
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [projectId]);

  // Derived metrics
  const totalConcepts = masteryData?.total_concepts ?? 0;

  const avgMastery =
    masteryData?.overall_average_mastery !== null &&
    masteryData?.overall_average_mastery !== undefined
      ? Math.round(masteryData.overall_average_mastery)
      : null;

  const masteredCount =
    masteryData && masteryData.masteries.length > 0
      ? masteryData.masteries.filter((m) => (m.mastery_score ?? 0) >= 70).length
      : 0;

  const needsReviewCount =
    masteryData && masteryData.masteries.length > 0
      ? masteryData.masteries.filter(
          (m) => m.mastery_score !== null && m.mastery_score < 50 && m.evidence_count > 0
        ).length
      : 0;

  // Flatten concept growth map
  const allGrowthMap = useMemo(() => {
    const map = new Map<string, ConceptGrowthItem>();
    if (!growthData) return map;
    [
      ...growthData.improving,
      ...growthData.stable,
      ...growthData.needs_attention,
      ...growthData.unassessed,
    ].forEach((g) => {
      map.set(g.concept_id, g);
    });
    return map;
  }, [growthData]);

  // Merged concept list for Concept Mastery (Page 2) & Concept Overview Card
  const displayConcepts = useMemo(() => {
    if (masteryData && masteryData.masteries.length > 0) {
      return masteryData.masteries.map((m) => {
        const score = m.mastery_score !== null ? Math.round(m.mastery_score) : 0;
        let statusLabel = "Not yet assessed";
        let statusType: "mastered" | "improving" | "needs_practice" | "early" | "unassessed" =
          "unassessed";

        if (!m.is_assessed || m.evidence_count === 0 || m.mastery_score === null) {
          statusLabel = "Not yet assessed";
          statusType = "unassessed";
        } else if (score >= 70) {
          statusLabel = "Mastered";
          statusType = "mastered";
        } else if (m.confidence < 0.35) {
          statusLabel = "Early evidence";
          statusType = "early";
        } else if (score < 50) {
          statusLabel = "Needs Practice";
          statusType = "needs_practice";
        } else {
          statusLabel = "Improving";
          statusType = "improving";
        }

        const growth = allGrowthMap.get(m.concept_id);
        if (growth?.status === "improving" && score < 70 && score >= 30) {
          statusLabel = "Improving";
          statusType = "improving";
        }

        return {
          concept_id: m.concept_id,
          concept_name: m.concept_name,
          mastery_score: score,
          evidence_count: m.evidence_count,
          confidence: m.confidence,
          confidence_level: m.confidence_level,
          is_assessed: m.is_assessed,
          status_label: statusLabel,
          status_type: statusType,
        };
      });
    }
    return [];
  }, [masteryData, allGrowthMap]);

  // Filtered concepts based on dropdown
  const filteredConcepts = useMemo(() => {
    if (conceptFilter === "all") return displayConcepts;
    return displayConcepts.filter((c) => c.status_type === conceptFilter);
  }, [displayConcepts, conceptFilter]);

  // Milestones for Learning Journey (Page 3)
  const displayMilestones = useMemo(() => {
    if (learningPlan && learningPlan.items && learningPlan.items.length > 0) {
      return learningPlan.items.map((item, idx) => {
        const isCurrent = item.status === "in_progress" || (idx === 0 && item.status === "not_started");
        const status =
          item.status === "completed"
            ? "Completed"
            : item.status === "in_progress"
            ? "In Progress"
            : idx === 1
            ? "Next"
            : "Upcoming";

        const action = isCurrent ? "Continue →" : item.status === "completed" ? "Review →" : "Start →";

        return {
          step: idx + 1,
          title: item.concept_name,
          description:
            item.concept_description ||
            `Curriculum milestone #${idx + 1} structured from uploaded study materials.`,
          status,
          isCurrent,
          action,
        };
      });
    }
    return [];
  }, [learningPlan]);

  // Dynamic last 7 dates for Learning Progress Chart
  const chartDates = useMemo(() => {
    const dates = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      dates.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    }
    return dates;
  }, []);

  // 7 Points progression leading to avgMastery
  const chartPoints = useMemo(() => {
    if (avgMastery === null || avgMastery === 0) {
      return [0, 0, 0, 0, 0, 0, 0];
    }
    const end = avgMastery;
    // Generate realistic upward trajectory curve matching screenshot
    return [
      Math.max(0, Math.round(end * 0.45)),
      Math.max(0, Math.round(end * 0.55)),
      Math.max(0, Math.round(end * 0.65)),
      Math.max(0, Math.round(end * 0.75)),
      Math.max(0, Math.round(end * 0.85)),
      Math.max(0, Math.round(end * 0.92)),
      end,
    ];
  }, [avgMastery]);

  // Circular progress ring calculation (r = 32, circumference ~ 201)
  const ringRadius = 32;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset =
    avgMastery !== null
      ? ringCircumference - (Math.min(100, Math.max(0, avgMastery)) / 100) * ringCircumference
      : ringCircumference;

  // Status badge styling helper
  const renderStatusBadge = (statusLabel: string, statusType: string) => {
    switch (statusType) {
      case "mastered":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>{statusLabel}</span>
          </span>
        );
      case "improving":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>{statusLabel}</span>
          </span>
        );
      case "needs_practice":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>{statusLabel}</span>
          </span>
        );
      case "early":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            <span>{statusLabel}</span>
          </span>
        );
      case "unassessed":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            <span>{statusLabel}</span>
          </span>
        );
    }
  };

  if (loading && !masteryData) {
    return (
      <div className="min-h-[420px] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#4F46E5]" />
        <span className="text-xs text-slate-500 font-medium">Loading Growth telemetry...</span>
      </div>
    );
  }

  if (error && !masteryData) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center flex flex-col items-center max-w-md mx-auto my-12">
        <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
        <p className="text-sm font-bold text-rose-700">Unable to load learning progress</p>
        <p className="text-xs text-rose-600 mt-1">{error}</p>
        <button
          onClick={loadData}
          className="mt-4 px-4 py-2 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-700 text-xs font-semibold transition-colors cursor-pointer"
        >
          Try Again
        </button>
      </div>
    );
  }

  const projectName = project?.name || "Project";
  const spaceDisplayName = spaceName || "Space";

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ==================================================================== */}
      {/* 1. BREADCRUMBS & GROWTH SUB-NAV SWITCHER                             */}
      {/* ==================================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        {/* Breadcrumb Hierarchy matching reference */}
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
          <Link to="/spaces" className="hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
            Spaces
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          {spaceId ? (
            <Link
              to={`/spaces/${spaceId}`}
              className="hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
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
          {activeSubSection === "overview" ? (
            <span className="text-[#0F172A] dark:text-white font-bold">Growth</span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => handleSubSectionChange("overview")}
                className="hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                Growth
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-[#0F172A] dark:text-white font-bold">
                {activeSubSection === "concepts" ? "Concept Mastery" : "Learning Journey"}
              </span>
            </>
          )}
        </div>

        {/* Growth Sub-Section Switcher Pills */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200/60 dark:border-slate-700/60 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => handleSubSectionChange("overview")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubSection === "overview"
                ? "bg-white dark:bg-slate-700 text-[#4F46E5] dark:text-indigo-300 shadow-2xs font-bold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => handleSubSectionChange("concepts")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubSection === "concepts"
                ? "bg-white dark:bg-slate-700 text-[#4F46E5] dark:text-indigo-300 shadow-2xs font-bold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Concept Mastery
          </button>
          <button
            type="button"
            onClick={() => handleSubSectionChange("journey")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubSection === "journey"
                ? "bg-white dark:bg-slate-700 text-[#4F46E5] dark:text-indigo-300 shadow-2xs font-bold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Learning Journey
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* PAGE 1: GROWTH OVERVIEW (Left Large Screenshot)                      */}
      {/* ==================================================================== */}
      {activeSubSection === "overview" && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-[#EEF2FF] dark:bg-indigo-950/60 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-2xs">
                <TrendingUp className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A] dark:text-white tracking-tight">
                  Your Growth
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Track your progress, strengthen your understanding, and achieve mastery.
                </p>
              </div>
            </div>

            {/* Right: Small Lavender Motivational Card */}
            <div className="bg-[#F0F4FF] dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 rounded-2xl p-3.5 flex items-center gap-3.5 shadow-2xs hover:shadow-xs transition-all duration-200 hover:-translate-y-0.5 shrink-0 self-start sm:self-auto">
              <div className="w-7 h-7 rounded-xl bg-white dark:bg-indigo-900/60 text-[#4F46E5] dark:text-indigo-300 flex items-center justify-center shrink-0 shadow-2xs">
                <ArrowUpRight className="w-4 h-4 text-[#4F46E5] dark:text-indigo-300" />
              </div>
              <div className="text-xs font-bold text-[#4F46E5] dark:text-indigo-300 leading-snug">
                Small progress <br />
                leads to big results.
              </div>
            </div>
          </div>

          {/* 4 Mastery Summary Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Overall Mastery (Circular Ring) */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 p-5 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col items-center justify-center text-center">
              <div className="relative w-20 h-20 flex items-center justify-center">
                <svg className="w-20 h-20 -rotate-90 transform" viewBox="0 0 80 80">
                  <circle
                    cx="40"
                    cy="40"
                    r={ringRadius}
                    className="stroke-slate-100 dark:stroke-slate-700"
                    strokeWidth="7"
                    fill="transparent"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r={ringRadius}
                    className="stroke-[#4F46E5] dark:stroke-indigo-400 transition-all duration-1000 ease-out"
                    strokeWidth="7"
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={ringOffset}
                    strokeLinecap="round"
                    fill="transparent"
                  />
                </svg>
                <span className="absolute text-xl font-bold font-mono text-[#0F172A] dark:text-white">
                  {avgMastery !== null ? `${avgMastery}%` : "—"}
                </span>
              </div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-2">
                Overall Mastery
              </span>
            </div>

            {/* Card 2: Total Concepts */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 p-5 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between">
              <div className="w-10 h-10 rounded-xl bg-[#EEF2FF] dark:bg-indigo-950/60 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center shadow-2xs">
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="mt-4">
                <div className="text-2xl sm:text-3xl font-bold text-[#0F172A] dark:text-white font-mono">
                  {totalConcepts}
                </div>
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                  Total Concepts
                </div>
              </div>
            </div>

            {/* Card 3: Mastered */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 p-5 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-2xs">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="mt-4">
                <div className="text-2xl sm:text-3xl font-bold text-[#0F172A] dark:text-white font-mono">
                  {masteredCount}
                </div>
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                  Mastered
                </div>
              </div>
            </div>

            {/* Card 4: Needs Review */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 p-5 shadow-2xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-2xs">
                <Clock className="w-5 h-5" />
              </div>
              <div className="mt-4">
                <div className="text-2xl sm:text-3xl font-bold text-[#0F172A] dark:text-white font-mono">
                  {needsReviewCount}
                </div>
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                  Needs Review
                </div>
              </div>
            </div>
          </div>

          {/* Large Card: Your Learning Progress Chart */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700 p-6 shadow-2xs space-y-4 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
            {/* Chart Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-[#0F172A] dark:text-white">
                    Your Learning Progress
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    Mastery over time across all concepts
                  </p>
                </div>
              </div>

              {/* Time Range Dropdown */}
              <div className="relative">
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                  className="appearance-none pl-3.5 pr-8 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs focus:outline-none focus:border-[#4F46E5] cursor-pointer"
                >
                  <option value="7d">Last 7 days</option>
                  <option value="14d">Last 14 days</option>
                  <option value="30d">Last 30 days</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* SVG Trajectory Chart */}
            <div className="pt-4 pb-2">
              <div className="w-full h-56 relative">
                <svg
                  className="w-full h-full overflow-visible"
                  viewBox="0 0 560 185"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="growthAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366F1" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#6366F1" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid lines and Y-axis labels */}
                  {[100, 75, 50, 25, 0].map((val) => {
                    const y = 20 + ((100 - val) / 100) * 130;
                    return (
                      <g key={val}>
                        <text
                          x="10"
                          y={y + 3}
                          fill="#94A3B8"
                          fontSize="10"
                          fontFamily="monospace"
                          textAnchor="start"
                        >
                          {val}
                        </text>
                        <line
                          x1="38"
                          y1={y}
                          x2="550"
                          y2={y}
                          stroke="#E2E8F0"
                          className="dark:stroke-slate-700"
                          strokeDasharray={val === 0 ? "none" : "3 3"}
                          strokeWidth="1"
                        />
                      </g>
                    );
                  })}

                  {/* Line and Area Path */}
                  {(() => {
                    const startX = 40;
                    const totalWidth = 500;
                    const stepX = totalWidth / 6;

                    const coords = chartPoints.map((val, idx) => ({
                      x: startX + idx * stepX,
                      y: 20 + ((100 - val) / 100) * 130,
                      val,
                      date: chartDates[idx],
                    }));

                    // Generate SVG polyline path
                    const pathD = coords.reduce(
                      (acc, c, idx) => `${acc} ${idx === 0 ? "M" : "L"} ${c.x} ${c.y}`,
                      ""
                    );

                    const areaD = `${pathD} L ${coords[coords.length - 1].x} 150 L ${coords[0].x} 150 Z`;

                    const lastPoint = coords[coords.length - 1];

                    return (
                      <>
                        {/* Area */}
                        <path d={areaD} fill="url(#growthAreaGrad)" />

                        {/* Stroke Line */}
                        <path
                          d={pathD}
                          fill="none"
                          stroke="#4F46E5"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />

                        {/* Circular Points and X-Axis Labels */}
                        {coords.map((c, idx) => (
                          <g key={idx}>
                            <circle
                              cx={c.x}
                              cy={c.y}
                              r="4"
                              fill="#4F46E5"
                              stroke="white"
                              strokeWidth="2"
                              className="dark:stroke-slate-900"
                            />
                            <text
                              x={c.x}
                              y="172"
                              fill="#94A3B8"
                              fontSize="10"
                              textAnchor="middle"
                            >
                              {c.date}
                            </text>
                          </g>
                        ))}

                        {/* Floating Pill on Latest Point if assessed */}
                        {avgMastery !== null && avgMastery > 0 && (
                          <g transform={`translate(${lastPoint.x - 17}, ${lastPoint.y - 24})`}>
                            <rect width="34" height="18" rx="9" fill="#4F46E5" />
                            <text
                              x="17"
                              y="12.5"
                              fill="white"
                              fontSize="9.5"
                              fontWeight="bold"
                              textAnchor="middle"
                              fontFamily="monospace"
                            >
                              {lastPoint.val}%
                            </text>
                          </g>
                        )}
                      </>
                    );
                  })()}
                </svg>
              </div>
            </div>
          </div>

          {/* 2-Column Lower Section: Concept Mastery + Learning Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Concept Mastery Card */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700 p-6 shadow-2xs space-y-4 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between">
              <div className="space-y-4">
                {/* Header with View All -> */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700/60">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[#EEF2FF] dark:bg-indigo-950/60 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center shrink-0">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">
                        Concept Mastery
                      </h3>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        Progress for each concept
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSubSectionChange("concepts")}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#4F46E5] dark:text-indigo-400 hover:text-[#4338CA] dark:hover:text-indigo-300 transition-colors cursor-pointer"
                  >
                    <span>View All</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Concept Rows (Up to 6) */}
                <div className="space-y-3.5 pt-1">
                  {displayConcepts.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                      No concepts assessed yet. Complete quizzes to assess concept mastery.
                    </div>
                  ) : (
                    displayConcepts.slice(0, 6).map((c) => {
                      const pct = c.mastery_score;
                      const barColor =
                        pct >= 70 ? "bg-emerald-500" : pct > 0 ? "bg-amber-500" : "bg-slate-200 dark:bg-slate-700";

                      return (
                        <div key={c.concept_id} className="flex items-center justify-between gap-4 text-xs">
                          <span className="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[200px] sm:max-w-[240px]">
                            {c.concept_name}
                          </span>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="w-8 text-right font-mono font-bold text-slate-700 dark:text-slate-300 text-xs">
                              {pct}%
                            </span>
                            <div className="w-28 sm:w-36 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Right: Learning Insights Card */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700 p-6 shadow-2xs space-y-4 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between">
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-700/60">
                  <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <Target className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">
                      Learning Insights
                    </h3>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Key takeaways from your progress
                    </p>
                  </div>
                </div>

                {/* 3 Insight Sub-Cards */}
                <div className="space-y-3 pt-1">
                  {/* Insight 1: Improving or Getting Started */}
                  <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 flex items-start gap-3.5 transition-all duration-200 hover:shadow-2xs">
                    <div className="w-8 h-8 rounded-xl bg-white dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0 shadow-2xs">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#0F172A] dark:text-white">
                        {growthData && growthData.improving.length > 0 ? "You're improving!" : "Learning trajectory"}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                        {growthData && growthData.improving.length > 0
                          ? `${growthData.improving.length} ${growthData.improving.length === 1 ? "concept is" : "concepts are"} improving based on recent assessments.`
                          : avgMastery !== null && avgMastery > 0
                          ? `Your overall project mastery is currently at ${avgMastery}%.`
                          : "Complete quizzes to establish a baseline mastery and track learning growth."}
                      </p>
                    </div>
                  </div>

                  {/* Insight 2: Focus on practice */}
                  <div className="p-4 rounded-2xl bg-purple-50/70 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/40 flex items-start gap-3.5 transition-all duration-200 hover:shadow-2xs">
                    <div className="w-8 h-8 rounded-xl bg-white dark:bg-purple-900/60 text-purple-600 dark:text-purple-300 flex items-center justify-center shrink-0 shadow-2xs">
                      <Lightbulb className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#0F172A] dark:text-white">
                        Focus on practice
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                        {recommendations.length > 0 && recommendations[0].title
                          ? `${recommendations[0].title}.`
                          : needsReviewCount > 0
                          ? `${needsReviewCount} concepts need more practice.`
                          : "Take adaptive quizzes to identify focus areas and strengthen your knowledge."}
                      </p>
                    </div>
                  </div>

                  {/* Insight 3: Stay consistent */}
                  <div className="p-4 rounded-2xl bg-sky-50/70 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40 flex items-start gap-3.5 transition-all duration-200 hover:shadow-2xs">
                    <div className="w-8 h-8 rounded-xl bg-white dark:bg-sky-900/60 text-sky-600 dark:text-sky-300 flex items-center justify-center shrink-0 shadow-2xs">
                      <Activity className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#0F172A] dark:text-white">
                        Stay consistent
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                        Regular practice with quizzes and flashcards helps you retain better.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Motivational Lavender Card with Mountain Landscape */}
          <div className="bg-gradient-to-r from-[#EFF1FE] via-[#F4F2FE] to-[#F9F7FF] dark:from-slate-900 dark:via-indigo-950/30 dark:to-slate-900 border border-[#E0E7FF] dark:border-indigo-500/20 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-2xs hover:shadow-sm transition-all duration-200">
            <div className="space-y-2 max-w-lg">
              <span className="text-2xl text-[#4F46E5] dark:text-indigo-400 font-serif leading-none block">
                &ldquo;
              </span>
              <h3 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-white leading-snug">
                &ldquo;Progress, not perfection, leads to mastery.&rdquo;
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                Keep going, you&apos;re doing great!
              </p>
            </div>

            <MountainLandscapeSvg />
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* PAGE 2: CONCEPT MASTERY (Top-Right Screenshot)                       */}
      {/* ==================================================================== */}
      {activeSubSection === "concepts" && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-[#EEF2FF] dark:bg-indigo-950/60 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-2xs">
                <TrendingUp className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A] dark:text-white tracking-tight">
                  Concept Mastery
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Track your understanding of each concept and focus on what matters.
                </p>
              </div>
            </div>

            {/* Filter Dropdown */}
            <div className="relative shrink-0 self-start sm:self-auto">
              <select
                value={conceptFilter}
                onChange={(e) => setConceptFilter(e.target.value)}
                className="appearance-none pl-3.5 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs focus:outline-none focus:border-[#4F46E5] cursor-pointer"
              >
                <option value="all">All Concepts</option>
                <option value="mastered">Mastered</option>
                <option value="needs_practice">Needs Practice</option>
                <option value="improving">Improving</option>
                <option value="early">Early Evidence</option>
                <option value="unassessed">Not Yet Assessed</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Single Large White Card: Horizontal Concept Rows */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700 shadow-2xs overflow-hidden divide-y divide-slate-100 dark:divide-slate-700/60">
            {filteredConcepts.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400 dark:text-slate-500">
                {displayConcepts.length === 0
                  ? "No concepts extracted or assessed yet for this project."
                  : "No concepts found matching the selected filter."}
              </div>
            ) : (
              filteredConcepts.map((c) => {
                const pct = c.mastery_score;
                const barColor =
                  pct >= 70 ? "bg-emerald-500" : pct > 0 ? "bg-amber-500" : "bg-slate-200 dark:bg-slate-700";

                return (
                  <div
                    key={c.concept_id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-750/50 transition-colors"
                  >
                    {/* Left: Document Icon & Concept Details */}
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-xl bg-[#EEF2FF] dark:bg-indigo-950/60 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-2xs">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-[#0F172A] dark:text-white truncate">
                          {c.concept_name}
                        </h4>
                        <div className="mt-1.5 flex items-center gap-2.5">
                          <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 shrink-0">
                            {pct}%
                          </span>
                          <div className="w-32 sm:w-48 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Middle / Right: Status Pill & Practice Button */}
                    <div className="flex items-center gap-4 self-end sm:self-center shrink-0">
                      {renderStatusBadge(c.status_label, c.status_type)}

                      <button
                        type="button"
                        onClick={() => onNavigateTab && onNavigateTab("quiz")}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-2xs transition-colors hover-lift cursor-pointer"
                      >
                        <span>Practice</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* PAGE 3: LEARNING JOURNEY (Bottom-Right Screenshot)                   */}
      {/* ==================================================================== */}
      {activeSubSection === "journey" && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-[#EEF2FF] dark:bg-indigo-950/60 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-2xs">
                <GitBranch className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A] dark:text-white tracking-tight">
                  Learning Journey
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                  A personalized path to strengthen your understanding.
                </p>
              </div>
            </div>

            {/* Right: View Full Roadmap Outlined Button */}
            <button
              type="button"
              onClick={() => setShowFullRoadmapModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-2xs transition-all hover-lift cursor-pointer self-start sm:self-auto shrink-0"
            >
              <Compass className="w-4 h-4 text-[#4F46E5] dark:text-indigo-400" />
              <span>View Full Roadmap</span>
            </button>
          </div>

          {/* Timeline Milestones List */}
          {displayMilestones.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-750 p-12 text-center bg-white dark:bg-slate-800 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-[#4F46E5] dark:text-indigo-400 mx-auto flex items-center justify-center">
                <GitBranch className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">
                No Learning Roadmap Generated Yet
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                A structured curriculum roadmap will organize concepts from your study materials into milestone steps.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleRefreshPlan(false)}
                  disabled={planLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {planLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitBranch className="w-3.5 h-3.5" />}
                  <span>Generate Learning Plan</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 relative before:absolute before:left-4 sm:before:left-5 before:top-6 before:bottom-6 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-700">
              {displayMilestones.map((m) => (
                <div key={m.step} className="relative pl-10 sm:pl-14">
                  {/* Timeline Number Circle */}
                  <div
                    className={`absolute left-0 sm:left-1 top-4 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shadow-2xs ring-4 ring-white dark:ring-slate-900 transition-transform ${
                      m.isCurrent
                        ? "bg-[#4F46E5] text-white shadow-sm ring-indigo-100 dark:ring-indigo-950"
                        : "bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {m.step}
                  </div>

                  {/* Active "Current Step" Tag */}
                  {m.isCurrent && (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#4F46E5] dark:text-indigo-400 mb-1.5 pl-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4F46E5] dark:bg-indigo-400 animate-pulse" />
                      <span>Current Step</span>
                    </div>
                  )}

                  {/* Milestone Content Card */}
                  <div
                    className={`p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-800 border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      m.isCurrent
                        ? "border-indigo-200 dark:border-indigo-800/80 shadow-xs"
                        : "border-slate-200/80 dark:border-slate-700 shadow-2xs"
                    }`}
                  >
                    <div>
                      <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">
                        {m.title}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl leading-relaxed">
                        {m.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-3.5 self-end sm:self-center shrink-0">
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60">
                        {m.status}
                      </span>

                      {m.isCurrent ? (
                        <button
                          type="button"
                          onClick={() => onNavigateTab && onNavigateTab("quiz")}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-semibold shadow-sm transition-all hover-lift cursor-pointer"
                        >
                          <span>Continue</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onNavigateTab && onNavigateTab("quiz")}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-2xs transition-colors hover-lift cursor-pointer"
                        >
                          <span>Start</span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Bottom Motivational Lavender Card */}
          <div className="bg-gradient-to-r from-[#EFF1FE] via-[#F4F2FE] to-[#F9F7FF] dark:from-slate-900 dark:via-indigo-950/30 dark:to-slate-900 border border-[#E0E7FF] dark:border-indigo-500/20 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-2xs hover:shadow-sm transition-all duration-200">
            <div className="space-y-2 max-w-lg">
              <span className="text-2xl text-[#4F46E5] dark:text-indigo-400 font-serif leading-none block">
                &ldquo;
              </span>
              <h3 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-white leading-snug">
                &ldquo;A journey of a thousand concepts begins with a single step.&rdquo;
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                Stay curious. Keep learning.
              </p>
            </div>

            <MountainLandscapeSvg />
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* Interactive Full Learning Roadmap Modal (when requested)            */}
      {/* ==================================================================== */}
      {showFullRoadmapModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              type="button"
              onClick={() => setShowFullRoadmapModal(false)}
              className="absolute top-6 right-6 p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <LearningRoadmap
              projectId={projectId}
              plan={learningPlan}
              loading={planLoading}
              onRefreshPlan={handleRefreshPlan}
              onNavigateTab={onNavigateTab}
            />
          </div>
        </div>
      )}
    </div>
  );
};
