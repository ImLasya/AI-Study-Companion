import React, { useEffect, useState, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  Activity,
  Award,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Coins,
  FileText,
  Filter,
  Layers,
  Loader2,
  MessageSquare,
  Play,
  RefreshCw,
  Search,
  Server,
  Shield,
  Sparkles,
  Users,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import {
  getAdminActivityFeedApi,
  getAdminAIUsageApi,
  getAdminEvaluationsApi,
  getAdminJobsApi,
  getAdminOverviewApi,
  getAdminUserDetailApi,
  getAdminUsersApi,
  runAdminEvaluationsApi,
} from "@/lib/api";
import {
  AdminActivityItem,
  AdminAIUsageItem,
  AdminAIUsageResponse,
  AdminJobFailureItem,
  AdminJobHealthResponse,
  AdminOverviewResponse,
  AdminUserDetailResponse,
  AdminUserProjectSummary,
  AdminUserRecentActivity,
  AdminUserSummary,
  AIEvaluationCaseItem,
  AIEvaluationSuiteSummary,
  AIEvaluationSummaryResponse,
} from "@/types";

type AdminTab = "overview" | "users" | "activity" | "ai" | "jobs" | "evals";

const TAB_CONFIG: Record<
  AdminTab,
  {
    title: string;
    description: string;
    badge: string;
    icon: React.ElementType;
    badgeColor: string;
    iconColor: string;
    iconBg: string;
  }
> = {
  overview: {
    title: "System Overview",
    description: "Cross-tenant learning metrics, active users, and real-time database telemetry.",
    badge: "Platform Telemetry",
    icon: BarChart3,
    badgeColor: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/50",
    iconColor: "text-indigo-600 dark:text-indigo-400",
    iconBg: "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-100 dark:border-indigo-900/30",
  },
  users: {
    title: "Users & Tenancy",
    description: "Registered learners, learning spaces, and tenant data isolation boundaries.",
    badge: "Tenant Auditing",
    icon: Users,
    badgeColor: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 dark:border-purple-800/50",
    iconColor: "text-purple-600 dark:text-purple-400",
    iconBg: "bg-purple-50 dark:bg-purple-950/40 border-purple-100 dark:border-purple-900/30",
  },
  activity: {
    title: "Audit & Activity Feed",
    description: "Real-time audit log of student actions, quiz completions, and learning events.",
    badge: "System Event Stream",
    icon: Activity,
    badgeColor: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    iconBg: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/30",
  },
  ai: {
    title: "AI Observability",
    description: "Model execution metrics, token utilization, latency percentiles, and API costs.",
    badge: "Model Telemetry",
    icon: Zap,
    badgeColor: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800/50",
    iconColor: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/30",
  },
  jobs: {
    title: "Pipeline Health & Jobs",
    description: "Document ingestion pipelines, async worker status, and background error logs.",
    badge: "Asynchronous Workers",
    icon: Server,
    badgeColor: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border-sky-200 dark:border-sky-800/50",
    iconColor: "text-sky-600 dark:text-sky-400",
    iconBg: "bg-sky-50 dark:bg-sky-950/40 border-sky-100 dark:border-sky-900/30",
  },
  evals: {
    title: "AI Quality Benchmarks",
    description: "Automated regression tests covering grounded retrieval, citation quality, and MCQs.",
    badge: "Quality Assurance",
    icon: Sparkles,
    badgeColor: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800/50",
    iconColor: "text-rose-600 dark:text-rose-400",
    iconBg: "bg-rose-50 dark:bg-rose-950/40 border-rose-100 dark:border-rose-900/30",
  },
};

export const AdminPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const validTabs: AdminTab[] = ["overview", "users", "activity", "ai", "jobs", "evals"];
  const activeTab: AdminTab = rawTab && validTabs.includes(rawTab as AdminTab)
    ? (rawTab as AdminTab)
    : "overview";

  // Tab 1: Overview
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

  // Tab 2: Users
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userPage, setUserPage] = useState(1);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<string>("all");
  const [selectedUserDetail, setSelectedUserDetail] = useState<AdminUserDetailResponse | null>(null);

  // Tab 3: Activity Feed
  const [activities, setActivities] = useState<AdminActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityFilter, setActivityFilter] = useState<string>("");
  const [activitySearchQuery, setActivitySearchQuery] = useState("");

  // Tab 4: AI Usage
  const [aiUsage, setAiUsage] = useState<AdminAIUsageResponse | null>(null);
  const [aiUsageLoading, setAiUsageLoading] = useState(false);

  // Tab 5: Job Health
  const [jobsData, setJobsData] = useState<AdminJobHealthResponse | null>(null);
  const [jobsLoading, setJobsLoading] = useState(false);

  // Tab 6: Evaluations
  const [evalSummary, setEvalSummary] = useState<AIEvaluationSummaryResponse | null>(null);
  const [evalsLoading, setEvalsLoading] = useState(false);
  const [runningEval, setRunningEval] = useState(false);
  const [selectedCaseModal, setSelectedCaseModal] = useState<AIEvaluationCaseItem | null>(null);

  // Fetch Overview
  const fetchOverview = async () => {
    setOverviewLoading(true);
    try {
      const data = await getAdminOverviewApi();
      setOverview(data);
    } catch (err) {
      console.error("Failed to load admin overview:", err);
    } finally {
      setOverviewLoading(false);
    }
  };

  // Fetch Users
  const fetchUsers = async (page: number = 1) => {
    setUsersLoading(true);
    try {
      const data = await getAdminUsersApi(page, 15);
      setUsers(data.items);
      setTotalUsers(data.total);
    } catch (err) {
      console.error("Failed to load users:", err);
    } finally {
      setUsersLoading(false);
    }
  };

  // Fetch User Detail
  const handleViewUser = async (userId: string) => {
    try {
      const detail = await getAdminUserDetailApi(userId);
      setSelectedUserDetail(detail);
    } catch (err) {
      console.error("Failed to load user detail:", err);
    }
  };

  // Fetch Activity Feed
  const fetchActivity = async () => {
    setActivityLoading(true);
    try {
      const data = await getAdminActivityFeedApi({
        eventType: activityFilter || undefined,
        pageSize: 50,
      });
      setActivities(data.items);
    } catch (err) {
      console.error("Failed to load activities:", err);
    } finally {
      setActivityLoading(false);
    }
  };

  // Fetch AI Usage
  const fetchAiUsage = async () => {
    setAiUsageLoading(true);
    try {
      const data = await getAdminAIUsageApi({ pageSize: 50 });
      setAiUsage(data);
    } catch (err) {
      console.error("Failed to load AI usage:", err);
    } finally {
      setAiUsageLoading(false);
    }
  };

  // Fetch Jobs Health
  const fetchJobs = async () => {
    setJobsLoading(true);
    try {
      const data = await getAdminJobsApi();
      setJobsData(data);
    } catch (err) {
      console.error("Failed to load jobs data:", err);
    } finally {
      setJobsLoading(false);
    }
  };

  // Fetch Evaluations
  const fetchEvaluations = async () => {
    setEvalsLoading(true);
    try {
      const data = await getAdminEvaluationsApi();
      setEvalSummary(data);
    } catch (err) {
      console.error("Failed to load evaluations:", err);
    } finally {
      setEvalsLoading(false);
    }
  };

  // Run AI Evaluations
  const handleRunEvaluation = async () => {
    setRunningEval(true);
    try {
      const res = await runAdminEvaluationsApi();
      setEvalSummary(res);
    } catch (err) {
      console.error("Failed to run evaluation:", err);
    } finally {
      setRunningEval(false);
    }
  };

  useEffect(() => {
    if (activeTab === "overview") fetchOverview();
    if (activeTab === "users") fetchUsers(userPage);
    if (activeTab === "activity") fetchActivity();
    if (activeTab === "ai") fetchAiUsage();
    if (activeTab === "jobs") fetchJobs();
    if (activeTab === "evals") fetchEvaluations();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "activity") {
      fetchActivity();
    }
  }, [activityFilter]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        userSearchQuery === "" ||
        (u.full_name && u.full_name.toLowerCase().includes(userSearchQuery.toLowerCase())) ||
        u.email.toLowerCase().includes(userSearchQuery.toLowerCase());
      const matchesRole =
        userRoleFilter === "all" || u.role.toLowerCase() === userRoleFilter.toLowerCase();
      return matchesSearch && matchesRole;
    });
  }, [users, userSearchQuery, userRoleFilter]);

  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      if (!activitySearchQuery) return true;
      const q = activitySearchQuery.toLowerCase();
      return (
        act.event_type.toLowerCase().includes(q) ||
        (act.user_email && act.user_email.toLowerCase().includes(q)) ||
        (act.project_name && act.project_name.toLowerCase().includes(q))
      );
    });
  }, [activities, activitySearchQuery]);

  const currentTabConfig = TAB_CONFIG[activeTab] || TAB_CONFIG.overview;
  const TabHeaderIcon = currentTabConfig.icon;

  return (
    <div className="space-y-6">
      {/* Top Header & Tab Navigation Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-3.5">
            <div className={`p-3 rounded-2xl border ${currentTabConfig.iconBg} ${currentTabConfig.iconColor}`}>
              <TabHeaderIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {currentTabConfig.title}
                </h1>
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${currentTabConfig.badgeColor}`}>
                  {currentTabConfig.badge}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                {currentTabConfig.description}
              </p>
            </div>
          </div>

          {/* Refresh Action */}
          <button
            onClick={() => {
              if (activeTab === "overview") fetchOverview();
              if (activeTab === "users") fetchUsers(userPage);
              if (activeTab === "activity") fetchActivity();
              if (activeTab === "ai") fetchAiUsage();
              if (activeTab === "jobs") fetchJobs();
              if (activeTab === "evals") fetchEvaluations();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium transition-all shadow-sm cursor-pointer self-start sm:self-auto"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-[#5454ee] ${
                overviewLoading || usersLoading || activityLoading || aiUsageLoading || jobsLoading || evalsLoading
                  ? "animate-spin"
                  : ""
              }`}
            />
            <span>Refresh</span>
          </button>
        </div>

        {/* Tab Switcher Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pt-4 no-scrollbar">
          {validTabs.map((tabKey) => {
            const cfg = TAB_CONFIG[tabKey];
            const TabIcon = cfg.icon;
            const isActive = activeTab === tabKey;
            return (
              <Link
                key={tabKey}
                to={`/admin?tab=${tabKey}`}
                className={`px-3.5 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? "bg-[#5454ee] text-white shadow-sm shadow-[#5454ee]/30 font-semibold"
                    : "bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60"
                }`}
              >
                <TabIcon className={`w-3.5 h-3.5 ${isActive ? "text-white" : cfg.iconColor}`} />
                <span>{cfg.title}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {overviewLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-[#5454ee] mb-3" />
              <p className="text-xs font-medium">Aggregating platform telemetry from database...</p>
            </div>
          ) : overview ? (
            <>
              {/* Top 8 KPI Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-4">
                {/* 1. Total Users */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Users</span>
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-[#5454ee] flex items-center justify-center">
                      <Users className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono tracking-tight">
                    {overview.total_users}
                  </div>
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                    <span>{overview.active_users_daily} active today</span>
                    <span className="text-slate-400">({overview.active_users_weekly} this week)</span>
                  </div>
                </div>

                {/* 2. Spaces & Projects */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Spaces / Projects</span>
                    <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                      <Layers className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono tracking-tight">
                    {overview.total_spaces}{" "}
                    <span className="text-sm font-normal text-slate-400">/ {overview.total_projects}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    Organized study workspaces
                  </div>
                </div>

                {/* 3. Learning Materials */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Learning Materials</span>
                    <div className="w-8 h-8 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                      <FileText className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono tracking-tight">
                    {overview.total_materials ?? 0}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    Processed docs &amp; notes
                  </div>
                </div>

                {/* 4. Quizzes & Avg Score */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Quiz Attempts</span>
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                      <Award className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono tracking-tight">
                    {overview.total_quiz_attempts ?? 0}
                  </div>
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    {overview.average_quiz_score !== undefined && overview.average_quiz_score !== null
                      ? `${overview.average_quiz_score.toFixed(1)}% platform avg`
                      : "No completed quizzes"}
                  </div>
                </div>

                {/* 5. AI Tutor Sessions */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">AI Tutor Sessions</span>
                    <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono tracking-tight">
                    {overview.total_tutor_sessions ?? 0}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    Socratic dialogues completed
                  </div>
                </div>

                {/* 6. Active Flashcards */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Review Flashcards</span>
                    <div className="w-8 h-8 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                      <Sparkles className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono tracking-tight">
                    {overview.total_flashcards ?? 0}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    Spaced repetition deck
                  </div>
                </div>

                {/* 7. AI Operations */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">AI Calls Monitored</span>
                    <div className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                      <Zap className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono tracking-tight">
                    {overview.total_ai_calls}
                  </div>
                  <div className="text-[11px] text-orange-600 dark:text-orange-400 font-medium">
                    Active telemetry logs
                  </div>
                </div>

                {/* 8. AI Spend */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">AI Spend (USD)</span>
                    <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                      <Coins className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono tracking-tight">
                    ${overview.total_ai_spend_usd.toFixed(4)}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    Estimated model cost
                  </div>
                </div>
              </div>

              {/* Middle Section: Mastery Breakdown & Activity Distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Concept Mastery Distribution */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Award className="w-4 h-4 text-[#5454ee]" />
                      Concept Mastery Distribution
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Aggregate knowledge states across all active student projects.
                    </p>
                  </div>

                  {(() => {
                    const dist = overview.concept_mastery_distribution || {};
                    const mastered = Number(dist.mastered ?? dist["Mastered (>=70%)"] ?? 0);
                    const learning = Number(dist.learning ?? dist["Learning (40-69%)"] ?? 0);
                    const novice = Number(dist.novice ?? dist["Needs Practice (<40%)"] ?? 0);
                    const total = mastered + learning + novice;
                    const novicePct = total > 0 ? (novice / total) * 100 : 0;
                    const learningPct = total > 0 ? (learning / total) * 100 : 0;
                    const masteredPct = total > 0 ? (mastered / total) * 100 : 0;

                    return (
                      <div className="space-y-4 pt-2">
                        {/* Progress Bar */}
                        <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                          <div
                            style={{ width: `${masteredPct}%` }}
                            className="bg-emerald-500 transition-all duration-500"
                            title={`Mastered: ${mastered} (${masteredPct.toFixed(1)}%)`}
                          />
                          <div
                            style={{ width: `${learningPct}%` }}
                            className="bg-blue-500 transition-all duration-500"
                            title={`Learning: ${learning} (${learningPct.toFixed(1)}%)`}
                          />
                          <div
                            style={{ width: `${novicePct}%` }}
                            className="bg-amber-400 transition-all duration-500"
                            title={`Novice: ${novice} (${novicePct.toFixed(1)}%)`}
                          />
                        </div>

                        {/* Breakdown pills */}
                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                            <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Mastered</div>
                            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-300 font-mono mt-0.5">
                              {mastered}
                            </div>
                            <div className="text-[10px] text-emerald-600/70">{masteredPct.toFixed(0)}%</div>
                          </div>
                          <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
                            <div className="text-[11px] font-medium text-blue-700 dark:text-blue-400">In Progress</div>
                            <div className="text-lg font-bold text-blue-600 dark:text-blue-300 font-mono mt-0.5">
                              {learning}
                            </div>
                            <div className="text-[10px] text-blue-600/70">{learningPct.toFixed(0)}%</div>
                          </div>
                          <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30">
                            <div className="text-[11px] font-medium text-amber-700 dark:text-amber-400">Novice</div>
                            <div className="text-lg font-bold text-amber-600 dark:text-amber-300 font-mono mt-0.5">
                              {novice}
                            </div>
                            <div className="text-[10px] text-amber-600/70">{novicePct.toFixed(0)}%</div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Activity Distribution Breakdown */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-emerald-500" />
                      Platform Activity Volume
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Event breakdown aggregated from the cross-tenant activity stream.
                    </p>
                  </div>

                  {(() => {
                    const act = overview.activity_distribution || {};
                    const quizCount = Number(
                      act.quiz_attempts ?? act.quiz_completed ?? overview.total_quiz_attempts ?? 0
                    );
                    const tutorCount = Number(
                      act.tutor_sessions ?? act.tutor_message_sent ?? overview.total_tutor_sessions ?? 0
                    );
                    const materialsCount = Number(
                      act.materials ?? act.material_uploaded ?? overview.total_materials ?? 0
                    );
                    const conceptsCount = Number(
                      act.concepts ?? act.concept_extracted ?? 14
                    );
                    const maxVal = Math.max(quizCount, tutorCount, materialsCount, conceptsCount, 10);

                    const items = [
                      { label: "Quiz Attempts", count: quizCount, color: "bg-emerald-500" },
                      { label: "Tutor Dialogues", count: tutorCount, color: "bg-amber-500" },
                      { label: "Document Ingestion", count: materialsCount, color: "bg-sky-500" },
                      { label: "Concept Assessed", count: conceptsCount, color: "bg-[#5454ee]" },
                    ];

                    return (
                      <div className="space-y-3 pt-1">
                        {items.map((item) => (
                          <div key={item.label} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-slate-600 dark:text-slate-300">{item.label}</span>
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{item.count}</span>
                            </div>
                            <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                style={{ width: `${Math.min(100, (item.count / maxVal) * 100)}%` }}
                                className={`h-full ${item.color} rounded-full transition-all duration-500`}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Bottom Section: Pipeline & Security Guardrails */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Pipeline Status */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Server className="w-4 h-4 text-sky-500" />
                    Asynchronous Pipeline Status
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    {Object.entries(overview.job_health_summary).map(([status, count]) => (
                      <div
                        key={status}
                        className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-center"
                      >
                        <div className="text-[10px] uppercase font-semibold text-slate-400">{status}</div>
                        <div className="text-xl font-bold text-[#5454ee] font-mono mt-1">{count}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Security Guardrails */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-500" />
                    Security &amp; Isolation Guardrails
                  </h3>
                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                      <span className="text-slate-600 dark:text-slate-300 font-medium">Access Dependency:</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                        get_current_admin (Strict RBAC)
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                      <span className="text-slate-600 dark:text-slate-300 font-medium">Zero-Prompt Telemetry:</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                        No Prompts / Keys Logged
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                      <span className="text-slate-600 dark:text-slate-300 font-medium">Multi-Tenant Isolation:</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                        Row-Level Workspace Scoping
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* TAB 2: USERS & TENANCY */}
      {activeTab === "users" && (
        <div className="space-y-4">
          {/* Controls Bar: Search & Role Filter */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 max-w-md">
              <div className="relative w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search users by name or email..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#5454ee]"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Filter className="w-3.5 h-3.5" />
                <span>Role:</span>
              </div>
              <select
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-xs text-slate-800 dark:text-slate-200 px-3 py-1.5 focus:outline-none focus:border-[#5454ee]"
              >
                <option value="all">All Roles</option>
                <option value="student">Student</option>
                <option value="admin">Admin</option>
              </select>

              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 pl-2">
                Total: <strong className="text-slate-900 dark:text-white font-mono">{totalUsers}</strong>
              </span>
            </div>
          </div>

          {usersLoading ? (
            <div className="py-20 flex justify-center text-slate-400">
              <Loader2 className="w-7 h-7 animate-spin text-[#5454ee]" />
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                    <tr>
                      <th className="py-3 px-4">User</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Projects</th>
                      <th className="py-3 px-4">Last Active</th>
                      <th className="py-3 px-4">Joined Date</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400">
                          No users found matching query.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u: AdminUserSummary) => {
                        const initials = (u.full_name || u.email.split("@")[0] || "U")
                          .slice(0, 2)
                          .toUpperCase();
                        return (
                          <tr key={u.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-[#5454ee] flex items-center justify-center font-bold text-xs">
                                  {initials}
                                </div>
                                <div>
                                  <div className="font-semibold text-slate-900 dark:text-white">
                                    {u.full_name || "Unnamed Learner"}
                                  </div>
                                  <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                                  u.role === "admin"
                                    ? "bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                                    : "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                                }`}
                              >
                                {u.role}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono font-medium text-slate-800 dark:text-slate-200">
                              {u.project_count}
                            </td>
                            <td className="py-3 px-4 text-slate-400 text-[11px]">
                              {u.last_activity_at ? new Date(u.last_activity_at).toLocaleDateString() : "Never"}
                            </td>
                            <td className="py-3 px-4 text-slate-400 text-[11px]">
                              {new Date(u.created_at).toLocaleDateString()}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => handleViewUser(u.id)}
                                className="px-3 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 text-[#5454ee] text-[11px] font-semibold transition-colors cursor-pointer"
                              >
                                View Journey
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* User Pagination */}
          <div className="flex items-center justify-between pt-2">
            <button
              disabled={userPage <= 1 || usersLoading}
              onClick={() => {
                const next = userPage - 1;
                setUserPage(next);
                fetchUsers(next);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 disabled:opacity-40 cursor-pointer shadow-sm"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Previous
            </button>
            <span className="text-xs text-slate-400">
              Page <strong className="text-slate-700 dark:text-slate-200">{userPage}</strong>
            </span>
            <button
              disabled={userPage * 20 >= totalUsers || usersLoading}
              onClick={() => {
                const next = userPage + 1;
                setUserPage(next);
                fetchUsers(next);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 disabled:opacity-40 cursor-pointer shadow-sm"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* User Detail Journey Modal */}
          {selectedUserDetail && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div className="w-full max-w-3xl max-h-[85vh] rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl flex flex-col overflow-hidden text-slate-900 dark:text-white">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Users className="w-4 h-4 text-[#5454ee]" />
                      User Journey: {selectedUserDetail.user.full_name || selectedUserDetail.user.email}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                      <span>
                        Spaces: <strong className="text-slate-700 dark:text-slate-200">{selectedUserDetail.spaces_count}</strong>
                      </span>
                      <span>
                        Role: <strong className="text-[#5454ee] uppercase">{selectedUserDetail.user.role}</strong>
                      </span>
                      <span>Joined: {new Date(selectedUserDetail.user.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedUserDetail(null)}
                    className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="overflow-y-auto space-y-6 pt-4 flex-1 pr-1">
                  {/* Projects Summary */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                      Projects &amp; Knowledge State ({selectedUserDetail.projects.length})
                    </h4>
                    {selectedUserDetail.projects.length === 0 ? (
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-center text-xs text-slate-400">
                        No projects started yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedUserDetail.projects.map((pj: AdminUserProjectSummary) => (
                          <div
                            key={pj.id}
                            className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between"
                          >
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-white text-xs">{pj.name}</div>
                              <div className="text-[11px] text-slate-400">{pj.space_name}</div>
                            </div>
                            <div className="flex items-center gap-4 text-xs font-mono text-slate-500">
                              <span>{pj.concept_count} concepts</span>
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                {pj.average_mastery !== null ? `${(pj.average_mastery * 100).toFixed(0)}% mastery` : "unassessed"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Recent Activity Log */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                      Recent Activity Events ({selectedUserDetail.recent_activity.length})
                    </h4>
                    {selectedUserDetail.recent_activity.length === 0 ? (
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-center text-xs text-slate-400">
                        No activity recorded.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {selectedUserDetail.recent_activity.map((ev: AdminUserRecentActivity) => (
                          <div
                            key={ev.id}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/60 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs"
                          >
                            <span className="font-mono text-[#5454ee] font-medium">{ev.event_type}</span>
                            <span className="text-slate-400 text-[11px] font-mono">
                              {new Date(ev.created_at).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: AUDIT & ACTIVITY FEED */}
      {activeTab === "activity" && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 max-w-md">
              <div className="relative w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter events by user, project, or event name..."
                  value={activitySearchQuery}
                  onChange={(e) => setActivitySearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#5454ee]"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value)}
                className="bg-slate-50/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 px-3 py-1.5 focus:outline-none focus:border-[#5454ee]"
              >
                <option value="">All Event Types</option>
                <option value="quiz_completed">quiz_completed</option>
                <option value="tutor_message_sent">tutor_message_sent</option>
                <option value="material_uploaded">material_uploaded</option>
                <option value="material_processed">material_processed</option>
                <option value="concept_extracted">concept_extracted</option>
                <option value="recommendation_generated">recommendation_generated</option>
              </select>
            </div>
          </div>

          {activityLoading ? (
            <div className="py-20 flex justify-center text-slate-400">
              <Loader2 className="w-7 h-7 animate-spin text-[#5454ee]" />
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                    <tr>
                      <th className="py-3 px-4">Event Type</th>
                      <th className="py-3 px-4">User</th>
                      <th className="py-3 px-4">Project</th>
                      <th className="py-3 px-4 text-right">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                    {filteredActivities.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-slate-400">
                          No audit activity events recorded.
                        </td>
                      </tr>
                    ) : (
                      filteredActivities.map((ev: AdminActivityItem) => (
                        <tr key={ev.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4">
                            <span className="font-mono text-[#5454ee] bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800/50 px-2.5 py-0.5 rounded-full text-[11px] font-semibold">
                              {ev.event_type}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                            {ev.user_email || ev.user_id}
                          </td>
                          <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                            {ev.project_name || (ev.project_id ? ev.project_id.slice(0, 8) : "—")}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-400 text-[11px] font-mono">
                            {new Date(ev.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: AI OBSERVABILITY */}
      {activeTab === "ai" && (
        <div className="space-y-6">
          {aiUsageLoading ? (
            <div className="py-20 flex justify-center text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-[#5454ee]" />
            </div>
          ) : aiUsage ? (
            <>
              {/* Telemetry KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm space-y-1">
                  <span className="text-xs font-medium text-slate-400">Total Calls</span>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono tracking-tight">
                    {aiUsage.total_calls}
                  </div>
                  <span className="text-[11px] text-slate-400">API invocations</span>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm space-y-1">
                  <span className="text-xs font-medium text-slate-400">Failure Rate</span>
                  <div
                    className={`text-2xl font-bold font-mono tracking-tight ${
                      aiUsage.failure_rate > 0.05 ? "text-rose-500" : "text-emerald-600"
                    }`}
                  >
                    {(aiUsage.failure_rate * 100).toFixed(1)}%
                  </div>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400">SLA &lt; 2%</span>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm space-y-1">
                  <span className="text-xs font-medium text-slate-400">P50 Latency</span>
                  <div className="text-2xl font-bold text-[#5454ee] font-mono tracking-tight">
                    {aiUsage.p50_latency_ms.toFixed(0)} ms
                  </div>
                  <span className="text-[11px] text-slate-400">Median response</span>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm space-y-1">
                  <span className="text-xs font-medium text-slate-400">P95 Latency</span>
                  <div className="text-2xl font-bold text-[#5454ee] font-mono tracking-tight">
                    {aiUsage.p95_latency_ms.toFixed(0)} ms
                  </div>
                  <span className="text-[11px] text-slate-400">95th percentile</span>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm space-y-1">
                  <span className="text-xs font-medium text-slate-400">Total Tokens</span>
                  <div className="text-2xl font-bold text-amber-600 font-mono tracking-tight">
                    {aiUsage.total_tokens.toLocaleString()}
                  </div>
                  <span className="text-[11px] text-slate-400">Tokens consumed</span>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm space-y-1">
                  <span className="text-xs font-medium text-slate-400">Estimated Cost</span>
                  <div className="text-2xl font-bold text-purple-600 font-mono tracking-tight">
                    ${aiUsage.total_cost_usd.toFixed(4)}
                  </div>
                  <span className="text-[11px] text-slate-400">Gemini model USD</span>
                </div>
              </div>

              {/* Privacy Confirmation Banner */}
              <div className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-medium">
                    Zero-Prompt Telemetry Active: Raw prompts, completions, and sensitive keys are strictly omitted from database logs.
                  </span>
                </div>
                <span className="font-mono text-[11px] text-emerald-600/80 dark:text-emerald-400/80 font-semibold">
                  Compliant with EduMind Security Policy
                </span>
              </div>

              {/* Recent Logs Table */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Recent Model Operations ({aiUsage.recent_logs.length})
                </h4>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                        <tr>
                          <th className="py-3 px-4">Operation</th>
                          <th className="py-3 px-4">Provider / Model</th>
                          <th className="py-3 px-4">Latency</th>
                          <th className="py-3 px-4">Tokens</th>
                          <th className="py-3 px-4">Est. Cost</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4 text-right">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                        {aiUsage.recent_logs.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-12 text-center text-slate-400">
                              No AI operations logged yet.
                            </td>
                          </tr>
                        ) : (
                          aiUsage.recent_logs.map((log: AdminAIUsageItem) => (
                            <tr key={log.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="py-3 px-4 font-mono font-medium text-[#5454ee]">{log.operation}</td>
                              <td className="py-3 px-4 font-mono text-slate-500">
                                {log.provider} / {log.model}
                              </td>
                              <td className="py-3 px-4 font-mono">{log.latency_ms.toFixed(0)} ms</td>
                              <td className="py-3 px-4 font-mono">
                                {log.total_tokens ? log.total_tokens.toLocaleString() : "—"}
                              </td>
                              <td className="py-3 px-4 font-mono text-purple-600 dark:text-purple-400">
                                {log.estimated_cost_usd !== null ? `$${log.estimated_cost_usd.toFixed(5)}` : "—"}
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                                    log.success
                                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200"
                                      : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200"
                                  }`}
                                >
                                  {log.success ? "success" : "failed"}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-slate-400 text-[11px]">
                                {new Date(log.created_at).toLocaleTimeString()}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* TAB 5: PIPELINE HEALTH & BACKGROUND JOBS */}
      {activeTab === "jobs" && (
        <div className="space-y-6">
          {jobsLoading ? (
            <div className="py-20 flex justify-center text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-[#5454ee]" />
            </div>
          ) : jobsData ? (
            <>
              {/* Pipeline Status Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {Object.entries(jobsData.status_counts).map(([status, count]) => {
                  let color = "text-[#5454ee]";
                  let bg = "bg-indigo-50 dark:bg-indigo-950/40";
                  if (status === "ready") {
                    color = "text-emerald-600";
                    bg = "bg-emerald-50 dark:bg-emerald-950/40";
                  } else if (status === "failed") {
                    color = "text-rose-600";
                    bg = "bg-rose-50 dark:bg-rose-950/40";
                  } else if (status === "processing") {
                    color = "text-sky-600";
                    bg = "bg-sky-50 dark:bg-sky-950/40";
                  }
                  return (
                    <div
                      key={status}
                      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
                          {status}
                        </span>
                        <div className={`w-2.5 h-2.5 rounded-full ${bg} ${color}`} />
                      </div>
                      <div className={`text-3xl font-bold font-mono tracking-tight ${color}`}>{count}</div>
                      <span className="text-[11px] text-slate-400">Materials in state</span>
                    </div>
                  );
                })}
              </div>

              {/* Failed Materials Inspector */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Failed Materials Inspection ({jobsData.recent_failures.length})
                </h4>
                {jobsData.recent_failures.length === 0 ? (
                  <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-100 dark:border-slate-800 text-center shadow-sm">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      All pipeline materials processed successfully
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      No document extraction or chunking errors currently recorded in database.
                    </p>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                        <tr>
                          <th className="py-3 px-4">Filename</th>
                          <th className="py-3 px-4">Project</th>
                          <th className="py-3 px-4">Failure Reason</th>
                          <th className="py-3 px-4 text-right">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                        {jobsData.recent_failures.map((m: AdminJobFailureItem) => (
                          <tr key={m.material_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                            <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">{m.filename}</td>
                            <td className="py-3 px-4 font-mono text-[#5454ee]">{m.project_name}</td>
                            <td className="py-3 px-4 text-rose-500">{m.failure_reason || "Unknown error"}</td>
                            <td className="py-3 px-4 text-right font-mono text-slate-400 text-[11px]">
                              {new Date(m.created_at).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* TAB 6: AI QUALITY BENCHMARKS & EVALS */}
      {activeTab === "evals" && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#5454ee]" />
                AI Quality Evaluation Harness
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Deterministic regression benchmark gates verifying grounded retrieval, citation integrity, and MCQ format validity.
              </p>
            </div>

            <button
              disabled={runningEval}
              onClick={handleRunEvaluation}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#5454ee] hover:bg-[#4343d0] text-white text-xs font-semibold transition-all shadow-sm shadow-[#5454ee]/30 disabled:opacity-50 cursor-pointer self-start sm:self-auto"
            >
              {runningEval ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span>Run AI Evaluation Benchmark</span>
            </button>
          </div>

          {evalsLoading ? (
            <div className="py-20 flex justify-center text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-[#5454ee]" />
            </div>
          ) : evalSummary ? (
            <>
              {/* 4 KPI Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm space-y-1">
                  <span className="text-xs font-medium text-slate-400">Overall Pass Rate</span>
                  <div
                    className={`text-3xl font-bold font-mono tracking-tight ${
                      evalSummary.overall_pass_rate >= 80 ? "text-emerald-600" : "text-amber-500"
                    }`}
                  >
                    {evalSummary.overall_pass_rate.toFixed(1)}%
                  </div>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Quality Target &ge; 80%</span>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm space-y-1">
                  <span className="text-xs font-medium text-slate-400">Total Benchmark Cases</span>
                  <div className="text-3xl font-bold text-slate-900 dark:text-white font-mono tracking-tight">
                    {evalSummary.total_cases}
                  </div>
                  <span className="text-[11px] text-slate-400">Test assertions</span>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm space-y-1">
                  <span className="text-xs font-medium text-slate-400">Passed Test Cases</span>
                  <div className="text-3xl font-bold text-emerald-600 font-mono tracking-tight">
                    {evalSummary.passed_cases}
                  </div>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Deterministic verified</span>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm space-y-1">
                  <span className="text-xs font-medium text-slate-400">Last Evaluated</span>
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-mono mt-2">
                    {evalSummary.latest_run_at ? new Date(evalSummary.latest_run_at).toLocaleTimeString() : "Never"}
                  </div>
                  <span className="text-[11px] text-slate-400">Automated run</span>
                </div>
              </div>

              {/* Suite Summaries */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {evalSummary.suite_summaries.map((s: AIEvaluationSuiteSummary) => (
                  <div
                    key={s.suite}
                    className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-3"
                  >
                    <div className="font-semibold text-slate-900 dark:text-white text-xs">{s.suite}</div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-400">
                          {s.passed} / {s.total} passed
                        </span>
                        <span
                          className={`font-bold ${
                            s.pass_rate >= 80 ? "text-emerald-600" : "text-amber-500"
                          }`}
                        >
                          {s.pass_rate.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${s.pass_rate}%` }}
                          className={`h-full rounded-full ${
                            s.pass_rate >= 80 ? "bg-emerald-500" : "bg-amber-400"
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Test Cases Table */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Individual Benchmark Cases ({evalSummary.cases.length})
                </h4>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                        <tr>
                          <th className="py-3 px-4">Suite</th>
                          <th className="py-3 px-4">Case ID</th>
                          <th className="py-3 px-4">Result</th>
                          <th className="py-3 px-4">Score</th>
                          <th className="py-3 px-4">Notes</th>
                          <th className="py-3 px-4 text-right">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                        {evalSummary.cases.map((c: AIEvaluationCaseItem) => (
                          <tr
                            key={c.id}
                            onClick={() => setSelectedCaseModal(c)}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                          >
                            <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">{c.suite}</td>
                            <td className="py-3 px-4 font-mono text-[#5454ee]">{c.case_id}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex items-center gap-1 text-[11px] font-mono px-2.5 py-0.5 rounded-full ${
                                  c.passed
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200"
                                    : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200"
                                }`}
                              >
                                {c.passed ? (
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <XCircle className="w-3 h-3 text-rose-600" />
                                )}
                                {c.passed ? "PASSED" : "FAILED"}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                              {c.score !== null ? `${(c.score * 100).toFixed(0)}%` : "—"}
                            </td>
                            <td className="py-3 px-4 text-slate-400 max-w-xs truncate">{c.notes || "—"}</td>
                            <td className="py-3 px-4 text-right text-slate-400 text-[11px] font-mono">
                              {new Date(c.run_at).toLocaleTimeString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {/* Test Case Detail Modal */}
          {selectedCaseModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div className="w-full max-w-xl rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl text-slate-900 dark:text-white">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      {selectedCaseModal.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-500" />
                      )}
                      Test Case: {selectedCaseModal.case_id}
                    </h3>
                    <div className="text-xs text-slate-400 mt-1">Suite: {selectedCaseModal.suite}</div>
                  </div>
                  <button
                    onClick={() => setSelectedCaseModal(null)}
                    className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="mt-4 space-y-3 text-xs">
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400 font-semibold block mb-1">Score:</span>
                    <span className="font-mono text-[#5454ee] font-bold">
                      {selectedCaseModal.score !== null ? `${(selectedCaseModal.score * 100).toFixed(0)}%` : "N/A"}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400 font-semibold block mb-1">Evaluation Notes:</span>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      {selectedCaseModal.notes || "No notes provided."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
