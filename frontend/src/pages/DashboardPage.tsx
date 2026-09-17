import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  Bot,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Filter,
  Folder,
  HelpCircle,
  Layers,
  Lightbulb,
  Loader2,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import {
  getGlobalAnalyticsApi,
  getGlobalRecommendationsApi,
  getRecentActivityApi,
  listSpacesApi,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  GlobalAnalyticsResponse,
  GlobalRecommendationItem,
  ProjectProgressItem,
  RecentActivityItem,
  Space,
} from "@/types";

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.max(0, Math.floor(diffMs / 1000));
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return dateString;
  }
}

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();

  // Core Data State
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [analytics, setAnalytics] = useState<GlobalAnalyticsResponse | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);
  const [recommendations, setRecommendations] = useState<GlobalRecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Learning Scope Filter (null = All Projects, which is default)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);

  const navigate = useNavigate();

  // 1. Initial Load: Spaces, Global Analytics, Recent Activity, and Global Recommendations
  const loadDashboardData = async (filterProjId: string | null) => {
    try {
      setLoading(true);
      setError(null);

      const [spacesData, analyticsData, activityData, recsData] = await Promise.all([
        listSpacesApi().catch(() => []),
        getGlobalAnalyticsApi().catch(() => null),
        getRecentActivityApi({
          projectId: filterProjId || undefined,
          limit: 15,
        }).catch(() => []),
        getGlobalRecommendationsApi({
          projectId: filterProjId || undefined,
        }).catch(() => []),
      ]);

      setSpaces(spacesData);
      setAnalytics(analyticsData);
      setRecentActivity(activityData);
      setRecommendations(recsData);
    } catch (err: unknown) {
      console.error("Failed to load dashboard data:", err);
      setError("Unable to load complete dashboard telemetry. Please retry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "admin") {
      navigate("/admin", { replace: true });
      return;
    }
    loadDashboardData(selectedProjectId);
  }, [selectedProjectId, user?.role]);

  // Derived Project Context from Filter
  const allProjects: ProjectProgressItem[] = analytics?.projects_by_progress ?? [];
  const selectedProject = selectedProjectId
    ? allProjects.find((p) => p.project_id === selectedProjectId) ?? null
    : null;

  // Derived Metrics based on Scope
  const totalConcepts = selectedProject
    ? selectedProject.total_concepts
    : analytics?.total_study_activity?.total_concepts ??
      allProjects.reduce((acc, p) => acc + p.total_concepts, 0);

  const assessedConcepts = selectedProject
    ? selectedProject.assessed_concepts
    : allProjects.reduce((acc, p) => acc + p.assessed_concepts, 0);

  const masteredCount = selectedProject
    ? selectedProject.mastered_concepts
    : analytics?.total_study_activity?.mastered_concepts ??
      allProjects.reduce((acc, p) => acc + p.mastered_concepts, 0);

  const weakCount = selectedProject
    ? selectedProject.weak_concepts
    : analytics?.total_study_activity?.weak_concepts_count ??
      analytics?.weakest_areas?.length ??
      0;

  // Authoritative completed quiz attempts
  const completedQuizzesCount = selectedProject
    ? selectedProject.completed_quiz_attempts
    : analytics?.total_study_activity?.total_quizzes_completed ?? 0;

  const totalQuizAttemptsCount = selectedProject
    ? selectedProject.total_quiz_attempts
    : analytics?.total_study_activity?.total_quiz_attempts ?? 0;

  const totalAvailableQuizzesCount = selectedProject
    ? selectedProject.total_quiz_definitions
    : analytics?.total_study_activity?.total_quiz_definitions ?? 0;

  // Overall average mastery percentage
  const masteryPercent = selectedProject
    ? selectedProject.average_mastery !== null
      ? Math.round(selectedProject.average_mastery)
      : null
    : allProjects.length > 0
    ? Math.round(
        allProjects
          .filter((p) => p.average_mastery !== null)
          .reduce((acc, p) => acc + (p.average_mastery ?? 0), 0) /
          Math.max(1, allProjects.filter((p) => p.average_mastery !== null).length)
      )
    : null;

  // Weak areas list for Row 4
  const weakAreasList = selectedProject
    ? analytics?.weakest_areas.filter((w) => w.project_id === selectedProject.project_id) ?? []
    : analytics?.weakest_areas ?? [];

  // Active study streak
  const studyStreakDays = analytics?.total_study_activity?.active_study_days ?? 0;

  // Latest active project for quick action navigation
  const latestProject = selectedProject || allProjects[0] || null;

  // User Greeting
  const getUserGreeting = () => {
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const name = user?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "Learner";
    return `${timeOfDay}, ${name}! 👋`;
  };

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority.toLowerCase()) {
      case "high":
      case "p1":
        return "bg-rose-500/10 text-rose-300 border-rose-500/20";
      case "medium":
      case "p2":
        return "bg-amber-500/10 text-amber-300 border-amber-500/20";
      default:
        return "bg-slate-800 text-slate-300 border-slate-700";
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "quiz_completed":
      case "quiz_started":
      case "quiz_created":
        return <Award className="w-4 h-4 text-purple-400" />;
      case "material_uploaded":
        return <FileText className="w-4 h-4 text-sky-400" />;
      case "tutor_turn":
      case "tutor_conversation_started":
        return <Bot className="w-4 h-4 text-indigo-400" />;
      case "mastery_updated":
        return <TrendingUp className="w-4 h-4 text-emerald-400" />;
      default:
        return <Activity className="w-4 h-4 text-slate-400" />;
    }
  };

  if (loading && !analytics) {
    return (
      <div className="py-20 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-7 h-7 text-indigo-400 animate-spin" />
        <p className="text-xs text-slate-400 font-mono">Loading global learning dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ==================================================================== */}
      {/* 1. GLOBAL DASHBOARD HEADER & LEARNING SCOPE FILTER                   */}
      {/* ==================================================================== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-1 border-b border-[#1e293b]/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Learning Dashboard
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {getUserGreeting()} Track your progress across all your learning spaces and projects.
          </p>
        </div>

        {/* Global Scope Selector Filter */}
        <div className="relative self-start md:self-auto">
          <button
            onClick={() => setFilterDropdownOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 border border-[#1e293b] hover:border-indigo-500/50 text-xs font-medium text-slate-200 hover:text-white transition-all shadow-sm"
            aria-label="Filter learning scope"
          >
            <Filter className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-slate-400">Scope:</span>
            <span className="font-semibold text-white max-w-[180px] truncate">
              {selectedProject ? selectedProject.project_name : "All Projects"}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
          </button>

          {/* Scope Dropdown Menu */}
          {filterDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setFilterDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-72 rounded-xl bg-slate-900 border border-[#1e293b] shadow-2xl py-2 z-40 text-xs animate-in fade-in zoom-in-95">
                <div className="px-3 py-1.5 border-b border-[#1e293b] text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                  Filter by Project
                </div>

                <button
                  onClick={() => {
                    setSelectedProjectId(null);
                    setFilterDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                    selectedProjectId === null
                      ? "bg-indigo-600/20 text-indigo-300 font-semibold"
                      : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                    <span>All Projects (Global Workspace)</span>
                  </div>
                  {selectedProjectId === null && (
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  )}
                </button>

                <div className="my-1 border-t border-[#1e293b]/60" />

                {allProjects.map((p) => (
                  <button
                    key={p.project_id}
                    onClick={() => {
                      setSelectedProjectId(p.project_id);
                      setFilterDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                      selectedProjectId === p.project_id
                        ? "bg-indigo-600/20 text-indigo-300 font-semibold"
                        : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="truncate font-medium">{p.project_name}</div>
                      <div className="text-[10px] text-slate-500 truncate">Space: {p.space_name}</div>
                    </div>
                    {selectedProjectId === p.project_id && (
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => loadDashboardData(selectedProjectId)}
            className="underline hover:text-white"
          >
            Retry
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. ROW 1: 4 COMPACT KPI CARDS                                        */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Concepts */}
        <div className="rounded-2xl border border-[#1e293b] bg-slate-900/50 p-4 relative group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Total Concepts</span>
            <div className="p-1.5 rounded-lg bg-indigo-600/10 text-indigo-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-bold text-white font-mono">
              {totalConcepts}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {selectedProject ? `In ${selectedProject.project_name}` : "Across all projects"}
          </p>
        </div>

        {/* KPI 2: Mastered */}
        <div className="rounded-2xl border border-[#1e293b] bg-slate-900/50 p-4 relative group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Mastered</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-bold text-white font-mono">
              {masteredCount}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {assessedConcepts > 0
              ? `${Math.round((masteredCount / assessedConcepts) * 100)}% of assessed concepts`
              : "No concepts assessed yet"}
          </p>
        </div>

        {/* KPI 3: Weak Areas */}
        <div className="rounded-2xl border border-[#1e293b] bg-slate-900/50 p-4 relative group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Weak Areas</span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-bold text-white font-mono">
              {weakCount}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {weakCount === 0 ? "All concepts on track" : "Need focused review"}
          </p>
        </div>

        {/* KPI 4: Quizzes Taken (Strictly Completed Quiz Attempts) */}
        <div className="rounded-2xl border border-[#1e293b] bg-slate-900/50 p-4 relative group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Quizzes Taken</span>
            <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-bold text-white font-mono">
              {completedQuizzesCount}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Completed attempts • {totalQuizAttemptsCount} attempts started
          </p>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. ROW 2: 3 EQUAL QUICK ACTION CARDS                                 */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Action 1: Continue Learning */}
        <Link
          to={latestProject ? `/projects/${latestProject.project_id}` : "/spaces"}
          className="p-4 rounded-2xl border border-[#1e293b] bg-slate-900/50 hover:bg-slate-900/80 hover:border-indigo-500/40 transition-all flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 group-hover:scale-105 transition-transform">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors">
                Continue Learning
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {latestProject
                  ? `Resume: ${latestProject.project_name}`
                  : "Explore your learning spaces"}
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white group-hover:translate-x-0.5 transition-transform" />
        </Link>

        {/* Action 2: Take a Practice Quiz */}
        <Link
          to={latestProject ? `/projects/${latestProject.project_id}?tab=quiz` : "/spaces"}
          className="p-4 rounded-2xl border border-[#1e293b] bg-slate-900/50 hover:bg-slate-900/80 hover:border-emerald-500/40 transition-all flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-105 transition-transform">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">
                Take a Practice Quiz
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {totalAvailableQuizzesCount > 0
                  ? `${totalAvailableQuizzesCount} available quizzes ready`
                  : "Adaptive questions calibrated to mastery"}
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white group-hover:translate-x-0.5 transition-transform" />
        </Link>

        {/* Action 3: Ask AI Tutor */}
        <Link
          to={latestProject ? `/projects/${latestProject.project_id}?tab=tutor` : "/spaces"}
          className="p-4 rounded-2xl border border-[#1e293b] bg-slate-900/50 hover:bg-slate-900/80 hover:border-purple-500/40 transition-all flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 group-hover:scale-105 transition-transform">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors">
                Ask AI Tutor
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Grounded Q&amp;A citing your course materials
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      {/* ==================================================================== */}
      {/* 4. ROW 3: RECENT ACTIVITY (LEFT ~60%) + RECOMMENDATIONS (RIGHT ~40%)  */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left (7 cols / ~60%): Real Recent Activity Stream */}
        <div className="lg:col-span-7 rounded-2xl border border-[#1e293b] bg-slate-900/50 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-[#1e293b]">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-400" />
                <h2 className="text-sm font-bold text-white tracking-tight">Recent Activity</h2>
              </div>
              <Link
                to="/analytics"
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-1 transition-colors"
              >
                <span>Full Telemetry</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {recentActivity.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                <Activity className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
                <p className="font-semibold text-slate-300">No activity recorded yet</p>
                <p className="mt-1">
                  Upload materials, start a quiz, or chat with the AI Tutor to build your activity history.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {recentActivity.slice(0, 5).map((act) => (
                  <div
                    key={act.id}
                    className="p-3 rounded-xl bg-slate-950/60 border border-[#1e293b] hover:border-slate-700 transition-colors flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className="p-2 rounded-lg bg-slate-900 border border-[#1e293b] flex-shrink-0">
                        {getActivityIcon(act.event_type)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white truncate">{act.title}</span>
                          {act.project_name && (
                            <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 truncate">
                              {act.project_name}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {act.detail || "Learning milestone recorded"}
                        </p>
                      </div>
                    </div>

                    <span className="text-[11px] font-mono text-slate-500 flex-shrink-0">
                      {formatRelativeTime(act.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right (5 cols / ~40%): Top Focus Recommendations Across Projects */}
        <div className="lg:col-span-5 rounded-2xl border border-[#1e293b] bg-slate-900/50 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-[#1e293b]">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-bold text-white tracking-tight">
                  Top Focus Recommendations
                </h2>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                {recommendations.length} active
              </span>
            </div>

            {recommendations.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
                <p className="font-semibold text-white">You're completely on track</p>
                <p className="text-slate-500 mt-1">
                  Complete more quiz attempts to trigger targeted recommendations.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {recommendations.slice(0, 3).map((rec, idx) => (
                  <div
                    key={rec.id}
                    className="p-3.5 rounded-xl bg-slate-950/70 border border-[#1e293b] space-y-2 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-md border font-semibold ${getPriorityBadgeClass(
                          rec.priority
                        )}`}
                      >
                        P{idx + 1} • {rec.priority} Priority
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 truncate max-w-[130px]">
                        {rec.project_name}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-white">
                        {rec.target_concept_name || rec.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                        {rec.reasoning || rec.body}
                      </p>
                    </div>

                    <div className="pt-1.5 flex items-center justify-between text-[11px] text-slate-400 border-t border-[#1e293b]/60">
                      <span className="truncate mr-2 font-mono text-[10px] text-slate-500">
                        {rec.recommendation_type.replace(/_/g, " ")}
                      </span>
                      <Link
                        to={`/projects/${rec.project_id}?tab=quiz`}
                        className="px-2.5 py-1 rounded-md bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white transition-colors font-medium flex-shrink-0"
                      >
                        Start Practice &rarr;
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 5. ROW 4: LEARNING JOURNEY (LEFT) + WEAK AREAS (RIGHT)               */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left (7 cols / ~60%): Learning Journey */}
        <div className="lg:col-span-7 rounded-2xl border border-[#1e293b] bg-slate-900/50 p-5 flex flex-col justify-between">
          <div>
            <div className="mb-4">
              <h2 className="text-sm font-bold text-white tracking-tight">
                Your Learning Journey
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {selectedProject
                  ? `Knowledge retention and progress for ${selectedProject.project_name}.`
                  : "Cross-project knowledge retention and practice progression."}
              </p>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-5 divide-x divide-[#1e293b] bg-slate-950/60 border border-[#1e293b] rounded-xl p-3 sm:p-4 text-center">
              {/* Metric 1: Mastery */}
              <div className="px-1 sm:px-2">
                <div className="flex items-center justify-center gap-1 text-indigo-400 text-[10px] font-mono uppercase font-semibold">
                  <Target className="w-3 h-3" />
                  <span>Mastery</span>
                </div>
                <div className="text-base sm:text-xl font-bold text-white font-mono mt-1">
                  {masteryPercent !== null ? `${masteryPercent}%` : "—"}
                </div>
              </div>

              {/* Metric 2: Growth (Never show only "—", show "Not enough history") */}
              <div className="px-1 sm:px-2 flex flex-col items-center justify-center">
                <div className="flex items-center justify-center gap-1 text-emerald-400 text-[10px] font-mono uppercase font-semibold">
                  <TrendingUp className="w-3 h-3" />
                  <span>Growth</span>
                </div>
                <div className="text-xs sm:text-sm font-bold text-slate-300 font-medium mt-1 leading-tight">
                  Not enough history
                </div>
                <div className="text-[9px] text-slate-500 mt-0.5 leading-tight hidden sm:block">
                  Complete more assessments to see trend
                </div>
              </div>

              {/* Metric 3: Weak Topics */}
              <div className="px-1 sm:px-2">
                <div className="flex items-center justify-center gap-1 text-amber-400 text-[10px] font-mono uppercase font-semibold">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Weak</span>
                </div>
                <div className="text-base sm:text-xl font-bold text-amber-300 font-mono mt-1">
                  {weakCount}
                </div>
              </div>

              {/* Metric 4: Completed Quizzes */}
              <div className="px-1 sm:px-2">
                <div className="flex items-center justify-center gap-1 text-purple-400 text-[10px] font-mono uppercase font-semibold">
                  <Award className="w-3 h-3" />
                  <span>Quizzes</span>
                </div>
                <div className="text-base sm:text-xl font-bold text-purple-300 font-mono mt-1">
                  {completedQuizzesCount}
                </div>
              </div>

              {/* Metric 5: Study Streak (Real active days, no fake ?? 1) */}
              <div className="px-1 sm:px-2">
                <div className="flex items-center justify-center gap-1 text-sky-400 text-[10px] font-mono uppercase font-semibold">
                  <Calendar className="w-3 h-3" />
                  <span>Streak</span>
                </div>
                <div className="text-base sm:text-xl font-bold text-sky-300 font-mono mt-1">
                  {studyStreakDays > 0 ? (
                    <span>{studyStreakDays}<span className="text-[10px] font-normal text-slate-400">d</span></span>
                  ) : (
                    <span className="text-xs text-slate-500">0d</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#1e293b]/80 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              Adaptive knowledge tracking active &bull; Personalized to your practice pace
            </span>
            <Link
              to="/analytics"
              className="text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-1"
            >
              View your analytics &rarr;
            </Link>
          </div>
        </div>

        {/* Right (5 cols / ~40%): Weak Topics Panel */}
        <div className="lg:col-span-5 rounded-2xl border border-[#1e293b] bg-slate-900/50 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-[#1e293b]">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-bold text-white tracking-tight">Weak Topics</h2>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                {weakAreasList.length} requiring practice
              </span>
            </div>

            {weakAreasList.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-1.5 opacity-80" />
                <p className="font-semibold text-white">All concepts on track</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  No concepts require urgent reinforcement right now.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {weakAreasList.slice(0, 4).map((item, idx) => (
                  <Link
                    key={item.concept_id}
                    to={`/projects/${item.project_id}?tab=quiz`}
                    className="p-2.5 rounded-xl bg-slate-950/60 border border-[#1e293b] hover:border-amber-500/40 hover:bg-slate-950 transition-all flex items-center justify-between group"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-semibold flex-shrink-0">
                        P{idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-200 group-hover:text-white truncate">
                          {item.concept_name}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {item.project_name}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className="text-[11px] font-mono text-amber-300 font-bold">
                        {Math.round(item.mastery_score)}%
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 6. ROW 5: HIERARCHICAL LEARNING SPACES & PROJECTS SECTION            */}
      {/* ==================================================================== */}
      <div className="rounded-2xl border border-[#1e293b] bg-slate-900/50 p-5 space-y-4">
        <div className="flex items-center justify-between pb-2.5 border-b border-[#1e293b]">
          <div className="flex items-center gap-2">
            <Folder className="w-4 h-4 text-indigo-400" />
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">
                Your Learning Spaces
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Hierarchical view of your knowledge spaces and projects
              </p>
            </div>
          </div>
          <Link
            to="/spaces"
            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-1 transition-colors"
          >
            <span>All Spaces</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {spaces.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            No spaces created yet. Create a space to organize your projects.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {spaces.map((sp) => {
              // Find projects in this space from allProjects
              const spaceProjects = allProjects.filter(
                (p) => p.space_name.toLowerCase() === sp.name.toLowerCase()
              );

              return (
                <div
                  key={sp.id}
                  className="p-4 rounded-xl bg-slate-950/70 border border-[#1e293b] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <Link
                      to={`/spaces/${sp.id}`}
                      className="text-xs font-bold text-white hover:text-indigo-300 transition-colors flex items-center gap-2"
                    >
                      <Folder className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{sp.name}</span>
                    </Link>
                    <span className="text-[10px] font-mono text-slate-500">
                      {spaceProjects.length} {spaceProjects.length === 1 ? "project" : "projects"}
                    </span>
                  </div>

                  {spaceProjects.length === 0 ? (
                    <p className="text-[11px] text-slate-500 italic pl-5">
                      No projects inside this space yet.
                    </p>
                  ) : (
                    <div className="space-y-1.5 pl-2 border-l border-[#1e293b]/80 ml-2">
                      {spaceProjects.map((p) => (
                        <Link
                          key={p.project_id}
                          to={`/projects/${p.project_id}`}
                          className="p-2 rounded-lg bg-slate-900/60 border border-[#1e293b]/60 hover:border-indigo-500/30 hover:bg-slate-900 transition-all flex items-center justify-between group text-xs"
                        >
                          <div className="min-w-0 pr-2">
                            <span className="font-medium text-slate-300 group-hover:text-white truncate block">
                              {p.project_name}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {p.total_concepts} concepts • {p.completed_quiz_attempts} completed quizzes
                            </span>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {p.average_mastery !== null ? (
                              <span className="text-[11px] font-mono text-emerald-400 font-bold">
                                {Math.round(p.average_mastery)}%
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-slate-500">New</span>
                            )}
                            <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-white transition-colors" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
