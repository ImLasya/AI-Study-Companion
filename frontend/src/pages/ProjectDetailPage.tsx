import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  Bot,
  HelpCircle,
  TrendingUp,
  BarChart3,
  Loader2,
  Target,
  Sparkles,
} from "lucide-react";
import { getProjectApi } from "@/lib/api";
import { Project } from "@/types";

type TabKey = "materials" | "tutor" | "quiz" | "growth" | "analytics";

const tabs: { key: TabKey; label: string; icon: React.FC<{ className?: string }> }[] = [
  { key: "materials", label: "Materials", icon: FileText },
  { key: "tutor", label: "AI Tutor", icon: Bot },
  { key: "quiz", label: "Adaptive Quiz", icon: HelpCircle },
  { key: "growth", label: "Growth", icon: TrendingUp },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
];

export const ProjectDetailPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("materials");

  useEffect(() => {
    if (!projectId) return;
    const fetchProject = async () => {
      try {
        setLoading(true);
        const data = await getProjectApi(projectId);
        setProject(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load project";
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
        <p className="text-sm">Loading project workspace...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="max-w-md mx-auto my-16 text-center">
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs mb-4">
          {error || "Project not found"}
        </div>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Project Header */}
      <div>
        <Link
          to={`/spaces/${project.space_id}`}
          className="inline-flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Space</span>
        </Link>

        <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-400 font-bold">
                Active Project
              </span>
              <h1 className="text-2xl font-bold text-white tracking-tight mt-0.5">
                {project.name}
              </h1>
              {project.description && (
                <p className="text-xs text-gray-400 mt-1">{project.description}</p>
              )}
            </div>

            {/* Learning Goal card */}
            <div className="p-3.5 rounded-xl bg-gray-950 border border-gray-800 max-w-md">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-400 mb-1">
                <Target className="w-4 h-4" />
                Learning Goal
              </div>
              <p className="text-xs text-gray-300 italic">"{project.learning_goal}"</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="border-b border-gray-800 flex items-center gap-2 overflow-x-auto pb-px">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? "border-indigo-500 text-indigo-400 font-semibold"
                  : "border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Contents (Placeholders for upcoming phases) */}
      <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-950/40 p-12 text-center min-h-[300px] flex flex-col items-center justify-center">
        {activeTab === "materials" && (
          <div className="max-w-md">
            <div className="p-3.5 rounded-2xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 inline-flex mb-4">
              <FileText className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-white">Learning Materials (PDF Ingestion)</h3>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              Upload PDF textbooks, lecture slides, and notes. The background Celery worker will asynchronously extract text, parse page structure, and generate pgvector embeddings in Phase 2.
            </p>
            <span className="inline-flex items-center gap-1 mt-4 px-2.5 py-1 rounded-full text-[11px] font-mono text-indigo-400 bg-indigo-500/10 border border-indigo-500/20">
              <Sparkles className="w-3 h-3" /> Scheduled for Phase 2
            </span>
          </div>
        )}

        {activeTab === "tutor" && (
          <div className="max-w-md">
            <div className="p-3.5 rounded-2xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 inline-flex mb-4">
              <Bot className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-white">AI Tutor Workspace</h3>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              Interactive grounded tutoring grounded strictly in project materials with page citations and unsupported-question handling in Phase 3.
            </p>
            <span className="inline-flex items-center gap-1 mt-4 px-2.5 py-1 rounded-full text-[11px] font-mono text-indigo-400 bg-indigo-500/10 border border-indigo-500/20">
              <Sparkles className="w-3 h-3" /> Scheduled for Phase 3
            </span>
          </div>
        )}

        {activeTab === "quiz" && (
          <div className="max-w-md">
            <div className="p-3.5 rounded-2xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 inline-flex mb-4">
              <HelpCircle className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-white">Adaptive Quizzes & Assessment</h3>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              Targeted multiple-choice and open-ended questions designed to test knowledge gaps, scored by the AI assessment engine in Phase 4.
            </p>
            <span className="inline-flex items-center gap-1 mt-4 px-2.5 py-1 rounded-full text-[11px] font-mono text-indigo-400 bg-indigo-500/10 border border-indigo-500/20">
              <Sparkles className="w-3 h-3" /> Scheduled for Phase 4
            </span>
          </div>
        )}

        {activeTab === "growth" && (
          <div className="max-w-md">
            <div className="p-3.5 rounded-2xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 inline-flex mb-4">
              <TrendingUp className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-white">Concept Mastery & Growth Analysis</h3>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              Track mastery probability percentages across project concepts, classifying topics as Improving, Stable, or Requiring Attention in Phase 4.
            </p>
            <span className="inline-flex items-center gap-1 mt-4 px-2.5 py-1 rounded-full text-[11px] font-mono text-indigo-400 bg-indigo-500/10 border border-indigo-500/20">
              <Sparkles className="w-3 h-3" /> Scheduled for Phase 4
            </span>
          </div>
        )}

        {activeTab === "analytics" && (
          <div className="max-w-md">
            <div className="p-3.5 rounded-2xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 inline-flex mb-4">
              <BarChart3 className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-white">Project Learning Analytics</h3>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              Study habits, quiz retention trends, token usage observability, and targeted next-step recommendations in Phase 5.
            </p>
            <span className="inline-flex items-center gap-1 mt-4 px-2.5 py-1 rounded-full text-[11px] font-mono text-indigo-400 bg-indigo-500/10 border border-indigo-500/20">
              <Sparkles className="w-3 h-3" /> Scheduled for Phase 5
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
