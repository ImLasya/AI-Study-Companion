/**
 * RecommendationCard — Phase 5 Actionable Guidance Card
 *
 * Displays targeted next steps with transparent reasoning ("Why am I seeing this?")
 * and dismiss capabilities.
 */

import React, { useState } from "react";
import {
  BookOpen,
  Compass,
  HelpCircle,
  Lightbulb,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import type { Recommendation } from "@/types";
import { dismissRecommendationApi } from "@/lib/api";

interface RecommendationCardProps {
  recommendation: Recommendation;
  projectId: string;
  onDismiss?: (recId: string) => void;
  className?: string;
}

export const RecommendationCard: React.FC<RecommendationCardProps> = ({
  recommendation,
  projectId,
  onDismiss,
  className = "",
}) => {
  const [showReasoning, setShowReasoning] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  const handleDismiss = async () => {
    setIsDismissing(true);
    try {
      await dismissRecommendationApi(projectId, recommendation.id);
      if (onDismiss) {
        onDismiss(recommendation.id);
      }
    } catch (err) {
      console.error("Failed to dismiss recommendation:", err);
    } finally {
      setIsDismissing(false);
    }
  };

  // Type badge styling
  const getTypeBadge = (type: string) => {
    switch (type) {
      case "review_concept":
        return {
          label: "Review Concept",
          icon: <BookOpen className="w-3.5 h-3.5" />,
          color: "bg-purple-900/40 text-purple-300 border-purple-700/50",
        };
      case "practice_quiz":
        return {
          label: "Targeted Practice",
          icon: <Target className="w-3.5 h-3.5" />,
          color: "bg-blue-900/40 text-blue-300 border-blue-700/50",
        };
      case "study_material":
        return {
          label: "Study Source Material",
          icon: <Lightbulb className="w-3.5 h-3.5" />,
          color: "bg-amber-900/40 text-amber-300 border-amber-700/50",
        };
      case "explore_topic":
        return {
          label: "Explore New Topic",
          icon: <Compass className="w-3.5 h-3.5" />,
          color: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
        };
      default:
        return {
          label: "Suggested Action",
          icon: <Sparkles className="w-3.5 h-3.5" />,
          color: "bg-slate-800 text-slate-300 border-slate-700",
        };
    }
  };

  const badge = getTypeBadge(recommendation.recommendation_type);

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-slate-900/90 to-purple-950/30 p-5 shadow-lg shadow-indigo-950/20 backdrop-blur-sm transition-all ${className}`}
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${badge.color}`}
          >
            {badge.icon}
            {badge.label}
          </span>
          {recommendation.target_concept_name && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800/80 text-slate-300 border border-slate-700/60">
              <Target className="w-3 h-3 text-indigo-400" />
              {recommendation.target_concept_name}
            </span>
          )}
        </div>

        <button
          onClick={handleDismiss}
          disabled={isDismissing}
          className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800/60 transition-colors"
          title="Dismiss recommendation"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Title & Body */}
      <div className="mt-3">
        <h4 className="text-base font-semibold text-slate-100 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
          {recommendation.title}
        </h4>
        <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">
          {recommendation.body}
        </p>
      </div>

      {/* Reasoning Accordion ("Why am I seeing this?") */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-col gap-2">
        <button
          onClick={() => setShowReasoning(!showReasoning)}
          className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-medium self-start"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          {showReasoning ? "Hide reasoning" : "Why am I seeing this recommendation?"}
        </button>

        {showReasoning && (
          <div className="rounded-lg bg-slate-950/60 border border-slate-800/80 p-3 text-xs text-slate-300 leading-normal animate-in fade-in duration-200">
            <span className="font-semibold text-indigo-300 block mb-1">Diagnostic Rationale:</span>
            {recommendation.reasoning}
          </div>
        )}
      </div>
    </div>
  );
};
