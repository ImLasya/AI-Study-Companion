import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Award,
  CheckCircle2,
  Folder,
  FolderPlus,
  Layers,
  Loader2,
  Plus,
  Sparkles,
} from "lucide-react";
import { createSpaceApi, getGlobalAnalyticsApi, listSpacesApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { GlobalAnalyticsResponse, Space } from "@/types";

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<GlobalAnalyticsResponse | null>(null);

  // New Space Form Modal State
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchSpaces = async () => {
    try {
      setLoading(true);
      const [spacesData, analyticsData] = await Promise.all([
        listSpacesApi(),
        getGlobalAnalyticsApi().catch(() => null),
      ]);
      setSpaces(spacesData);
      setAnalytics(analyticsData);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load spaces";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSpaces();
  }, []);

  const handleCreateSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);

    try {
      await createSpaceApi({ name, description: description.trim() || undefined });
      setName("");
      setDescription("");
      setShowModal(false);
      await fetchSpaces();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create space";
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Learning Spaces
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Welcome, <span className="text-indigo-400 font-medium">{user?.full_name || user?.email}</span>. Manage your knowledge domains and active study projects.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Create Space
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* Global Learning Pulse (Phase 6 Analytics) */}
      {analytics && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-[11px] font-medium uppercase tracking-wider">Active Projects</span>
              <Folder className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="mt-2 text-xl font-bold text-white font-mono">
              {analytics.projects_by_progress.length}
            </div>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-[11px] font-medium uppercase tracking-wider">Quizzes</span>
              <Award className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="mt-2 text-xl font-bold text-emerald-400 font-mono">
              {analytics.total_study_activity.total_quizzes_completed}
            </div>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-[11px] font-medium uppercase tracking-wider">Tutor Chats</span>
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="mt-2 text-xl font-bold text-white font-mono">
              {analytics.total_study_activity.total_tutor_conversations}
            </div>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-[11px] font-medium uppercase tracking-wider">Study Days</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="mt-2 text-xl font-bold text-purple-300 font-mono">
              {analytics.total_study_activity.active_study_days}
            </div>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-[11px] font-medium uppercase tracking-wider">Study Events</span>
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="mt-2 text-xl font-bold text-cyan-300 font-mono">
              {analytics.total_study_activity.total_events}
            </div>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-[11px] font-medium uppercase tracking-wider">AI Calls</span>
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="mt-2 text-xl font-bold text-amber-300 font-mono">
              {analytics.ai_usage_summary.total_calls}
            </div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
          <p className="text-sm">Loading your spaces...</p>
        </div>
      ) : spaces.length === 0 ? (
        /* Empty state */
        <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-950/40 p-12 text-center max-w-lg mx-auto my-8">
          <div className="inline-flex p-4 bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 rounded-2xl mb-4">
            <FolderPlus className="w-10 h-10" />
          </div>
          <h3 className="text-lg font-semibold text-white">No learning spaces yet</h3>
          <p className="text-xs text-gray-400 mt-2 leading-relaxed">
            A Space represents a broad learning area (e.g. Machine Learning, Cloud Architecture, Spanish).
            Create your first space to organize your study projects.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Your First Space
          </button>
        </div>
      ) : (
        /* Spaces Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {spaces.map((space) => (
            <Link
              key={space.id}
              to={`/spaces/${space.id}`}
              className="group rounded-2xl border border-gray-800 bg-gray-900/60 p-6 hover:border-indigo-500/50 hover:bg-gray-900 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 rounded-xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 group-hover:scale-105 transition-transform">
                    <Folder className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-mono text-gray-500 flex items-center gap-1.5 bg-gray-950 px-2.5 py-1 rounded-full border border-gray-800">
                    <Layers className="w-3 h-3 text-indigo-400" />
                    {space.projects_count} {space.projects_count === 1 ? "project" : "projects"}
                  </span>
                </div>

                <h3 className="text-base font-bold text-white group-hover:text-indigo-400 transition-colors">
                  {space.name}
                </h3>
                <p className="text-xs text-gray-400 mt-2 line-clamp-2">
                  {space.description || "No description provided."}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-800/80 flex items-center justify-between text-xs text-indigo-400 font-medium">
                <span>View projects</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Space Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6 sm:p-8 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Create Learning Space</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateSpace} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Space Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Distributed Systems"
                  className="w-full px-3.5 py-2 rounded-lg bg-gray-950 border border-gray-800 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Description (Optional)</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What knowledge domain does this space cover?"
                  className="w-full px-3.5 py-2 rounded-lg bg-gray-950 border border-gray-800 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg border border-gray-800 text-gray-400 hover:text-white text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                  {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Create Space
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
