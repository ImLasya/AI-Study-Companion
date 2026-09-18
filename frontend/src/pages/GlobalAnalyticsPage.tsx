import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  BarChart3,
  Calendar,
  CheckCircle2,
  FolderKanban,
  Loader2,
  MessageSquare,
  TrendingUp,
  Zap,
} from "lucide-react";
import { getGlobalAnalyticsApi } from "@/lib/api";
import { GlobalAnalyticsResponse } from "@/types";

export const GlobalAnalyticsPage: React.FC = () => {
  const [data, setData] = useState<GlobalAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-28 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
        <p className="text-sm font-medium">Aggregating learning telemetry...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-md mx-auto my-16 text-center">
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs mb-4">
          {error || "Unable to load analytics data"}
        </div>
        <button
          onClick={fetchAnalytics}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
        >
          Try again
        </button>
      </div>
    );
  }

  const { total_study_activity, projects_by_progress, weakest_areas, overall_trend, ai_usage_summary } = data;

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2 text-accent text-xs font-mono font-semibold uppercase tracking-wider mb-1">
            <BarChart3 className="w-4 h-4" />
            <span>Telemetry &amp; Performance</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
            Global Analytics
          </h1>
          <p className="text-xs sm:text-sm text-text-secondary mt-1">
            Cross-project learning engagement, concept mastery, and AI usage metrics.
          </p>
        </div>

        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-border bg-surface text-xs text-text-secondary hover:text-text-primary hover:bg-surface-muted transition-colors self-start sm:self-auto"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Dashboard</span>
        </Link>
      </div>

      {/* Row 1: KPI Grid (Borderless Open Visual Blocks) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Active Study Days */}
        <div className="p-4 rounded-2xl bg-surface-muted/40 transition-all hover:bg-surface-muted/70 flex flex-col justify-between">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[10px] font-semibold uppercase tracking-wider font-mono">
              Study Streak
            </span>
            <div className="p-1.5 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-text-primary font-mono">
            {total_study_activity?.active_study_days ?? 0}{" "}
            <span className="text-xs text-text-muted font-normal">days</span>
          </div>
          <div className="text-[11px] text-text-muted mt-1">Active study days</div>
        </div>

        {/* Quizzes Taken */}
        <div className="p-4 rounded-2xl bg-surface-muted/40 transition-all hover:bg-surface-muted/70 flex flex-col justify-between">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[10px] font-semibold uppercase tracking-wider font-mono">
              Quizzes Completed
            </span>
            <div className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
            {total_study_activity?.total_quizzes_completed ?? 0}
          </div>
          <div className="text-[11px] text-text-muted mt-1">Adaptive practice tests</div>
        </div>

        {/* AI Tutor Sessions */}
        <div className="p-4 rounded-2xl bg-surface-muted/40 transition-all hover:bg-surface-muted/70 flex flex-col justify-between">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[10px] font-semibold uppercase tracking-wider font-mono">
              Tutor Sessions
            </span>
            <div className="p-1.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-indigo-600 dark:text-indigo-400 font-mono">
            {total_study_activity?.total_tutor_conversations ?? 0}
          </div>
          <div className="text-[11px] text-text-muted mt-1">Grounded RAG chats</div>
        </div>

        {/* Total Activity */}
        <div className="p-4 rounded-2xl bg-surface-muted/40 transition-all hover:bg-surface-muted/70 flex flex-col justify-between">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[10px] font-semibold uppercase tracking-wider font-mono">
              Total Activity
            </span>
            <div className="p-1.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-purple-600 dark:text-purple-400 font-mono">
            {total_study_activity?.total_events ?? 0}
          </div>
          <div className="text-[11px] text-text-muted mt-1">Recorded learning events</div>
        </div>
      </div>

      {/* Row 2: Projects Progress + Weak Areas (Open Section Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column (7 cols): Projects by Progress */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <div className="flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-bold text-text-primary tracking-tight">
                Project Mastery &amp; Progress
              </h2>
            </div>
            <span className="text-[11px] font-mono text-text-muted">
              {projects_by_progress.length} tracked
            </span>
          </div>

          {projects_by_progress.length === 0 ? (
            <div className="py-12 text-center text-text-muted text-xs">
              No active projects found. Create a project in Spaces to track progress.
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {projects_by_progress.map((p) => {
                const mastery = p.average_mastery !== null ? Math.round(p.average_mastery) : null;
                return (
                  <div
                    key={p.project_id}
                    className="py-3.5 px-2 hover:bg-surface-muted/40 transition-colors rounded-xl space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[9px] font-mono uppercase tracking-wider text-accent font-semibold">
                          {p.space_name}
                        </span>
                        <h3 className="text-xs font-bold text-text-primary">
                          {p.project_name}
                        </h3>
                      </div>
                      <span className="text-xs font-bold text-accent font-mono">
                        {mastery !== null ? `${mastery}%` : "Unassessed"}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-1.5 bg-surface-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all duration-500"
                        style={{ width: `${mastery || 0}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-text-muted pt-0.5">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        {p.assessed_concepts} / {p.total_concepts} concepts assessed
                      </span>
                      <Link
                        to={`/projects/${p.project_id}`}
                        className="text-accent hover:text-accent-hover font-medium inline-flex items-center gap-1 text-xs"
                      >
                        <span>Workspace</span> <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column (5 cols): Weak Areas & Focus Topics */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-bold text-text-primary tracking-tight">
                Weakest Areas Identified
              </h2>
            </div>
            <span className="text-[11px] font-mono text-text-muted">
              {weakest_areas.length} topics
            </span>
          </div>

          {weakest_areas.length === 0 ? (
            <div className="py-12 text-center text-text-muted text-xs">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
              <p className="font-semibold text-text-primary">All caught up!</p>
              <p className="text-text-muted mt-1">No concepts requiring urgent reinforcement right now.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {weakest_areas.slice(0, 6).map((item, idx) => (
                <div
                  key={item.concept_id}
                  className="p-3 rounded-xl bg-surface-muted/40 border-l-3 border-l-amber-500 flex items-center justify-between hover:bg-surface-muted/70 transition-colors"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-bold">
                        P{idx + 1}
                      </span>
                      <h4 className="text-xs font-semibold text-text-primary truncate">
                        {item.concept_name}
                      </h4>
                    </div>
                    <p className="text-[10px] text-text-muted truncate">
                      Project: {item.project_name}
                    </p>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 font-mono">
                      {Math.round(item.mastery_score * 100)}%
                    </span>
                    <p className="text-[9px] text-text-muted">mastery</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Daily Activity History & AI Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Activity Breakdown */}
        <div className="lg:col-span-7 rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-sky-500" />
            <h2 className="text-base font-bold text-text-primary tracking-tight">
              Activity History
            </h2>
          </div>

          {overall_trend && overall_trend.length > 0 ? (
            <div className="space-y-2">
              <div className="grid grid-cols-4 text-[11px] font-mono text-text-muted pb-2 border-b border-border">
                <span>Date</span>
                <span>Events</span>
                <span>Quizzes</span>
                <span>Tutor Turns</span>
              </div>
              {overall_trend.slice(-7).reverse().map((day) => (
                <div
                  key={day.date}
                  className="grid grid-cols-4 text-xs py-2 border-b border-border/50 text-text-secondary items-center"
                >
                  <span className="font-mono text-[11px] text-text-muted">{day.date}</span>
                  <span className="font-semibold text-text-primary">{day.event_count}</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                    {day.event_breakdown?.["quiz_completed"] ?? day.event_breakdown?.["quiz_attempt"] ?? 0}
                  </span>
                  <span className="text-accent font-mono">
                    {day.event_breakdown?.["tutor_turn"] ?? day.event_breakdown?.["tutor_chat"] ?? 0}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-text-muted text-xs">
              No daily telemetry available yet. Complete quizzes or chat with the AI tutor to see trend history.
            </div>
          )}
        </div>

        {/* AI Observability Telemetry */}
        <div className="lg:col-span-5 rounded-2xl border border-border bg-surface p-6 flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-accent" />
              <h2 className="text-base font-bold text-text-primary tracking-tight">
                AI Telemetry
              </h2>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-surface-muted/60 border border-border flex justify-between items-center">
                <span className="text-text-secondary">Total AI Calls</span>
                <span className="text-sm font-bold text-text-primary font-mono">
                  {ai_usage_summary?.total_calls ?? 0}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-surface-muted/60 border border-border flex justify-between items-center">
                <span className="text-text-secondary">Total Tokens Processed</span>
                <span className="text-sm font-bold text-accent font-mono">
                  {(ai_usage_summary?.total_tokens ?? 0).toLocaleString()}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-surface-muted/60 border border-border flex justify-between items-center">
                <span className="text-text-secondary">Grounded Citations</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  pgvector Verified
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-border text-[11px] text-text-muted flex items-center justify-between">
            <span>Powered by Gemini &amp; pgvector</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
};
