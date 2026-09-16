/**
 * GrowthTab — Phase 5 Concept Mastery, Growth Analysis & Recommendations
 *
 * Features:
 * - Current mastery estimate bars per concept with confidence level indicators
 * - Trajectory classification: Improving / Stable / Needs Attention / Unassessed
 * - Interactive historical timeline sparkline/chart per concept
 * - Active recommendation banner with "Why am I seeing this?" reasoning
 */

import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Award,
  Clock,
  Layers,
  LineChart,
  Loader2,
  Minus,
  RefreshCw,
  Target,
} from "lucide-react";
import {
  getProjectGrowthApi,
  getProjectMasteryApi,
  getProjectRecommendationsApi,
} from "@/lib/api";
import type {
  ConfidenceLevel,
  GrowthStatus,
  GrowthSummary,
  MasteryListResponse,
  Recommendation,
} from "@/types";
import { RecommendationCard } from "./RecommendationCard";

interface GrowthTabProps {
  projectId: string;
}

export const GrowthTab: React.FC<GrowthTabProps> = ({ projectId }) => {
  const [masteryData, setMasteryData] = useState<MasteryListResponse | null>(null);
  const [growthData, setGrowthData] = useState<GrowthSummary | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [mRes, gRes, rRes] = await Promise.all([
        getProjectMasteryApi(projectId),
        getProjectGrowthApi(projectId),
        getProjectRecommendationsApi(projectId),
      ]);
      setMasteryData(mRes);
      setGrowthData(gRes);
      setRecommendations(rRes);
      if (mRes.masteries.length > 0) {
        setSelectedConceptId(mRes.masteries[0].concept_id);
      }
    } catch (err: any) {
      console.error("Failed to load growth data:", err);
      setError(err.message || "Failed to load mastery data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  const handleDismissRec = (recId: string) => {
    setRecommendations((prev) => prev.filter((r) => r.id !== recId));
  };

  // Confidence pill helper
  const renderConfidenceBadge = (level: ConfidenceLevel, evidenceCount: number) => {
    switch (level) {
      case "high":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-700/60">
            High Confidence ({evidenceCount} answers)
          </span>
        );
      case "medium":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-950/60 text-blue-300 border border-blue-700/60">
            Medium Confidence ({evidenceCount} answers)
          </span>
        );
      case "low":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/60 text-amber-300 border border-amber-700/60">
            Low Confidence ({evidenceCount} answers)
          </span>
        );
      case "unassessed":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            Unassessed (0 answers)
          </span>
        );
    }
  };

  // Trajectory icon helper
  const renderTrajectoryBadge = (status: GrowthStatus, delta: number) => {
    switch (status) {
      case "improving":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-900/40 text-emerald-400 border border-emerald-700/50">
            <ArrowUpRight className="w-3.5 h-3.5" />
            Improving (+{delta}%)
          </span>
        );
      case "needs_attention":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-rose-900/40 text-rose-400 border border-rose-700/50">
            <AlertCircle className="w-3.5 h-3.5" />
            Needs Attention {delta !== 0 ? `(${delta}%)` : ""}
          </span>
        );
      case "stable":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            <Minus className="w-3.5 h-3.5" />
            Stable {delta !== 0 ? `(${delta > 0 ? "+" : ""}${delta}%)` : ""}
          </span>
        );
      case "unassessed":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-slate-800/80 text-slate-400 border border-slate-700/60">
            Unassessed
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
        <p className="text-sm">Calculating concept mastery and growth trajectories...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-900/60 bg-rose-950/20 p-6 text-center">
        <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
        <h4 className="text-base font-semibold text-rose-200">Unable to Load Mastery Data</h4>
        <p className="text-sm text-rose-300/80 mt-1">{error}</p>
        <button
          onClick={loadData}
          className="mt-4 px-4 py-2 rounded-lg bg-rose-900/50 hover:bg-rose-900/80 text-rose-200 text-xs font-medium transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  const allGrowthItems = [
    ...(growthData?.improving || []),
    ...(growthData?.stable || []),
    ...(growthData?.needs_attention || []),
    ...(growthData?.unassessed || []),
  ];

  const selectedGrowth = allGrowthItems.find((g) => g.concept_id === selectedConceptId);

  return (
    <div className="space-y-6">
      {/* 1. Header & Active Recommendations Banner */}
      <div className="flex flex-col gap-4">
        {recommendations.length > 0 && (
          <div className="space-y-3">
            {recommendations.map((rec) => (
              <RecommendationCard
                key={rec.id}
                recommendation={rec}
                projectId={projectId}
                onDismiss={handleDismissRec}
              />
            ))}
          </div>
        )}

        {/* 2. Top Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Average Mastery
              </span>
              <Award className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-100">
                {masteryData?.overall_average_mastery !== null &&
                masteryData?.overall_average_mastery !== undefined
                  ? `${masteryData.overall_average_mastery}%`
                  : "—"}
              </span>
              <span className="text-xs text-slate-400">across assessed</span>
            </div>
            <div className="mt-3 w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-500"
                style={{
                  width: `${masteryData?.overall_average_mastery || 0}%`,
                }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Assessed Concepts
              </span>
              <Layers className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-100">
                {masteryData?.assessed_count ?? 0}
              </span>
              <span className="text-xs text-slate-400">
                of {masteryData?.total_concepts ?? 0} total
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {masteryData?.total_concepts
                ? `${Math.round(
                    ((masteryData.assessed_count || 0) / masteryData.total_concepts) * 100
                  )}% concept coverage`
                : "No concepts extracted yet"}
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Needs Attention
              </span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-amber-300">
                {growthData?.needs_attention.length ?? 0}
              </span>
              <span className="text-xs text-slate-400">weak or declining</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {growthData?.improving.length ?? 0} concepts improving
            </p>
          </div>
        </div>
      </div>

      {/* 3. Main Split View: Concept Mastery List + Historical Trend Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Concept Mastery Cards List (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Target className="w-4 h-4 text-indigo-400" />
              Concepts &amp; Mastery Levels
            </h3>
            <button
              onClick={loadData}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>

          {(!masteryData?.masteries || masteryData.masteries.length === 0) && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-slate-400">
              <p className="text-sm">No concepts found for this project.</p>
              <p className="text-xs text-slate-500 mt-1">
                Upload course materials and generate a quiz to start building your mastery profile.
              </p>
            </div>
          )}

          {masteryData?.masteries.map((m) => {
            const growth = allGrowthItems.find((g) => g.concept_id === m.concept_id);
            const isSelected = m.concept_id === selectedConceptId;

            return (
              <div
                key={m.concept_id}
                onClick={() => setSelectedConceptId(m.concept_id)}
                className={`cursor-pointer rounded-xl border p-4 transition-all duration-200 ${
                  isSelected
                    ? "border-indigo-500/80 bg-slate-900/90 shadow-md shadow-indigo-950/30"
                    : "border-slate-800/80 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                      {m.concept_name}
                      {isSelected && (
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                      )}
                    </h4>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {renderConfidenceBadge(m.confidence_level, m.evidence_count)}
                      {growth && renderTrajectoryBadge(growth.status, growth.delta)}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xl font-bold text-slate-100">
                      {m.mastery_score !== null ? `${m.mastery_score}%` : "—"}
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {m.is_assessed ? "Mastery" : "Unassessed"}
                    </span>
                  </div>
                </div>

                {/* Mastery Bar */}
                <div className="mt-3 w-full bg-slate-800/80 h-2 rounded-full overflow-hidden">
                  {m.mastery_score !== null ? (
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        m.mastery_score >= 70
                          ? "bg-emerald-500"
                          : m.mastery_score >= 50
                          ? "bg-indigo-500"
                          : "bg-amber-500"
                      }`}
                      style={{ width: `${m.mastery_score}%` }}
                    />
                  ) : (
                    <div className="h-full w-full border-b border-dashed border-slate-700" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Historical Trend & Trajectory View (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm sticky top-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <LineChart className="w-4 h-4 text-purple-400" />
                Growth Trajectory
              </h3>
              {selectedGrowth && (
                <span className="text-xs text-slate-400">
                  {selectedGrowth.history.length} snapshots
                </span>
              )}
            </div>

            {selectedGrowth ? (
              <div className="mt-4 space-y-5">
                <div>
                  <h4 className="text-base font-bold text-slate-100">
                    {selectedGrowth.concept_name}
                  </h4>
                  <div className="mt-1 flex items-center gap-2">
                    {renderTrajectoryBadge(selectedGrowth.status, selectedGrowth.delta)}
                  </div>
                </div>

                {/* Score Evolution Summary */}
                <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <div>
                    <span className="text-[11px] text-slate-400 block uppercase tracking-wider">
                      Baseline Score
                    </span>
                    <span className="text-lg font-semibold text-slate-300">
                      {selectedGrowth.baseline_score !== null
                        ? `${selectedGrowth.baseline_score}%`
                        : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block uppercase tracking-wider">
                      Current Mastery
                    </span>
                    <span className="text-lg font-bold text-indigo-300">
                      {selectedGrowth.current_score !== null
                        ? `${selectedGrowth.current_score}%`
                        : "—"}
                    </span>
                  </div>
                </div>

                {/* SVG Trend Sparkline */}
                <div>
                  <span className="text-xs font-medium text-slate-400 block mb-2">
                    Snapshot Timeline
                  </span>

                  {selectedGrowth.history.length >= 2 ? (
                    <div className="rounded-lg bg-slate-950/80 border border-slate-800/90 p-4">
                      <div className="h-36 w-full flex items-end justify-between gap-1 relative pt-4">
                        {/* 50% threshold line */}
                        <div
                          className="absolute w-full border-b border-dashed border-slate-800"
                          style={{ bottom: "50%" }}
                        />

                        {selectedGrowth.history.map((pt, idx) => {
                          const heightPct = Math.max(5, Math.min(100, pt.score));
                          const isLatest = idx === selectedGrowth.history.length - 1;
                          return (
                            <div
                              key={idx}
                              className="flex-1 flex flex-col items-center justify-end h-full group relative"
                            >
                              {/* Hover Tooltip */}
                              <div className="absolute -top-7 hidden group-hover:flex items-center px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-200 font-medium z-10 whitespace-nowrap shadow-md">
                                {pt.score}%
                              </div>
                              <div
                                className={`w-full max-w-[18px] rounded-t transition-all duration-300 ${
                                  isLatest
                                    ? "bg-indigo-500 shadow-sm shadow-indigo-500/50"
                                    : "bg-slate-700 group-hover:bg-slate-600"
                                }`}
                                style={{ height: `${heightPct}%` }}
                              />
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 border-t border-slate-800/80 pt-2">
                        <span>First Attempt</span>
                        <span>Latest Snapshot</span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg bg-slate-950/40 border border-slate-800/60 p-6 text-center text-slate-500 text-xs">
                      <Clock className="w-5 h-5 mx-auto mb-1.5 text-slate-600" />
                      Take more quizzes covering this concept to generate a growth trend curve.
                    </div>
                  )}
                </div>

                <div className="text-xs text-slate-400 bg-slate-950/40 p-3 rounded-lg border border-slate-800/60 leading-relaxed">
                  <span className="font-semibold text-slate-300 block mb-1">
                    Pedagogical Note:
                  </span>
                  Mastery is calculated deterministically with recency weighting and question
                  difficulty multipliers. Higher confidence levels require sustained, repeated
                  practice.
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500 text-sm">
                Select a concept from the list to view its growth trend.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
