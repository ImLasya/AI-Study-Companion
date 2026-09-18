import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Award,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronDown,
  FileText,
  Filter,
  Folder,
  HelpCircle,
  Layers,
  Lightbulb,
  Loader2,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";
import {
  getGlobalAnalyticsApi,
  getGlobalRecommendationsApi,
  getProjectGrowthApi,
  getRecentActivityApi,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  GlobalAnalyticsResponse,
  GlobalRecommendationItem,
  GrowthSummary,
  ProjectProgressItem,
  RecentActivityItem,
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
  const [analytics, setAnalytics] = useState<GlobalAnalyticsResponse | null>(null);
  const [, setGrowthSummary] = useState<GrowthSummary | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);
  const [recommendations, setRecommendations] = useState<GlobalRecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Learning Scope Filter (null = All Projects, which is default)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);

  const navigate = useNavigate();

  // 1. Initial Load: Global Analytics, Recent Activity, and Global Recommendations
  const loadDashboardData = async (filterProjId: string | null) => {
    try {
      setLoading(true);
      setError(null);

      const [analyticsData, activityData, recsData] = await Promise.all([
        getGlobalAnalyticsApi().catch(() => null),
        getRecentActivityApi({
          projectId: filterProjId || undefined,
          limit: 15,
        }).catch(() => []),
        getGlobalRecommendationsApi({
          projectId: filterProjId || undefined,
        }).catch(() => []),
      ]);

      const targetProjId =
        filterProjId || analyticsData?.projects_by_progress?.[0]?.project_id;
      let growthData: GrowthSummary | null = null;
      if (targetProjId) {
        growthData = await getProjectGrowthApi(targetProjId).catch(() => null);
      }

      setAnalytics(analyticsData);
      setGrowthSummary(growthData);
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

  const masteredCount = selectedProject
    ? selectedProject.mastered_concepts
    : analytics?.total_study_activity?.mastered_concepts ??
      allProjects.reduce((acc, p) => acc + p.mastered_concepts, 0);

  // Authoritative completed quiz attempts
  const completedQuizzesCount = selectedProject
    ? selectedProject.completed_quiz_attempts
    : analytics?.total_study_activity?.total_quizzes_completed ?? 0;

  // Overall average mastery percentage
  const projectsWithMastery = allProjects.filter((p) => p.average_mastery !== null);
  const masteryPercent = selectedProject
    ? selectedProject.average_mastery !== null
      ? Math.round(selectedProject.average_mastery)
      : null
    : projectsWithMastery.length > 0
    ? Math.round(
        projectsWithMastery.reduce((acc, p) => acc + (p.average_mastery ?? 0), 0) /
          projectsWithMastery.length
      )
    : null;

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
        return "text-rose-500 bg-rose-500/10";
      case "medium":
      case "p2":
        return "text-amber-500 bg-amber-500/10";
      default:
        return "text-slate-400 bg-slate-500/10";
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "quiz_completed":
      case "quiz_started":
      case "quiz_created":
        return <Award className="w-3.5 h-3.5 text-purple-400" />;
      case "material_uploaded":
        return <FileText className="w-3.5 h-3.5 text-sky-400" />;
      case "tutor_turn":
      case "tutor_conversation_started":
        return <Bot className="w-3.5 h-3.5 text-indigo-400" />;
      case "mastery_updated":
        return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <Activity className="w-3.5 h-3.5 text-slate-400" />;
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
      {/* 1. GREETING & HEADER (OPEN, BORDERLESS)                              */}
      {/* ==================================================================== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-1 pb-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
            {getUserGreeting()}
          </h1>
          <p className="text-xs sm:text-sm text-text-muted mt-1">
            Continue your learning journey.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-auto">
          {/* Scope Selector */}
          <div className="relative">
            <button
              onClick={() => setFilterDropdownOpen((prev) => !prev)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface-muted/70 hover:bg-surface-muted text-xs font-medium text-text-secondary hover:text-text-primary transition-all cursor-pointer border border-border/40"
              aria-label="Filter learning scope"
            >
              <Filter className="w-3.5 h-3.5 text-accent" />
              <span className="text-text-muted">Scope:</span>
              <span className="font-semibold text-text-primary max-w-[140px] truncate">
                {selectedProject ? selectedProject.project_name : "All Projects"}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-text-muted ml-0.5" />
            </button>

            {filterDropdownOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setFilterDropdownOpen(false)} />
                <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-surface border border-border/80 shadow-2xl py-2 z-40 text-xs animate-in fade-in zoom-in-95">
                  <div className="px-3.5 py-1.5 border-b border-border/50 text-[10px] font-mono text-text-muted uppercase tracking-wider">
                    Filter by Project
                  </div>
                  <button
                    onClick={() => {
                      setSelectedProjectId(null);
                      setFilterDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2 text-left transition-colors cursor-pointer ${
                      selectedProjectId === null
                        ? "bg-accent/10 text-accent font-semibold"
                        : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-accent" />
                      <span>All Projects (Global)</span>
                    </div>
                    {selectedProjectId === null && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                  </button>
                  <div className="my-1 border-t border-border/40" />
                  {allProjects.map((p) => (
                    <button
                      key={p.project_id}
                      onClick={() => {
                        setSelectedProjectId(p.project_id);
                        setFilterDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-2 text-left transition-colors cursor-pointer ${
                        selectedProjectId === p.project_id
                          ? "bg-accent/10 text-accent font-semibold"
                          : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="truncate font-medium">{p.project_name}</div>
                        <div className="text-[10px] text-text-muted truncate">Space: {p.space_name}</div>
                      </div>
                      {selectedProjectId === p.project_id && (
                        <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <Link
            to="/spaces"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow-sm transition-all hover-lift cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Project</span>
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => loadDashboardData(selectedProjectId)} className="underline hover:text-text-primary">
            Retry
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. LEARNING OVERVIEW: COMPACT BORDERLESS STATS                       */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Stat 1: Concepts */}
        <div className="p-4 rounded-2xl bg-indigo-500/[0.04] dark:bg-indigo-500/[0.07] border border-indigo-500/10 flex items-center gap-3.5 transition-all">
          <div className="w-11 h-11 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-text-primary tracking-tight">
              {totalConcepts}
            </div>
            <div className="text-xs font-medium text-text-muted">
              Concepts
            </div>
          </div>
        </div>

        {/* Stat 2: Projects */}
        <div className="p-4 rounded-2xl bg-purple-500/[0.04] dark:bg-purple-500/[0.07] border border-purple-500/10 flex items-center gap-3.5 transition-all">
          <div className="w-11 h-11 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <Folder className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-text-primary tracking-tight">
              {allProjects.length}
            </div>
            <div className="text-xs font-medium text-text-muted">
              Projects
            </div>
          </div>
        </div>

        {/* Stat 3: Quizzes */}
        <div className="p-4 rounded-2xl bg-sky-500/[0.04] dark:bg-sky-500/[0.07] border border-sky-500/10 flex items-center gap-3.5 transition-all">
          <div className="w-11 h-11 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-text-primary tracking-tight">
              {completedQuizzesCount}
            </div>
            <div className="text-xs font-medium text-text-muted">
              Quizzes Taken
            </div>
          </div>
        </div>

        {/* Stat 4: Mastered */}
        <div className="p-4 rounded-2xl bg-emerald-500/[0.04] dark:bg-emerald-500/[0.07] border border-emerald-500/10 flex items-center gap-3.5 transition-all">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-text-primary tracking-tight">
              {masteredCount}
            </div>
            <div className="text-xs font-medium text-text-muted">
              Mastered
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. MAIN VISUAL FOCUS: CONTINUE LEARNING HERO (FEATURED MODULE)       */}
      {/* ==================================================================== */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900/40 via-purple-900/20 to-surface border border-indigo-500/25 p-6 sm:p-8 shadow-sm">
        {/* Subtle background glow */}
        <div className="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-accent/15 blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-72 h-72 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          <div className="md:col-span-8 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/15 border border-accent/30 text-accent text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Continue Learning</span>
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-text-primary tracking-tight">
                {latestProject ? latestProject.project_name : "Machine Learning Fundamentals"}
              </h2>
              <p className="text-xs sm:text-sm text-text-secondary mt-1.5 line-clamp-2 max-w-xl leading-relaxed">
                {latestProject?.space_name
                  ? `Domain: ${latestProject.space_name} • Master core concepts and practice with grounded AI tutor.`
                  : "Build a strong conceptual foundation with adaptive quizzes and interactive spaced repetition."}
              </p>
            </div>

            {/* Mastery / Progress Bar */}
            <div className="max-w-md space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-muted font-medium">Concept Mastery</span>
                <span className="font-mono font-bold text-accent">
                  {latestProject?.average_mastery !== null && latestProject?.average_mastery !== undefined
                    ? `${Math.round(latestProject.average_mastery)}%`
                    : masteryPercent !== null
                    ? `${masteryPercent}%`
                    : "65%"}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent to-purple-400 transition-all duration-500"
                  style={{
                    width: `${
                      latestProject?.average_mastery !== null && latestProject?.average_mastery !== undefined
                        ? Math.max(8, Math.round(latestProject.average_mastery))
                        : masteryPercent !== null
                        ? Math.max(8, masteryPercent)
                        : 65
                    }%`,
                  }}
                />
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <Link
                to={latestProject ? `/projects/${latestProject.project_id}` : "/spaces"}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold shadow-md shadow-accent/25 transition-all hover-lift cursor-pointer"
              >
                <span>Continue Learning</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                to={latestProject ? `/projects/${latestProject.project_id}?tab=quiz` : "/spaces"}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface/80 hover:bg-surface text-text-primary text-xs font-semibold border border-border/70 transition-all cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5 text-sky-500" />
                <span>Practice Quiz</span>
              </Link>
            </div>
          </div>

          {/* Educational Visual / Illustration Accent on the right */}
          <div className="hidden md:flex md:col-span-4 justify-center items-center">
            <div className="relative w-40 h-40 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border border-dashed border-accent/30 animate-[spin_40s_linear_infinite]" />
              <div className="w-28 h-28 rounded-2xl bg-gradient-to-tr from-accent/20 to-purple-500/20 border border-accent/30 flex flex-col items-center justify-center p-3 text-center shadow-lg backdrop-blur-sm">
                <Target className="w-8 h-8 text-accent mb-1.5" />
                <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Goal</span>
                <span className="text-xs font-bold text-text-primary">Master Concepts</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 4. QUICK ACTIONS: BORDERLESS INTERACTIVE ROW                         */}
      {/* ==================================================================== */}
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2.5 px-1">
          Quick Actions
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link
            to={latestProject ? `/projects/${latestProject.project_id}?tab=tutor` : "/spaces"}
            className="p-3.5 rounded-2xl bg-surface hover:bg-indigo-500/[0.06] border border-border/60 hover:border-indigo-500/30 transition-all flex items-center gap-3 group hover-lift shadow-xs"
          >
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-text-primary group-hover:text-indigo-500 transition-colors truncate">
                Ask AI Tutor
              </div>
              <div className="text-[10px] text-text-muted truncate">Grounded Q&A</div>
            </div>
          </Link>

          <Link
            to={latestProject ? `/projects/${latestProject.project_id}?tab=quiz` : "/spaces"}
            className="p-3.5 rounded-2xl bg-surface hover:bg-sky-500/[0.06] border border-border/60 hover:border-sky-500/30 transition-all flex items-center gap-3 group hover-lift shadow-xs"
          >
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-text-primary group-hover:text-sky-500 transition-colors truncate">
                Practice Quiz
              </div>
              <div className="text-[10px] text-text-muted truncate">Adaptive tests</div>
            </div>
          </Link>

          <Link
            to={latestProject ? `/projects/${latestProject.project_id}?tab=flashcards` : "/spaces"}
            className="p-3.5 rounded-2xl bg-surface hover:bg-amber-500/[0.06] border border-border/60 hover:border-amber-500/30 transition-all flex items-center gap-3 group hover-lift shadow-xs"
          >
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <Award className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-text-primary group-hover:text-amber-500 transition-colors truncate">
                Review Flashcards
              </div>
              <div className="text-[10px] text-text-muted truncate">Spaced repetition</div>
            </div>
          </Link>

          <Link
            to={latestProject ? `/projects/${latestProject.project_id}?tab=growth` : "/spaces"}
            className="p-3.5 rounded-2xl bg-surface hover:bg-purple-500/[0.06] border border-border/60 hover:border-purple-500/30 transition-all flex items-center gap-3 group hover-lift shadow-xs"
          >
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-text-primary group-hover:text-purple-500 transition-colors truncate">
                Learning Plans
              </div>
              <div className="text-[10px] text-text-muted truncate">Curriculum roadmap</div>
            </div>
          </Link>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 5. TWO-COLUMN: RECENT ACTIVITY TIMELINE + TOP RECOMMENDATIONS        */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-2">
        {/* Left (~60%): Recent Activity as a Clean Vertical Timeline */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between pb-1 border-b border-border/40">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-bold text-text-primary tracking-tight">Recent Activity</h2>
            </div>
            <Link
              to="/analytics"
              className="text-xs text-accent hover:text-accent-hover font-medium inline-flex items-center gap-1 transition-colors"
            >
              <span>Full History</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {recentActivity.length === 0 ? (
            <div className="py-12 text-center text-text-muted text-xs">
              <Activity className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-40" />
              <p className="font-semibold text-text-secondary">No activity recorded yet</p>
              <p className="mt-1">
                Upload study material or complete a quiz to begin tracking your journey.
              </p>
            </div>
          ) : (
            <div className="relative pl-6 space-y-5 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
              {recentActivity.slice(0, 5).map((act) => (
                <div key={act.id} className="relative group">
                  {/* Timeline dot */}
                  <span className="absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full bg-accent ring-4 ring-surface" />
                  
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="shrink-0">{getActivityIcon(act.event_type)}</div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-text-primary group-hover:text-accent transition-colors truncate">
                          {act.title}
                        </div>
                        <p className="text-[11px] text-text-muted mt-0.5 truncate">
                          {act.detail || "Learning event logged"}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-text-muted shrink-0">
                      {formatRelativeTime(act.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right (~40%): Top Focus Recommendations with Left Accent Lines */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between pb-1 border-b border-border/40">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-bold text-text-primary tracking-tight">
                Top Recommendations
              </h2>
            </div>
            <span className="text-[11px] font-mono text-text-muted">
              {recommendations.length} active
            </span>
          </div>

          {recommendations.length === 0 ? (
            <div className="py-12 text-center text-text-muted text-xs">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
              <p className="font-semibold text-text-primary">You're on track</p>
              <p className="text-text-muted mt-1">
                Complete more quizzes to trigger personalized recommendations.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recommendations.slice(0, 3).map((rec, idx) => (
                <div
                  key={rec.id}
                  className="p-3.5 rounded-xl bg-surface border-l-4 border-l-indigo-500 border-t border-r border-b border-border/60 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded-md ${getPriorityBadgeClass(rec.priority)}`}>
                      P{idx + 1} • {rec.priority} Priority
                    </span>
                    <span className="text-[10px] text-text-muted truncate max-w-[120px]">
                      {rec.project_name}
                    </span>
                  </div>

                  <h3 className="text-xs font-bold text-text-primary mt-1">
                    {rec.target_concept_name || rec.title}
                  </h3>
                  <p className="text-[11px] text-text-muted line-clamp-2 mt-0.5 leading-relaxed">
                    {rec.reasoning || rec.body}
                  </p>

                  <div className="mt-2.5 pt-2 flex items-center justify-between text-[11px] border-t border-border/40">
                    <span className="text-[10px] text-text-muted font-mono capitalize">
                      {rec.recommendation_type.replace(/_/g, " ")}
                    </span>
                    <Link
                      to={`/projects/${rec.project_id}?tab=quiz`}
                      className="text-xs font-semibold text-accent hover:text-accent-hover inline-flex items-center gap-1"
                    >
                      <span>Start Practice</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 6. LEARNING JOURNEY: VISUAL 5-STEP PIPELINE                          */}
      {/* ==================================================================== */}
      <div className="pt-4 border-t border-border/40">
        <div className="text-xs font-bold uppercase tracking-wider text-text-muted mb-4 px-1">
          Learning Journey Pipeline
        </div>
        <div className="grid grid-cols-5 gap-2 sm:gap-4 relative">
          {[
            { step: "1", title: "Add Material", desc: "PDFs, slides, notes", icon: FileText, color: "text-sky-500 bg-sky-500/10" },
            { step: "2", title: "Understand", desc: "Grounded AI Tutor", icon: Bot, color: "text-indigo-500 bg-indigo-500/10" },
            { step: "3", title: "Practice", desc: "Adaptive quizzes", icon: HelpCircle, color: "text-purple-500 bg-purple-500/10" },
            { step: "4", title: "Master", desc: "Spaced flashcards", icon: Award, color: "text-amber-500 bg-amber-500/10" },
            { step: "5", title: "Grow", desc: "Mastery analytics", icon: TrendingUp, color: "text-emerald-500 bg-emerald-500/10" },
          ].map((item, idx) => {
            const Icon = item.icon;
            return (
              <div key={idx} className="flex flex-col items-center text-center group">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold mb-2 transition-transform group-hover:scale-110 ${item.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="text-[11px] sm:text-xs font-bold text-text-primary">{item.title}</div>
                <div className="text-[10px] text-text-muted hidden sm:block mt-0.5">{item.desc}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
