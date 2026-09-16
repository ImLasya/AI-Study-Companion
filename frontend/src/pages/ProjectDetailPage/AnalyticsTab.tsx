import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  Brain,
  Calendar,
  CheckCircle2,
  Clock,
  Coins,
  Cpu,
  HelpCircle,
  Loader2,
  MessageSquare,
  Sparkles,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { getProjectAnalyticsApi } from "@/lib/api";
import { ProjectAnalyticsResponse } from "@/types";

interface AnalyticsTabProps {
  projectId: string;
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ projectId }) => {
  const [data, setData] = useState<ProjectAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getProjectAnalyticsApi(projectId);
      setData(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load analytics";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [projectId]);

  if (loading) {
    return (
      <div className="min-h-[350px] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <span className="text-xs text-gray-400 font-medium">Aggregating project learning telemetry...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-rose-900/40 bg-rose-950/20 p-8 text-center flex flex-col items-center">
        <AlertCircle className="w-8 h-8 text-rose-400 mb-2" />
        <p className="text-sm font-semibold text-rose-200">Unable to load project analytics</p>
        <p className="text-xs text-rose-400/80 mt-1 max-w-sm">{error || "No data returned"}</p>
        <button
          onClick={fetchAnalytics}
          className="mt-4 px-3 py-1.5 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 text-xs font-medium border border-rose-500/30 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  const {
    learning_activity,
    quiz_performance_trend,
    current_mastery_distribution,
    concept_trends,
    tutor_interaction_counts,
    ai_activity,
  } = data;

  const totalEvents = learning_activity.reduce((acc, curr) => acc + curr.event_count, 0);

  return (
    <div className="space-y-8">
      {/* 1. Metric Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Activity */}
        <div className="p-5 rounded-2xl bg-gray-900/40 border border-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">Total Activity</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight mt-3">{totalEvents}</div>
          <div className="text-[11px] text-gray-500 mt-1">Logged study actions (30 days)</div>
        </div>

        {/* Overall Mastery */}
        <div className="p-5 rounded-2xl bg-gray-900/40 border border-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">Average Mastery</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight mt-3">
            {current_mastery_distribution.overall_average !== null
              ? `${current_mastery_distribution.overall_average}%`
              : "N/A"}
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            {current_mastery_distribution.mastered} Mastered &bull; {current_mastery_distribution.needs_attention} Needs Attention
          </div>
        </div>

        {/* Quiz Performance */}
        <div className="p-5 rounded-2xl bg-gray-900/40 border border-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">Quizzes Completed</span>
            <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight mt-3">
            {quiz_performance_trend.length}
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            {quiz_performance_trend.filter((q) => q.passed).length} Passed (≥70%)
          </div>
        </div>

        {/* AI Telemetry */}
        <div className="p-5 rounded-2xl bg-gray-900/40 border border-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">AI Compute Telemetry</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight mt-3">
            {ai_activity.total_calls}
          </div>
          <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-2">
            <span>{ai_activity.total_tokens.toLocaleString()} tokens</span>
            <span>&bull;</span>
            <span className="text-amber-400 font-mono">${ai_activity.total_estimated_cost_usd.toFixed(4)}</span>
          </div>
        </div>
      </div>

      {/* 2. Mastery Distribution Breakdown */}
      <div className="p-6 rounded-2xl bg-gray-900/40 border border-gray-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <Brain className="w-4 h-4 text-indigo-400" />
              Concept Mastery Distribution
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Breakdown of conceptual understanding across project materials
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> {current_mastery_distribution.mastered} Mastered (≥70%)
            </span>
            <span className="flex items-center gap-1 text-sky-400">
              <span className="w-2 h-2 rounded-full bg-sky-400" /> {current_mastery_distribution.stable} Stable (50-70%)
            </span>
            <span className="flex items-center gap-1 text-amber-400">
              <span className="w-2 h-2 rounded-full bg-amber-400" /> {current_mastery_distribution.needs_attention} Needs Attention (&lt;50%)
            </span>
            <span className="flex items-center gap-1 text-gray-500">
              <span className="w-2 h-2 rounded-full bg-gray-600" /> {current_mastery_distribution.unassessed} Unassessed
            </span>
          </div>
        </div>

        {/* Progress Bar Segment */}
        {concept_trends.length > 0 ? (
          <div className="w-full h-3 rounded-full bg-gray-800 overflow-hidden flex">
            {current_mastery_distribution.mastered > 0 && (
              <div
                style={{ width: `${(current_mastery_distribution.mastered / concept_trends.length) * 100}%` }}
                className="bg-emerald-500 h-full"
                title={`${current_mastery_distribution.mastered} Mastered`}
              />
            )}
            {current_mastery_distribution.stable > 0 && (
              <div
                style={{ width: `${(current_mastery_distribution.stable / concept_trends.length) * 100}%` }}
                className="bg-sky-500 h-full"
                title={`${current_mastery_distribution.stable} Stable`}
              />
            )}
            {current_mastery_distribution.needs_attention > 0 && (
              <div
                style={{ width: `${(current_mastery_distribution.needs_attention / concept_trends.length) * 100}%` }}
                className="bg-amber-500 h-full"
                title={`${current_mastery_distribution.needs_attention} Needs Attention`}
              />
            )}
            {current_mastery_distribution.unassessed > 0 && (
              <div
                style={{ width: `${(current_mastery_distribution.unassessed / concept_trends.length) * 100}%` }}
                className="bg-gray-700 h-full"
                title={`${current_mastery_distribution.unassessed} Unassessed`}
              />
            )}
          </div>
        ) : (
          <div className="text-center py-6 text-xs text-gray-500">No concepts extracted yet. Upload learning materials to begin.</div>
        )}
      </div>

      {/* 3. Split View: Learning Activity vs Quiz Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Learning Activity Over Time */}
        <div className="p-6 rounded-2xl bg-gray-900/40 border border-gray-800 flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-gray-800/80 mb-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" />
              Activity Over Time (Daily Buckets)
            </h4>
            <span className="text-[11px] text-gray-500 font-mono">Past 30 Days</span>
          </div>

          {learning_activity.length > 0 ? (
            <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
              {learning_activity.map((b) => (
                <div
                  key={b.date}
                  className="flex items-center justify-between p-3 rounded-xl bg-gray-950/40 border border-gray-800/60 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-gray-300 font-medium">{b.date}</span>
                    <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 text-[10px] font-mono font-semibold">
                      {b.event_count} {b.event_count === 1 ? "event" : "events"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {Object.entries(b.event_breakdown).map(([type, cnt]) => (
                      <span
                        key={type}
                        className="px-1.5 py-0.5 rounded bg-gray-800 text-[10px] text-gray-400 font-mono"
                      >
                        {type.replace("_", " ")}: {cnt}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-xs text-gray-500">
              <Activity className="w-8 h-8 text-gray-600 mb-2" />
              No study activity logged yet in this project.
            </div>
          )}
        </div>

        {/* Quiz Performance Trend */}
        <div className="p-6 rounded-2xl bg-gray-900/40 border border-gray-800 flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-gray-800/80 mb-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-violet-400" />
              Quiz Performance Trend
            </h4>
            <span className="text-[11px] text-gray-500 font-mono">Recent Attempts</span>
          </div>

          {quiz_performance_trend.length > 0 ? (
            <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
              {quiz_performance_trend.map((q, idx) => (
                <div
                  key={q.attempt_id}
                  className="flex items-center justify-between p-3 rounded-xl bg-gray-950/40 border border-gray-800/60 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-gray-500 text-[11px]">#{idx + 1}</span>
                    <div>
                      <div className="font-semibold text-white">{q.score_percentage}%</div>
                      <div className="text-[10px] text-gray-400">
                        {q.completed_at ? new Date(q.completed_at).toLocaleDateString() : "Completed"} &bull; {q.total_questions} questions
                      </div>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold flex items-center gap-1 ${
                      q.passed
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    }`}
                  >
                    {q.passed ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {q.passed ? "Passed" : "Needs Review"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-xs text-gray-500">
              <HelpCircle className="w-8 h-8 text-gray-600 mb-2" />
              No quiz attempts completed yet. Generate a quiz in the Quiz tab to evaluate your knowledge!
            </div>
          )}
        </div>
      </div>

      {/* 4. Concepts Detail & Telemetry Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Concept Trends List */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-gray-900/40 border border-gray-800">
          <div className="flex items-center justify-between pb-4 border-b border-gray-800/80 mb-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              Concept Mastery Trajectory
            </h4>
            <span className="text-[11px] text-gray-500 font-mono">{concept_trends.length} Total Concepts</span>
          </div>

          {concept_trends.length > 0 ? (
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {concept_trends.map((c) => (
                <div
                  key={c.concept_id}
                  className="flex items-center justify-between p-3 rounded-xl bg-gray-950/40 border border-gray-800/60 text-xs"
                >
                  <div className="min-w-0 pr-3">
                    <div className="font-medium text-white truncate">{c.concept_name}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      Confidence: {(c.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="font-bold text-white font-mono">
                        {c.latest_score !== null ? `${c.latest_score}%` : "Unassessed"}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold ${
                        c.status === "mastered"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : c.status === "stable"
                          ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                          : c.status === "needs_attention"
                          ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          : "bg-gray-800 text-gray-400 border border-gray-700"
                      }`}
                    >
                      {c.status.replace("_", " ")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-xs text-gray-500">No concept trajectory records.</div>
          )}
        </div>

        {/* AI & Tutor Details */}
        <div className="space-y-6">
          {/* Tutor Summary */}
          <div className="p-5 rounded-2xl bg-gray-900/40 border border-gray-800 space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider text-gray-400 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-indigo-400" />
              Tutor Interactions
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-gray-800/60">
                <span className="text-gray-400">Conversations</span>
                <span className="font-mono text-white font-semibold">{tutor_interaction_counts.total_conversations}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-800/60">
                <span className="text-gray-400">Messages Exchanged</span>
                <span className="font-mono text-white font-semibold">{tutor_interaction_counts.total_messages}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-400">Grounded Answers</span>
                <span className="font-mono text-emerald-400 font-semibold">{tutor_interaction_counts.assistant_messages}</span>
              </div>
            </div>
          </div>

          {/* AI Operation Breakdown */}
          <div className="p-5 rounded-2xl bg-gray-900/40 border border-gray-800 space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider text-gray-400 flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-400" />
              AI Calls by Feature
            </h4>
            {Object.keys(ai_activity.calls_by_operation).length > 0 ? (
              <div className="space-y-2 text-xs">
                {Object.entries(ai_activity.calls_by_operation).map(([op, cnt]) => (
                  <div key={op} className="flex justify-between py-1 border-b border-gray-800/60 last:border-0">
                    <span className="text-gray-400 font-mono text-[11px]">{op}</span>
                    <span className="font-mono text-white font-semibold">{cnt}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 text-[11px] text-gray-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Avg Latency
                  </span>
                  <span className="font-mono text-gray-300">{ai_activity.avg_latency_ms} ms</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-xs text-gray-500">No AI operations executed yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
