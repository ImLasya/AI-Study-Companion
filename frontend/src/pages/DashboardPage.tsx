import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  Filter,
  Folder,
  HelpCircle,
  Layers,
  Lightbulb,
  Loader2,
  Play,
  Plus,
  Target,
  Trophy,
  UploadCloud,
  Bookmark,
} from "lucide-react";
import {
  getGlobalAnalyticsApi,
  getGlobalRecommendationsApi,
  getLearningPlanApi,
  getProjectGrowthApi,
  getRecentActivityApi,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  GlobalAnalyticsResponse,
  GlobalRecommendationItem,
  GrowthSummary,
  LearningPlan,
  ProjectProgressItem,
  RecentActivityItem,
} from "@/types";

interface TaskItem {
  id: string;
  text: string;
  completed: boolean;
}

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
  const navigate = useNavigate();

  // Core Data State
  const [analytics, setAnalytics] = useState<GlobalAnalyticsResponse | null>(null);
  const [, setGrowthSummary] = useState<GrowthSummary | null>(null);
  const [learningPlan, setLearningPlan] = useState<LearningPlan | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);
  const [recommendations, setRecommendations] = useState<GlobalRecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Learning Scope Filter (null = All Projects, which is default)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);

  // Today's Plan Tasks state
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [newTaskInput, setNewTaskInput] = useState("");
  const [isAddingTask, setIsAddingTask] = useState(false);

  const toggleTask = (id: string) => {
    setTasks((prev) => {
      const updated = prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
      try {
        localStorage.setItem(`edumind_tasks_status_${user?.id || "guest"}`, JSON.stringify(
          updated.reduce((acc, t) => ({ ...acc, [t.id]: t.completed }), {})
        ));
      } catch {
        // ignore
      }
      return updated;
    });
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskInput.trim()) return;
    const newTask: TaskItem = {
      id: `custom-${Date.now()}`,
      text: newTaskInput.trim(),
      completed: false,
    };
    const updated = [...tasks, newTask];
    setTasks(updated);
    try {
      const savedCustom = JSON.parse(
        localStorage.getItem(`edumind_custom_tasks_${user?.id || "guest"}`) || "[]"
      );
      localStorage.setItem(
        `edumind_custom_tasks_${user?.id || "guest"}`,
        JSON.stringify([...savedCustom, newTask])
      );
    } catch {
      // ignore
    }
    setNewTaskInput("");
    setIsAddingTask(false);
  };

  // Initial Data Load
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
      let planData: LearningPlan | null = null;
      if (targetProjId) {
        [growthData, planData] = await Promise.all([
          getProjectGrowthApi(targetProjId).catch(() => null),
          getLearningPlanApi(targetProjId).catch(() => null),
        ]);
      }

      setAnalytics(analyticsData);
      setGrowthSummary(growthData);
      setLearningPlan(planData);
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
  const latestProject = selectedProject || allProjects[0] || null;

  // Dynamically populate Today's Plan from live learning milestones or active project
  useEffect(() => {
    const savedStatusMap: Record<string, boolean> = (() => {
      try {
        const raw = localStorage.getItem(`edumind_tasks_status_${user?.id || "guest"}`);
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    })();

    const customTasks: TaskItem[] = (() => {
      try {
        const raw = localStorage.getItem(`edumind_custom_tasks_${user?.id || "guest"}`);
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    })();

    let dynamicTasks: TaskItem[] = [];

    if (learningPlan?.items && learningPlan.items.length > 0) {
      dynamicTasks = learningPlan.items.slice(0, 5).map((item) => {
        const defaultDone = item.status === "completed";
        const isDone = savedStatusMap[`plan-${item.id}`] !== undefined
          ? savedStatusMap[`plan-${item.id}`]
          : defaultDone;

        const actionPrefix =
          item.status === "completed"
            ? "Mastered"
            : item.status === "in_progress"
            ? "Practice"
            : item.status === "needs_review"
            ? "Review"
            : "Study";

        return {
          id: `plan-${item.id}`,
          text: `${actionPrefix} ${item.concept_name}`,
          completed: isDone,
        };
      });
    } else if (latestProject) {
      dynamicTasks = [
        {
          id: `task-quiz-${latestProject.project_id}`,
          text: `Take a practice quiz on ${latestProject.project_name}`,
          completed: savedStatusMap[`task-quiz-${latestProject.project_id}`] ?? false,
        },
        {
          id: `task-flashcards-${latestProject.project_id}`,
          text: `Review flashcards in ${latestProject.project_name}`,
          completed: savedStatusMap[`task-flashcards-${latestProject.project_id}`] ?? false,
        },
        {
          id: `task-tutor-${latestProject.project_id}`,
          text: `Ask AI Tutor about key concepts in ${latestProject.project_name}`,
          completed: savedStatusMap[`task-tutor-${latestProject.project_id}`] ?? false,
        },
      ];
    }

    setTasks([...dynamicTasks, ...customTasks]);
  }, [learningPlan, latestProject, user?.id]);

  // Derived Metrics based on Scope with reference defaults
  const totalConcepts = selectedProject
    ? selectedProject.total_concepts
    : analytics?.total_study_activity?.total_concepts ??
      (allProjects.length > 0
        ? allProjects.reduce((acc, p) => acc + p.total_concepts, 0)
        : 0);

  const projectsCount = allProjects.length;

  const masteredCount = selectedProject
    ? selectedProject.mastered_concepts
    : analytics?.total_study_activity?.mastered_concepts ??
      (allProjects.length > 0
        ? allProjects.reduce((acc, p) => acc + p.mastered_concepts, 0)
        : 0);

  const completedQuizzesCount = selectedProject
    ? selectedProject.completed_quiz_attempts
    : analytics?.total_study_activity?.total_quizzes_completed ?? 0;

  // Average mastery percentage
  const projectsWithMastery = allProjects.filter((p) => p.average_mastery !== null);
  const masteryPercent = selectedProject
    ? selectedProject.average_mastery !== null
      ? Math.round(selectedProject.average_mastery)
      : 0
    : projectsWithMastery.length > 0
    ? Math.round(
        projectsWithMastery.reduce((acc, p) => acc + (p.average_mastery ?? 0), 0) /
          projectsWithMastery.length
      )
    : 0;

  // User Greeting
  const getUserGreeting = () => {
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const name = user?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "lasya";
    return `${timeOfDay}, ${name}! 👋`;
  };

  const todayFormatted = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  if (loading && !analytics && allProjects.length === 0) {
    return (
      <div className="py-24 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Loading your EduMind workspace...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-10">
      {/* ==================================================================== */}
      {/* 1. GREETING & QUOTE HEADER                                           */}
      {/* ==================================================================== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-1">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] dark:text-white tracking-tight">
            {getUserGreeting()}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Continue your learning journey. You're doing great!
          </p>
        </div>

        {/* Motivational Right Quote & Project Scope Filter */}
        <div className="flex items-center gap-4 self-start md:self-auto">
          {/* Subtle Scope Selector */}
          {allProjects.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setFilterDropdownOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-surface border border-slate-200 dark:border-border text-xs font-medium text-slate-600 dark:text-slate-300 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
                aria-label="Filter learning scope"
              >
                <Filter className="w-3.5 h-3.5 text-accent" />
                <span className="truncate max-w-[130px]">
                  {selectedProject ? selectedProject.project_name : "All Projects"}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {filterDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setFilterDropdownOpen(false)} />
                  <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white dark:bg-surface border border-slate-200 dark:border-border shadow-xl py-2 z-40 text-xs">
                    <button
                      onClick={() => {
                        setSelectedProjectId(null);
                        setFilterDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-2 text-left cursor-pointer ${
                        selectedProjectId === null
                          ? "bg-accent/10 text-accent font-semibold"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Layers className="w-3.5 h-3.5 text-accent" />
                        <span>All Projects</span>
                      </div>
                      {selectedProjectId === null && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                    </button>
                    {allProjects.map((p) => (
                      <button
                        key={p.project_id}
                        onClick={() => {
                          setSelectedProjectId(p.project_id);
                          setFilterDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3.5 py-2 text-left cursor-pointer ${
                          selectedProjectId === p.project_id
                            ? "bg-accent/10 text-accent font-semibold"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <span className="truncate">{p.project_name}</span>
                        {selectedProjectId === p.project_id && (
                          <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="text-right hidden sm:block">
            <p className="italic font-serif text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-snug">
              “Learning today,<br />a brighter tomorrow.”
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => loadDashboardData(selectedProjectId)} className="underline font-semibold">
            Retry
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. TOP STATS ROW + LEARNING STREAK                                   */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        {/* Left 4 Stats (9 cols on xl) */}
        <div className="xl:col-span-9 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1: Concepts */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-border shadow-2xs hover:shadow-md hover:-translate-y-1 hover:border-purple-200 dark:hover:border-purple-800 transition-all duration-300 ease-out flex flex-col justify-between relative group cursor-default">
            <div className="flex items-start justify-between">
              <div className="w-11 h-11 rounded-xl bg-purple-100/80 text-purple-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300 ease-out">
                <BookOpen className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] dark:text-white font-mono">
                  {totalConcepts}
                </span>
                <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                  Concepts
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[11px] text-slate-400 dark:text-slate-400 truncate">
                  Core concepts learned
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-sky-500 shrink-0 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-300" />
              </div>
            </div>
          </div>

          {/* Card 2: Projects */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-border shadow-2xs hover:shadow-md hover:-translate-y-1 hover:border-purple-200 dark:hover:border-purple-800 transition-all duration-300 ease-out flex flex-col justify-between relative group cursor-default">
            <div className="flex items-start justify-between">
              <div className="w-11 h-11 rounded-xl bg-purple-100/80 text-purple-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300 ease-out">
                <Folder className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] dark:text-white font-mono">
                  {projectsCount}
                </span>
                <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                  Projects
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[11px] text-slate-400 dark:text-slate-400 truncate">
                  Hands-on experience
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-purple-500 shrink-0 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-300" />
              </div>
            </div>
          </div>

          {/* Card 3: Quizzes Taken */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-border shadow-2xs hover:shadow-md hover:-translate-y-1 hover:border-sky-200 dark:hover:border-sky-800 transition-all duration-300 ease-out flex flex-col justify-between relative group cursor-default">
            <div className="flex items-start justify-between">
              <div className="w-11 h-11 rounded-xl bg-sky-100/80 text-sky-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300 ease-out">
                <FileText className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] dark:text-white font-mono">
                  {completedQuizzesCount}
                </span>
                <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                  Quizzes Taken
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[11px] text-slate-400 dark:text-slate-400 truncate">
                  Keep practicing!
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-sky-500 shrink-0 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-300" />
              </div>
            </div>
          </div>

          {/* Card 4: Mastered */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-border shadow-2xs hover:shadow-md hover:-translate-y-1 hover:border-amber-200 dark:hover:border-amber-800 transition-all duration-300 ease-out flex flex-col justify-between relative group cursor-default">
            <div className="flex items-start justify-between">
              <div className="w-11 h-11 rounded-xl bg-amber-100/80 text-amber-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300 ease-out">
                <Trophy className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] dark:text-white font-mono">
                  {masteredCount}
                </span>
                <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                  Mastered
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[11px] text-slate-400 dark:text-slate-400 truncate">
                  Great progress!
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-amber-500 shrink-0 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-300" />
              </div>
            </div>
          </div>
        </div>

        {/* Right 1 Stat: Learning Streak (3 cols on xl) */}
        {(() => {
          const streakDays =
            analytics?.total_study_activity?.review_streak_days ??
            analytics?.total_study_activity?.active_study_days ??
            0;
          return (
            <div className="xl:col-span-3 p-4 sm:p-5 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-border shadow-2xs hover:shadow-md hover:-translate-y-1 hover:border-amber-200 dark:hover:border-amber-800 transition-all duration-300 ease-out flex items-center justify-between group cursor-default">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <span className="text-base group-hover:scale-125 transition-transform duration-300 inline-block">🔥</span>
                  <span>Learning Streak</span>
                </div>
                <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-amber-500 font-mono tracking-tight">
                  {streakDays} {streakDays === 1 ? "day" : "days"}
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-400 mt-1">
                  {streakDays > 0 ? "Keep the momentum going!" : "Start your streak today!"}
                </p>
              </div>

              {/* 5 Vertical Bar Indicator dynamically reflecting streak */}
              <div className="flex items-end gap-1.5 h-12 pl-4">
                {[1, 2, 3, 4, 5].map((level, idx) => {
                  const isActive = streakDays >= level;
                  const heights = ["h-4", "h-6", "h-8", "h-10", "h-12"];
                  return (
                    <div
                      key={level}
                      className={`w-2.5 ${heights[idx]} rounded-full transition-all duration-300 ${
                        isActive
                          ? "bg-gradient-to-t from-amber-500 to-amber-400 shadow-xs"
                          : "bg-amber-100/70 dark:bg-slate-800"
                      }`}
                      title={`Day ${level} ${isActive ? "(completed)" : ""}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* ==================================================================== */}
      {/* 3. MIDDLE SECTION: HERO CONTINUE LEARNING + TODAY'S PLAN             */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        {/* Hero Card (9 cols on xl) */}
        <div className="xl:col-span-9 rounded-3xl bg-gradient-to-r from-[#EFF1FE] via-[#F4F2FE] to-[#F9F7FF] dark:from-slate-900 dark:via-indigo-950/30 dark:to-slate-900 border border-[#E0E7FF] dark:border-indigo-500/20 p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden shadow-2xs hover:shadow-md hover:border-purple-300 dark:hover:border-purple-700 transition-all duration-300 ease-out group">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            {/* Left Content */}
            <div className="md:col-span-7 space-y-3 z-10">
              {/* Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white dark:bg-surface border border-purple-200 dark:border-purple-500/30 text-purple-600 dark:text-purple-300 text-xs font-semibold shadow-2xs group-hover:border-purple-300 transition-colors duration-300">
                <Play className="w-3 h-3 fill-current" />
                <span>Continue Learning</span>
              </div>

              {/* Title & Description */}
              <div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-[#0F172A] dark:text-white tracking-tight">
                  {latestProject ? latestProject.project_name : "Create your first learning project"}
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  {latestProject?.space_name
                    ? `Domain: ${latestProject.space_name} • Master core concepts and practice with grounded AI tutor.`
                    : "Organize notes, upload study materials, and master concepts with AI assistance."}
                </p>
              </div>

              {/* Concept Mastery Progress Bar */}
              <div className="max-w-md pt-2">
                <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                  <span className="text-slate-600 dark:text-slate-300">Concept Mastery</span>
                  <span className="text-purple-600 dark:text-purple-400 font-mono font-bold">
                    {latestProject?.average_mastery !== null && latestProject?.average_mastery !== undefined
                      ? `${Math.round(latestProject.average_mastery)}%`
                      : `${masteryPercent}%`}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-purple-100 dark:bg-purple-950/50 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-purple-600 to-indigo-500 transition-all duration-500 shadow-xs"
                    style={{
                      width: `${
                        latestProject?.average_mastery !== null && latestProject?.average_mastery !== undefined
                          ? Math.max(12, Math.round(latestProject.average_mastery))
                          : Math.max(12, masteryPercent)
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* Buttons */}
              <div className="pt-3 flex flex-wrap items-center gap-3">
                <Link
                  to={latestProject ? `/projects/${latestProject.project_id}` : "/spaces"}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold shadow-sm transition-all hover:scale-[1.03] active:scale-[0.98] cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Continue Learning</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>

                <Link
                  to={latestProject ? `/projects/${latestProject.project_id}?tab=quiz` : "/spaces"}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-surface text-purple-700 dark:text-purple-300 text-xs font-semibold border border-purple-200 dark:border-purple-500/30 shadow-2xs hover:bg-slate-50 dark:hover:bg-surface-muted transition-all hover:scale-[1.02] cursor-pointer"
                >
                  <HelpCircle className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>Practice Quiz</span>
                </Link>
              </div>
            </div>

            {/* Right Illustration matching reference */}
            <div className="hidden md:flex md:col-span-5 items-center justify-end relative">
              {/* Playful Script Text */}
              <div className="absolute right-40 top-4 text-right transform -rotate-6 select-none pointer-events-none hidden lg:block group-hover:scale-105 transition-transform duration-300">
                <p className="font-serif italic font-bold text-lg text-slate-800 dark:text-slate-100 leading-tight">
                  Better<br />
                  Concepts<br />
                  Brighter<br />
                  You!
                </p>
                <div className="flex justify-end gap-1 mt-1 text-amber-400">
                  <span>✦</span>
                  <span>⚡</span>
                </div>
              </div>

              {/* Custom SVG Learner Illustration */}
              <svg
                viewBox="0 0 240 200"
                className="w-56 h-48 drop-shadow-sm group-hover:scale-105 transition-transform duration-300 ease-out"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Soft backdrop glow */}
                <circle cx="120" cy="110" r="80" fill="#E0E7FF" fillOpacity="0.4" />
                
                {/* Desk */}
                <rect x="20" y="165" width="200" height="8" rx="4" fill="#64748B" fillOpacity="0.2" />
                
                {/* Laptop Base & Screen */}
                <path d="M120 162 L185 162 L180 166 L115 166 Z" fill="#94A3B8" />
                <rect x="135" y="115" width="60" height="42" rx="4" fill="#475569" transform="skewX(-6)" />
                <rect x="138" y="118" width="53" height="35" rx="2" fill="#E2E8F0" transform="skewX(-6)" />
                <circle cx="165" cy="135" r="4" fill="#818CF8" />

                {/* Body / Purple Sweater */}
                <path
                  d="M65 170 C65 130 90 115 110 115 C130 115 145 135 148 170 Z"
                  fill="#7C3AED"
                />
                <path
                  d="M75 170 C75 140 95 125 110 125 C125 125 135 140 140 170 Z"
                  fill="#6D28D9"
                />

                {/* Neck */}
                <rect x="104" y="95" width="14" height="20" rx="4" fill="#FBCFE8" />

                {/* Head / Face */}
                <ellipse cx="111" cy="78" rx="22" ry="24" fill="#FDE2E4" />

                {/* Eyes & Warm Smile */}
                <ellipse cx="104" cy="76" rx="2" ry="2.5" fill="#1E293B" />
                <ellipse cx="120" cy="76" rx="2" ry="2.5" fill="#1E293B" />
                <path d="M109 85 Q112 88 116 85" stroke="#E11D48" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                {/* Cheeks */}
                <circle cx="100" cy="81" r="3" fill="#FDA4AF" fillOpacity="0.7" />
                <circle cx="123" cy="81" r="3" fill="#FDA4AF" fillOpacity="0.7" />

                {/* Hair */}
                <path
                  d="M86 75 C85 50 100 42 120 45 C138 48 140 65 138 82 C135 72 130 65 120 65 C110 65 95 72 86 75 Z"
                  fill="#1E1B4B"
                />
                <path
                  d="M90 75 C88 95 90 120 95 135 C95 120 95 95 98 80 Z"
                  fill="#1E1B4B"
                />
                <path
                  d="M132 75 C135 95 132 120 128 135 C128 120 128 95 125 80 Z"
                  fill="#1E1B4B"
                />

                {/* Hand resting on chin */}
                <path
                  d="M116 95 C116 90 124 90 124 98 L122 110 C122 118 114 118 114 110 Z"
                  fill="#FDE2E4"
                />
                <path
                  d="M122 105 L150 162 L138 165 L114 110 Z"
                  fill="#7C3AED"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Today's Plan Card (3 cols on xl) */}
        <div className="xl:col-span-3 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-border p-5 flex flex-col justify-between shadow-2xs hover:shadow-md hover:-translate-y-0.5 hover:border-purple-200 dark:hover:border-purple-800 transition-all duration-300 ease-out">
          <div>
            {/* Header */}
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-accent">
                  <Calendar className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-[#0F172A] dark:text-white tracking-tight">
                  Today's Plan
                </h3>
              </div>
              <Link
                to={latestProject ? `/projects/${latestProject.project_id}?tab=growth` : "/spaces"}
                className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
              >
                View All
              </Link>
            </div>

            <p className="text-[11px] text-slate-400 dark:text-slate-400 mt-1 mb-3">
              {todayFormatted}
            </p>

            {/* Checklist items */}
            <div className="space-y-1">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => toggleTask(task.id)}
                  className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-200 group cursor-pointer select-none p-1.5 -mx-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors duration-200"
                >
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                      task.completed
                        ? "bg-emerald-500 text-white"
                        : "border border-slate-300 dark:border-slate-600 group-hover:border-accent"
                    }`}
                  >
                    {task.completed && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                  <span
                    className={`leading-tight truncate ${
                      task.completed ? "line-through text-slate-400 dark:text-slate-500" : ""
                    }`}
                  >
                    {task.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Add a new task button / input */}
          <div className="pt-3 border-t border-slate-100 dark:border-border/60 mt-3">
            {isAddingTask ? (
              <form onSubmit={handleAddTask} className="flex items-center gap-2">
                <input
                  type="text"
                  value={newTaskInput}
                  onChange={(e) => setNewTaskInput(e.target.value)}
                  placeholder="Task title..."
                  autoFocus
                  className="flex-1 px-2.5 py-1 text-xs bg-slate-50 dark:bg-surface-muted border border-slate-200 dark:border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent-hover transition-colors"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingTask(false)}
                  className="px-2 py-1 text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              </form>
            ) : (
              <button
                onClick={() => setIsAddingTask(true)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-accent font-medium transition-colors cursor-pointer w-full text-left p-1 -mx-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/30"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add a new task...</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 4. QUICK ACTIONS ROW                                                 */}
      {/* ==================================================================== */}
      <div>
        <h3 className="text-sm font-bold text-[#0F172A] dark:text-white tracking-tight mb-3">
          Quick Actions
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {/* Ask AI Tutor */}
          <Link
            to={latestProject ? `/projects/${latestProject.project_id}?tab=tutor` : "/spaces"}
            className="p-4 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-border shadow-2xs hover:shadow-md hover:-translate-y-1 hover:border-purple-200 dark:hover:border-purple-700 transition-all duration-300 ease-out flex items-center gap-3.5 group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300 ease-out">
              <Bot className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-accent transition-colors">
                Ask AI Tutor
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-400 truncate">
                Get instant help
              </div>
            </div>
          </Link>

          {/* Practice Quiz */}
          <Link
            to={latestProject ? `/projects/${latestProject.project_id}?tab=quiz` : "/spaces"}
            className="p-4 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-border shadow-2xs hover:shadow-md hover:-translate-y-1 hover:border-sky-200 dark:hover:border-sky-700 transition-all duration-300 ease-out flex items-center gap-3.5 group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300 ease-out">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-sky-600 transition-colors">
                Practice Quiz
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-400 truncate">
                Test your knowledge
              </div>
            </div>
          </Link>

          {/* Review Flashcards */}
          <Link
            to={latestProject ? `/projects/${latestProject.project_id}?tab=flashcards` : "/spaces"}
            className="p-4 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-border shadow-2xs hover:shadow-md hover:-translate-y-1 hover:border-amber-200 dark:hover:border-amber-700 transition-all duration-300 ease-out flex items-center gap-3.5 group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300 ease-out">
              <Bookmark className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-amber-600 transition-colors">
                Review Flashcards
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-400 truncate">
                Spaced repetition
              </div>
            </div>
          </Link>

          {/* Learning Plans */}
          <Link
            to={latestProject ? `/projects/${latestProject.project_id}?tab=growth` : "/spaces"}
            className="p-4 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-border shadow-2xs hover:shadow-md hover:-translate-y-1 hover:border-purple-200 dark:hover:border-purple-700 transition-all duration-300 ease-out flex items-center gap-3.5 group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300 ease-out">
              <Target className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-purple-600 transition-colors">
                Learning Plans
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-400 truncate">
                Follow a roadmap
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 5. BOTTOM SECTION: RECENT ACTIVITY, RECOMMENDATIONS & MOTIVATION     */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        {/* Left Sub-Grid (9 cols on xl): Recent Activity + Top Recommendations */}
        <div className="xl:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
          {/* Recent Activity Card */}
          <div className="p-5 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-border shadow-2xs hover:shadow-md hover:-translate-y-0.5 hover:border-purple-200 dark:hover:border-purple-800 transition-all duration-300 ease-out flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-border/60">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-700 dark:text-slate-200" />
                  <h3 className="text-sm font-bold text-[#0F172A] dark:text-white tracking-tight">
                    Recent Activity
                  </h3>
                </div>
                <Link
                  to="/analytics"
                  className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
                >
                  View All
                </Link>
              </div>

              {/* Activity List matching reference */}
              <div className="divide-y divide-slate-100 dark:divide-border/40">
                {recentActivity.length > 0 ? (
                  recentActivity.slice(0, 3).map((act, idx) => {
                    const isUpload = act.event_type.includes("material");
                    const isQuiz = act.event_type.includes("quiz");
                    const iconColor = isUpload
                      ? "bg-sky-50 text-sky-600 dark:bg-sky-950/40"
                      : isQuiz
                      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40"
                      : "bg-purple-50 text-purple-600 dark:bg-purple-950/40";
                    const Icon = isUpload ? UploadCloud : isQuiz ? CheckCircle2 : BookOpen;

                    return (
                      <div key={act.id || idx} className="py-3 px-2 -mx-2 rounded-xl hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors duration-200 flex items-center justify-between gap-3 group/item">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconColor} group-hover/item:scale-110 transition-transform duration-200`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                              {act.title}
                            </div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-400 truncate">
                              {act.detail || "Learning activity logged"}
                            </div>
                          </div>
                        </div>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono shrink-0">
                          {formatRelativeTime(act.created_at)}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs">
                    <Clock className="w-7 h-7 mx-auto mb-2 text-slate-300 dark:text-slate-600 stroke-[1.5]" />
                    <span>No recent activity yet. Upload notes, take a quiz, or ask the AI tutor to start learning!</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Top Recommendations Card */}
          <div className="p-5 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-border shadow-2xs hover:shadow-md hover:-translate-y-0.5 hover:border-purple-200 dark:hover:border-purple-800 transition-all duration-300 ease-out flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-border/60">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  <h3 className="text-sm font-bold text-[#0F172A] dark:text-white tracking-tight">
                    Top Recommendations
                  </h3>
                </div>
                <Link
                  to={latestProject ? `/projects/${latestProject.project_id}?tab=growth` : "/spaces"}
                  className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
                >
                  View All
                </Link>
              </div>

              {/* Recommendations List matching reference */}
              <div className="divide-y divide-slate-100 dark:divide-border/40">
                {recommendations.length > 0 ? (
                  recommendations.slice(0, 3).map((rec) => (
                    <div key={rec.id} className="py-3 px-2 -mx-2 rounded-xl hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors duration-200 flex items-center justify-between gap-3 group/item">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 flex items-center justify-center shrink-0 group-hover/item:scale-110 transition-transform duration-200">
                          <BookOpen className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                            {rec.target_concept_name || rec.title}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {rec.project_name} • {rec.priority}
                          </div>
                        </div>
                      </div>
                      <Link
                        to={`/projects/${rec.project_id}?tab=quiz`}
                        className="w-7 h-7 rounded-full border border-slate-200 dark:border-border flex items-center justify-center text-slate-400 hover:text-accent hover:border-accent group-hover/item:bg-accent group-hover/item:text-white group-hover/item:border-accent transition-all duration-200 shrink-0"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs">
                    <Lightbulb className="w-7 h-7 mx-auto mb-2 text-slate-300 dark:text-slate-600 stroke-[1.5]" />
                    <span>No pending recommendations. You are completely up to date on your active concepts!</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Card (3 cols on xl): Motivational Card with Mountain Path Art */}
        <div className="xl:col-span-3 rounded-2xl bg-gradient-to-br from-[#ECEFFE] to-[#DBE2FC] dark:from-slate-900 dark:to-indigo-950/40 border border-indigo-100 dark:border-indigo-500/20 p-5 flex flex-col justify-between relative overflow-hidden shadow-2xs hover:shadow-md hover:-translate-y-1 hover:border-indigo-200 transition-all duration-300 ease-out group cursor-default">
          {/* Mountain & Path Background SVG Vector */}
          <div className="absolute inset-0 pointer-events-none opacity-80 group-hover:scale-105 transition-transform duration-500 ease-out">
            <svg
              viewBox="0 0 300 240"
              preserveAspectRatio="none"
              className="w-full h-full"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Back Mountains */}
              <path
                d="M140 240 L220 70 L300 240 Z"
                fill="#93C5FD"
                fillOpacity="0.35"
              />
              <path
                d="M180 240 L250 50 L300 240 Z"
                fill="#818CF8"
                fillOpacity="0.4"
              />
              {/* Summit Flag */}
              <line x1="250" y1="50" x2="250" y2="28" stroke="#312E81" strokeWidth="2.5" />
              <path d="M250 28 L275 36 L250 44 Z" fill="#4F46E5" />

              {/* Mid Mountains */}
              <path
                d="M50 240 L160 120 L270 240 Z"
                fill="#A5B4FC"
                fillOpacity="0.5"
              />
              <path
                d="M0 240 L100 140 L200 240 Z"
                fill="#C7D2FE"
                fillOpacity="0.6"
              />

              {/* Winding Trail / Path */}
              <path
                d="M245 55 C240 85 190 100 210 135 C230 170 170 185 200 240"
                stroke="#FFFFFF"
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M245 55 C240 85 190 100 210 135 C230 170 170 185 200 240"
                stroke="#EEF2FF"
                strokeWidth="6"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </div>

          {/* Text Content */}
          <div className="relative z-10">
            <p className="font-serif italic font-extrabold text-slate-900 dark:text-white text-lg sm:text-xl leading-tight">
              You are<br />
              capable of<br />
              amazing things!
            </p>
          </div>

          {/* Button */}
          <div className="relative z-10 pt-16">
            <Link
              to={latestProject ? `/projects/${latestProject.project_id}` : "/spaces"}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold shadow-sm transition-all hover:scale-[1.03] active:scale-[0.98] cursor-pointer"
            >
              <span>Keep Going</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
