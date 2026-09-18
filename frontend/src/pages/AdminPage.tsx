import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  Activity,
  Award,
  BarChart3,
  CheckCircle2,
  Coins,
  Filter,
  Layers,
  Loader2,
  Play,
  RefreshCw,
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
    description: "Cross-tenant system visibility, high-level learning performance, and platform capacity.",
    badge: "Platform Telemetry",
    icon: BarChart3,
    badgeColor: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
    iconColor: "text-indigo-600 dark:text-indigo-400",
    iconBg: "bg-indigo-500/10 border-indigo-500/20",
  },
  users: {
    title: "Users & Tenancy",
    description: "Platform user accounts, active spaces, learning journeys, and strict data isolation boundaries.",
    badge: "Tenant Auditing",
    icon: Users,
    badgeColor: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
    iconColor: "text-purple-600 dark:text-purple-400",
    iconBg: "bg-purple-500/10 border-purple-500/20",
  },
  activity: {
    title: "Audit & Activity Feed",
    description: "Live real-time activity stream across all student actions, quiz sessions, and material events.",
    badge: "System Event Stream",
    icon: Activity,
    badgeColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    iconBg: "bg-emerald-500/10 border-emerald-500/20",
  },
  ai: {
    title: "AI Observability",
    description: "Granular model telemetry, prompt/completion token usage, execution latency, and cost breakdown.",
    badge: "Model Telemetry",
    icon: Zap,
    badgeColor: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    iconColor: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-500/10 border-amber-500/20",
  },
  jobs: {
    title: "Pipeline Health & Background Jobs",
    description: "Celery worker processing status, asynchronous task queues, and PDF extraction error logs.",
    badge: "Asynchronous Workers",
    icon: Server,
    badgeColor: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
    iconColor: "text-sky-600 dark:text-sky-400",
    iconBg: "bg-sky-500/10 border-sky-500/20",
  },
  evals: {
    title: "AI Evaluations & Benchmarks",
    description: "Automated regression benchmark suites covering grounding, citation accuracy, and retrieval relevance.",
    badge: "Quality Assurance",
    icon: Sparkles,
    badgeColor: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    iconColor: "text-rose-600 dark:text-rose-400",
    iconBg: "bg-rose-500/10 border-rose-500/20",
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
  const [selectedUserDetail, setSelectedUserDetail] = useState<AdminUserDetailResponse | null>(null);

  // Tab 3: Activity Feed
  const [activities, setActivities] = useState<AdminActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityFilter, setActivityFilter] = useState<string>("");

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

  return (
    <div className="space-y-6">
      {/* Dynamic Header based on active tab */}
      {(() => {
        const config = TAB_CONFIG[activeTab] || TAB_CONFIG.overview;
        const Icon = config.icon;
        return (
          <div className="space-y-4 border-b border-border pb-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border ${config.iconBg} ${config.iconColor}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h1 className="text-2xl font-bold text-text-primary tracking-tight">{config.title}</h1>
                    <span className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full border ${config.badgeColor}`}>
                      {config.badge}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted mt-1">{config.description}</p>
                </div>
              </div>

              {/* Global Refresh Button */}
              <button
                onClick={() => {
                  if (activeTab === "overview") fetchOverview();
                  if (activeTab === "users") fetchUsers(userPage);
                  if (activeTab === "activity") fetchActivity();
                  if (activeTab === "ai") fetchAiUsage();
                  if (activeTab === "jobs") fetchJobs();
                  if (activeTab === "evals") fetchEvaluations();
                }}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-border bg-surface-muted hover:bg-surface text-text-secondary hover:text-text-primary text-xs font-medium transition-colors self-start sm:self-auto shadow-sm cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-accent" />
                Refresh
              </button>
            </div>

            {/* Quick Sub-Navigation */}
            <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-0.5">
              {validTabs.map((tabKey) => {
                const cfg = TAB_CONFIG[tabKey];
                const TabIcon = cfg.icon;
                const isActive = activeTab === tabKey;
                return (
                  <Link
                    key={tabKey}
                    to={`/admin?tab=${tabKey}`}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
                      isActive
                        ? "bg-accent text-white shadow-md shadow-accent/25"
                        : "bg-surface-muted text-text-secondary hover:text-text-primary hover:bg-surface border border-border"
                    }`}
                  >
                    <TabIcon className="w-3.5 h-3.5" />
                    <span>{cfg.title}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {overviewLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-text-muted">
              <Loader2 className="w-8 h-8 animate-spin text-accent mb-2" />
              <p className="text-xs">Aggregating platform telemetry...</p>
            </div>
          ) : overview ? (
            <>
              {/* Primary Open KPI Blocks */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-6 py-2 pb-6 border-b border-border/70">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-text-muted text-xs font-medium">
                    <div className="p-1 rounded-md bg-indigo-500/10 text-indigo-500">
                      <Users className="w-3.5 h-3.5" />
                    </div>
                    <span>Total Users</span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-text-primary font-mono tracking-tight">{overview.total_users}</div>
                  <div className="text-[11px] text-text-muted">
                    {overview.active_users_daily} active today
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-text-muted text-xs font-medium">
                    <div className="p-1 rounded-md bg-purple-500/10 text-purple-500">
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <span>Spaces / Projects</span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-text-primary font-mono tracking-tight">
                    {overview.total_spaces}{" "}
                    <span className="text-base font-normal text-text-muted">/ {overview.total_projects}</span>
                  </div>
                  <div className="text-[11px] text-text-muted">
                    {overview.active_users_weekly} active this week
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-text-muted text-xs font-medium">
                    <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-500">
                      <Award className="w-3.5 h-3.5" />
                    </div>
                    <span>Active Today</span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-emerald-500 font-mono tracking-tight">
                    {overview.active_users_daily}
                  </div>
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    Daily active learners
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-text-muted text-xs font-medium">
                    <div className="p-1 rounded-md bg-amber-500/10 text-amber-500">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <span>AI Operations</span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-text-primary font-mono tracking-tight">{overview.total_ai_calls}</div>
                  <div className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                    Monitored calls
                  </div>
                </div>

                <div className="space-y-1 col-span-2 sm:col-span-4 lg:col-span-1">
                  <div className="flex items-center gap-1.5 text-text-muted text-xs font-medium">
                    <div className="p-1 rounded-md bg-purple-500/10 text-purple-500">
                      <Coins className="w-3.5 h-3.5" />
                    </div>
                    <span>AI Spend</span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-300 font-mono tracking-tight">
                    ${overview.total_ai_spend_usd.toFixed(4)}
                  </div>
                  <div className="text-[11px] text-text-muted">Estimated cost USD</div>
                </div>
              </div>

              {/* Sub-system Status Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                    <Server className="w-4 h-4 text-sky-500" />
                    Asynchronous Pipeline Status
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    {Object.entries(overview.job_health_summary).map(([status, count]) => (
                      <div key={status} className="p-3 rounded-xl bg-surface-muted/60 text-center">
                        <div className="text-[10px] uppercase font-medium text-text-muted">{status}</div>
                        <div className="text-xl font-bold text-accent font-mono mt-0.5">{count}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-500" />
                    Security &amp; Isolation Guardrails
                  </h3>
                  <div className="space-y-2 text-xs text-text-secondary">
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-muted/60">
                      <span>Strict Backend Dependency:</span>
                      <span className="font-mono text-emerald-500 font-semibold">get_current_admin</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-muted/60">
                      <span>Telemetry Privacy Policy:</span>
                      <span className="font-mono text-emerald-500 font-semibold">No Prompts / Keys / Secrets</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-muted/60">
                      <span>Historical Telemetry:</span>
                      <span className="font-mono text-emerald-500 font-semibold">Persisted &amp; Backfilled</span>
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
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">Registered Users ({totalUsers})</h3>
            <span className="text-xs text-text-muted">Page {userPage}</span>
          </div>

          {usersLoading ? (
            <div className="py-16 flex justify-center text-text-muted">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-muted border-b border-border text-text-muted font-medium">
                  <tr>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Projects</th>
                    <th className="py-3 px-4">Last Active</th>
                    <th className="py-3 px-4">Joined</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-text-secondary">
                  {users.map((u: AdminUserSummary) => (
                    <tr key={u.id} className="hover:bg-surface-muted transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-text-primary">{u.full_name || "Unnamed"}</div>
                        <div className="text-[11px] text-text-muted font-mono">{u.email}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                            u.role === "admin"
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25"
                              : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20"
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-text-primary">{u.project_count}</td>
                      <td className="py-3 px-4 text-text-muted text-[11px]">
                        {u.last_activity_at ? new Date(u.last_activity_at).toLocaleDateString() : "Never"}
                      </td>
                      <td className="py-3 px-4 text-text-muted text-[11px]">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleViewUser(u.id)}
                          className="px-2.5 py-1 rounded bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 text-[11px] font-medium transition-colors cursor-pointer"
                        >
                          View Journey
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
              className="px-3 py-1.5 rounded-lg border border-border bg-surface text-xs text-text-secondary hover:text-text-primary disabled:opacity-40 cursor-pointer"
            >
              Previous
            </button>
            <button
              disabled={userPage * 15 >= totalUsers || usersLoading}
              onClick={() => {
                const next = userPage + 1;
                setUserPage(next);
                fetchUsers(next);
              }}
              className="px-3 py-1.5 rounded-lg border border-border bg-surface text-xs text-text-secondary hover:text-text-primary disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>

          {/* User Detail Journey Modal */}
          {selectedUserDetail && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div className="w-full max-w-3xl max-h-[85vh] rounded-2xl border border-border bg-surface p-6 shadow-2xl flex flex-col overflow-hidden text-text-primary">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div>
                    <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                      <Users className="w-4 h-4 text-accent" />
                      User Journey: {selectedUserDetail.user.full_name || selectedUserDetail.user.email}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-text-muted mt-1">
                      <span>
                        Spaces: <strong className="text-text-primary">{selectedUserDetail.spaces_count}</strong>
                      </span>
                      <span>
                        Role: <strong className="text-accent">{selectedUserDetail.user.role}</strong>
                      </span>
                      <span>Joined: {new Date(selectedUserDetail.user.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedUserDetail(null)}
                    className="p-1 rounded-lg border border-border text-text-muted hover:text-text-primary hover:bg-surface-muted cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="overflow-y-auto space-y-6 pt-4 flex-1 pr-1">
                  {/* Projects Summary */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
                      Projects ({selectedUserDetail.projects.length})
                    </h4>
                    <div className="space-y-2">
                      {selectedUserDetail.projects.map((pj: AdminUserProjectSummary) => (
                        <div key={pj.id} className="p-3 rounded-xl border border-border bg-surface-muted flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-text-primary text-xs">{pj.name}</div>
                            <div className="text-[11px] text-text-muted">{pj.space_name}</div>
                          </div>
                          <div className="flex items-center gap-4 text-xs font-mono text-text-muted">
                            <span>{pj.concept_count} concepts</span>
                            <span>
                              {pj.average_mastery !== null ? `${(pj.average_mastery * 100).toFixed(0)}% mastery` : "unassessed"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recent Activity Log */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
                      Recent Activity Events ({selectedUserDetail.recent_activity.length})
                    </h4>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {selectedUserDetail.recent_activity.map((ev: AdminUserRecentActivity) => (
                        <div
                          key={ev.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-surface-muted border border-border text-xs"
                        >
                          <span className="font-mono text-accent font-medium">{ev.event_type}</span>
                          <span className="text-text-muted text-[11px] font-mono">
                            {new Date(ev.created_at).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-text-primary">Cross-Tenant Activity Audit</h3>
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-text-muted" />
              <select
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value)}
                className="bg-surface border border-border rounded-lg text-xs text-text-primary px-3 py-1.5 focus:outline-none focus:border-accent"
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
            <div className="py-16 flex justify-center text-text-muted">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-muted border-b border-border text-text-muted font-medium">
                  <tr>
                    <th className="py-3 px-4">Event Type</th>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Project</th>
                    <th className="py-3 px-4 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-text-secondary">
                  {activities.map((ev: AdminActivityItem) => (
                    <tr key={ev.id} className="hover:bg-surface-muted transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">
                          {ev.event_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-text-muted">
                        {ev.user_email || ev.user_id}
                      </td>
                      <td className="py-3 px-4 text-text-secondary">
                        {ev.project_name || (ev.project_id ? ev.project_id.slice(0, 8) : "—")}
                      </td>
                      <td className="py-3 px-4 text-right text-text-muted text-[11px] font-mono">
                        {new Date(ev.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: AI OBSERVABILITY */}
      {activeTab === "ai" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">AI Telemetry &amp; Model Performance</h3>
          </div>

          {aiUsageLoading ? (
            <div className="py-20 flex justify-center text-text-muted">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
            </div>
          ) : aiUsage ? (
            <>
              {/* Open Telemetry Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6 py-2 border-b border-border/70 pb-6">
                <div className="space-y-1">
                  <span className="text-xs font-medium text-text-muted">Total Calls</span>
                  <div className="text-2xl sm:text-3xl font-bold text-text-primary font-mono tracking-tight">{aiUsage.total_calls}</div>
                  <span className="text-[11px] text-text-muted">API executions</span>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-text-muted">Failure Rate</span>
                  <div
                    className={`text-2xl sm:text-3xl font-bold font-mono tracking-tight ${
                      aiUsage.failure_rate > 0.05 ? "text-rose-500" : "text-emerald-500"
                    }`}
                  >
                    {(aiUsage.failure_rate * 100).toFixed(1)}%
                  </div>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Target &lt; 2%</span>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-text-muted">P50 Latency</span>
                  <div className="text-2xl sm:text-3xl font-bold text-accent font-mono tracking-tight">
                    {aiUsage.p50_latency_ms.toFixed(0)} ms
                  </div>
                  <span className="text-[11px] text-text-muted">Median response</span>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-text-muted">P95 Latency</span>
                  <div className="text-2xl sm:text-3xl font-bold text-accent font-mono tracking-tight">
                    {aiUsage.p95_latency_ms.toFixed(0)} ms
                  </div>
                  <span className="text-[11px] text-text-muted">95th percentile</span>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-text-muted">Total Tokens</span>
                  <div className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400 font-mono tracking-tight">
                    {aiUsage.total_tokens.toLocaleString()}
                  </div>
                  <span className="text-[11px] text-text-muted">Aggregated tokens</span>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-text-muted">Est. Cost</span>
                  <div className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400 font-mono tracking-tight">
                    ${aiUsage.total_cost_usd.toFixed(4)}
                  </div>
                  <span className="text-[11px] text-text-muted">Model spend USD</span>
                </div>
              </div>

              {/* Recent Logs Table */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
                  Recent AI Operations ({aiUsage.recent_logs.length})
                </h4>
                <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-muted border-b border-border text-text-muted font-medium">
                      <tr>
                        <th className="py-2.5 px-4">Operation</th>
                        <th className="py-2.5 px-4">Provider / Model</th>
                        <th className="py-2.5 px-4">Latency</th>
                        <th className="py-2.5 px-4">Tokens</th>
                        <th className="py-2.5 px-4">Cost</th>
                        <th className="py-2.5 px-4">Status</th>
                        <th className="py-2.5 px-4 text-right">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-text-secondary">
                      {aiUsage.recent_logs.map((log: AdminAIUsageItem) => (
                        <tr key={log.id} className="hover:bg-surface-muted transition-colors">
                          <td className="py-2.5 px-4 font-mono font-medium text-accent">{log.operation}</td>
                          <td className="py-2.5 px-4 font-mono text-text-muted">
                            {log.provider} / {log.model}
                          </td>
                          <td className="py-2.5 px-4 font-mono">{log.latency_ms.toFixed(0)} ms</td>
                          <td className="py-2.5 px-4 font-mono">
                            {log.total_tokens ? log.total_tokens.toLocaleString() : "—"}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-purple-600 dark:text-purple-400">
                            {log.estimated_cost_usd !== null ? `$${log.estimated_cost_usd.toFixed(5)}` : "—"}
                          </td>
                          <td className="py-2.5 px-4">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                log.success
                                  ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                  : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                              }`}
                            >
                              {log.success ? "success" : "failed"}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-text-muted text-[11px]">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Privacy Confirmation Banner */}
              <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-950/10 text-emerald-400 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Privacy verified: Telemetry records strictly omit raw prompts, completions, and sensitive secrets.
                  </span>
                </div>
                <span className="font-mono text-[11px] text-emerald-300/80">Schema Migration 0007 Compliant</span>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* TAB 5: PIPELINE HEALTH */}
      {activeTab === "jobs" && (
        <div className="space-y-6">
          <h3 className="text-sm font-semibold text-text-primary">Materials Pipeline &amp; Async Worker Health</h3>

          {jobsLoading ? (
            <div className="py-20 flex justify-center text-text-muted">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
            </div>
          ) : jobsData ? (
            <>
              {/* Open Materials Pipeline Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 py-2 border-b border-border/70 pb-6">
                {Object.entries(jobsData.status_counts).map(([status, count]) => (
                  <div key={status} className="space-y-1">
                    <span className="text-[11px] uppercase font-medium text-text-muted">{status}</span>
                    <div className="text-2xl sm:text-3xl font-bold text-text-primary font-mono tracking-tight">{count}</div>
                    <span className="text-[11px] text-text-muted">Pipeline materials</span>
                  </div>
                ))}
              </div>

              {/* Failed Materials Inspector */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
                  Failed Materials Inspection ({jobsData.recent_failures.length})
                </h4>
                {jobsData.recent_failures.length === 0 ? (
                  <div className="p-6 rounded-2xl border border-border bg-surface text-center text-xs text-text-muted shadow-sm">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                    No materials currently in failed status across all projects.
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-sm">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-muted border-b border-border text-text-muted">
                        <tr>
                          <th className="py-2.5 px-4">Filename</th>
                          <th className="py-2.5 px-4">Project</th>
                          <th className="py-2.5 px-4">Failure Reason</th>
                          <th className="py-2.5 px-4 text-right">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border text-text-secondary">
                        {jobsData.recent_failures.map((m: AdminJobFailureItem) => (
                          <tr key={m.material_id} className="hover:bg-surface-muted">
                            <td className="py-2.5 px-4 font-medium text-text-primary">{m.filename}</td>
                            <td className="py-2.5 px-4 font-mono text-accent">{m.project_name}</td>
                            <td className="py-2.5 px-4 text-rose-500">{m.failure_reason || "Unknown error"}</td>
                            <td className="py-2.5 px-4 text-right font-mono text-text-muted text-[11px]">
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

      {/* TAB 6: AI EVALUATIONS */}
      {activeTab === "evals" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                AI Quality Evaluation Harness
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Deterministic quality gates against grounded retrieval, hallucination detection, and MCQ validity.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={runningEval}
                onClick={handleRunEvaluation}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                {runningEval ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                Run Evaluation Suite (Deterministic Mock)
              </button>
            </div>
          </div>

          {evalsLoading ? (
            <div className="py-20 flex justify-center text-text-muted">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
            </div>
          ) : evalSummary ? (
            <>
              {/* Summary Open Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 py-2 border-b border-border/70 pb-6">
                <div className="space-y-1">
                  <span className="text-[11px] uppercase font-medium text-text-muted">Overall Pass Rate</span>
                  <div
                    className={`text-2xl sm:text-3xl font-bold font-mono tracking-tight ${
                      evalSummary.overall_pass_rate >= 80 ? "text-emerald-500" : "text-amber-500"
                    }`}
                  >
                    {evalSummary.overall_pass_rate.toFixed(1)}%
                  </div>
                  <span className="text-[11px] text-text-muted">Target &ge; 80%</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] uppercase font-medium text-text-muted">Total Cases</span>
                  <div className="text-2xl sm:text-3xl font-bold text-text-primary font-mono tracking-tight">{evalSummary.total_cases}</div>
                  <span className="text-[11px] text-text-muted">Benchmark items</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] uppercase font-medium text-text-muted">Passed Cases</span>
                  <div className="text-2xl sm:text-3xl font-bold text-emerald-500 font-mono tracking-tight">
                    {evalSummary.passed_cases}
                  </div>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Deterministic verified</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] uppercase font-medium text-text-muted">Last Run</span>
                  <div className="text-xs text-text-secondary font-mono mt-1">
                    {evalSummary.latest_run_at ? new Date(evalSummary.latest_run_at).toLocaleString() : "Never"}
                  </div>
                </div>
              </div>

              {/* Suite Summaries */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {evalSummary.suite_summaries.map((s: AIEvaluationSuiteSummary) => (
                  <div key={s.suite} className="p-3.5 rounded-xl border border-border bg-surface shadow-sm">
                    <div className="font-semibold text-text-primary text-xs">{s.suite}</div>
                    <div className="flex items-center justify-between mt-2 text-xs">
                      <span className="text-text-muted font-mono">
                        {s.passed} / {s.total} passed
                      </span>
                      <span
                        className={`font-bold font-mono ${
                          s.pass_rate >= 80 ? "text-emerald-500" : "text-amber-500"
                        }`}
                      >
                        {s.pass_rate.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Test Cases Table */}
              <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-muted border-b border-border text-text-muted font-medium">
                    <tr>
                      <th className="py-3 px-4">Suite</th>
                      <th className="py-3 px-4">Case ID</th>
                      <th className="py-3 px-4">Result</th>
                      <th className="py-3 px-4">Score</th>
                      <th className="py-3 px-4">Notes</th>
                      <th className="py-3 px-4 text-right">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-text-secondary">
                    {evalSummary.cases.map((c: AIEvaluationCaseItem) => (
                      <tr
                        key={c.id}
                        onClick={() => setSelectedCaseModal(c)}
                        className="hover:bg-surface-muted transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4 font-medium text-text-primary">{c.suite}</td>
                        <td className="py-3 px-4 font-mono text-accent">{c.case_id}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded ${
                              c.passed
                                ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                            }`}
                          >
                            {c.passed ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <XCircle className="w-3 h-3" />
                            )}
                            {c.passed ? "PASSED" : "FAILED"}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-text-muted">
                          {c.score !== null ? `${(c.score * 100).toFixed(0)}%` : "—"}
                        </td>
                        <td className="py-3 px-4 text-text-muted max-w-xs truncate">{c.notes || "—"}</td>
                        <td className="py-3 px-4 text-right text-text-muted text-[11px] font-mono">
                          {new Date(c.run_at).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {/* Test Case Detail Modal */}
          {selectedCaseModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div className="w-full max-w-xl rounded-2xl border border-border bg-surface p-6 shadow-2xl text-text-primary">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div>
                    <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                      {selectedCaseModal.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-500" />
                      )}
                      Test Case: {selectedCaseModal.case_id}
                    </h3>
                    <div className="text-xs text-text-muted mt-1">Suite: {selectedCaseModal.suite}</div>
                  </div>
                  <button
                    onClick={() => setSelectedCaseModal(null)}
                    className="p-1 rounded-lg border border-border text-text-muted hover:text-text-primary hover:bg-surface-muted cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="mt-4 space-y-3 text-xs">
                  <div className="p-3 rounded-xl bg-surface-muted border border-border">
                    <span className="text-text-muted font-semibold block mb-1">Score:</span>
                    <span className="font-mono text-accent font-bold">
                      {selectedCaseModal.score !== null ? `${(selectedCaseModal.score * 100).toFixed(0)}%` : "N/A"}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-muted border border-border">
                    <span className="text-text-muted font-semibold block mb-1">Evaluation Notes:</span>
                    <p className="text-text-secondary leading-relaxed">{selectedCaseModal.notes || "No notes provided."}</p>
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
