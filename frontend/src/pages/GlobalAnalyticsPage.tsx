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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1e293b] pb-5">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
            <BarChart3 className="w-4 h-4" />
            <span>Telemetry & Performance</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Global Analytics
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Cross-project learning engagement, concept mastery, and AI usage metrics.
          </p>
        </div>

        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-[#1e293b] bg-slate-900/60 text-xs text-slate-300 hover:text-white hover:border-slate-700 transition-colors self-start sm:self-auto"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Dashboard</span>
        </Link>
      </div>

      {/* Row 1: KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Active Study Days */}
        <div className="rounded-xl border border-[#1e293b] bg-slate-900/60 p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider font-mono">
              Study Streak
            </span>
            <Calendar className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white font-mono">
            {total_study_activity?.active_study_days ?? 0}{" "}
            <span className="text-xs text-slate-400 font-normal">days</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Active study days</div>
        </div>

        {/* Quizzes Taken */}
        <div className="rounded-xl border border-[#1e293b] bg-slate-900/60 p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider font-mono">
              Quizzes Completed
            </span>
            <Award className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-300 font-mono">
            {total_study_activity?.total_quizzes_completed ?? 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Adaptive practice tests</div>
        </div>

        {/* AI Tutor Sessions */}
        <div className="rounded-xl border border-[#1e293b] bg-slate-900/60 p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider font-mono">
              Tutor Sessions
            </span>
            <MessageSquare className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-indigo-300 font-mono">
            {total_study_activity?.total_tutor_conversations ?? 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Grounded Q&A dialogues</div>
        </div>

        {/* Total Learning Events */}
        <div className="rounded-xl border border-[#1e293b] bg-slate-900/60 p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider font-mono">
              Total Activity
            </span>
            <Activity className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-purple-300 font-mono">
            {total_study_activity?.total_events ?? 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Recorded learning events</div>
        </div>
      </div>

      {/* Row 2: Projects Progress + Weak Areas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Projects by Progress */}
        <div className="lg:col-span-7 rounded-2xl border border-[#1e293b] bg-slate-900/50 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-indigo-400" />
                <h2 className="text-base font-bold text-white tracking-tight">
                  Project Mastery & Progress
                </h2>
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                {projects_by_progress.length} tracked
              </span>
            </div>

            {projects_by_progress.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                No active projects found. Create a project in Spaces to track progress.
              </div>
            ) : (
              <div className="space-y-4">
                {projects_by_progress.map((p) => {
                  const mastery = p.average_mastery !== null ? Math.round(p.average_mastery) : null;
                  return (
                    <div
                      key={p.project_id}
                      className="p-3.5 rounded-xl bg-slate-950/60 border border-[#1e293b]/70 hover:border-indigo-500/40 transition-all"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div>
                          <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-400 font-semibold">
                            {p.space_name}
                          </span>
                          <h3 className="text-sm font-semibold text-white">
                            {p.project_name}
                          </h3>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-indigo-300 font-mono">
                            {mastery !== null ? `${mastery}%` : "Unassessed"}
                          </span>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-2">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                          style={{ width: `${mastery || 0}%` }}
                        />
                      </div>

                      <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          {p.assessed_concepts} / {p.total_concepts} concepts assessed
                        </span>
                        <Link
                          to={`/projects/${p.project_id}`}
                          className="text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-1"
                        >
                          Workspace <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (5 cols): Weak Areas & Focus Topics */}
        <div className="lg:col-span-5 rounded-2xl border border-[#1e293b] bg-slate-900/50 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h2 className="text-base font-bold text-white tracking-tight">
                  Weakest Areas Identified
                </h2>
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                {weakest_areas.length} topics
              </span>
            </div>

            {weakest_areas.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
                <p className="font-semibold text-white">All caught up!</p>
                <p className="text-slate-500 mt-1">No concepts requiring urgent reinforcement right now.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {weakest_areas.slice(0, 6).map((item, idx) => (
                  <div
                    key={item.concept_id}
                    className="p-3 rounded-xl bg-slate-950/60 border border-[#1e293b]/70 flex items-center justify-between hover:border-slate-700 transition-colors"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-semibold">
                          P{idx + 1}
                        </span>
                        <h4 className="text-xs font-semibold text-white truncate">
                          {item.concept_name}
                        </h4>
                      </div>
                      <p className="text-[10px] text-slate-400 truncate">
                        Project: {item.project_name}
                      </p>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <span className="text-xs font-bold text-amber-300 font-mono">
                        {Math.round(item.mastery_score * 100)}%
                      </span>
                      <p className="text-[10px] text-slate-500">mastery</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Daily Activity History & AI Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Activity Breakdown */}
        <div className="lg:col-span-7 rounded-2xl border border-[#1e293b] bg-slate-900/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-sky-400" />
            <h2 className="text-base font-bold text-white tracking-tight">
              Activity History
            </h2>
          </div>

          {overall_trend && overall_trend.length > 0 ? (
            <div className="space-y-2">
              <div className="grid grid-cols-4 text-[11px] font-mono text-slate-500 pb-2 border-b border-[#1e293b]">
                <span>Date</span>
                <span>Events</span>
                <span>Quizzes</span>
                <span>Tutor Turns</span>
              </div>
              {overall_trend.slice(-7).reverse().map((day) => (
                <div
                  key={day.date}
                  className="grid grid-cols-4 text-xs py-2 border-b border-[#1e293b]/40 text-slate-300 items-center"
                >
                  <span className="font-mono text-[11px] text-slate-400">{day.date}</span>
                  <span className="font-semibold text-white">{day.event_count}</span>
                  <span className="text-emerald-400 font-mono">
                    {day.event_breakdown?.["quiz_completed"] ?? day.event_breakdown?.["quiz_attempt"] ?? 0}
                  </span>
                  <span className="text-indigo-400 font-mono">
                    {day.event_breakdown?.["tutor_turn"] ?? day.event_breakdown?.["tutor_chat"] ?? 0}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-slate-500 text-xs">
              No daily telemetry available yet. Complete quizzes or chat with the AI tutor to see trend history.
            </div>
          )}
        </div>

        {/* AI Observability Telemetry */}
        <div className="lg:col-span-5 rounded-2xl border border-[#1e293b] bg-slate-900/50 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-indigo-400" />
              <h2 className="text-base font-bold text-white tracking-tight">
                AI Telemetry
              </h2>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950/60 border border-[#1e293b]/70 flex justify-between items-center">
                <span className="text-slate-400">Total AI Calls</span>
                <span className="text-sm font-bold text-white font-mono">
                  {ai_usage_summary?.total_calls ?? 0}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-[#1e293b]/70 flex justify-between items-center">
                <span className="text-slate-400">Total Tokens Processed</span>
                <span className="text-sm font-bold text-indigo-300 font-mono">
                  {(ai_usage_summary?.total_tokens ?? 0).toLocaleString()}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-[#1e293b]/70 flex justify-between items-center">
                <span className="text-slate-400">Grounded Citations</span>
                <span className="text-sm font-bold text-emerald-300 font-mono">
                  pgvector Verified
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-[#1e293b] text-[11px] text-slate-500 flex items-center justify-between">
            <span>Powered by Gemini &amp; pgvector</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
};
