import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Folder,
  FolderKanban,
  FolderPlus,
  Layers,
  Loader2,
  Plus,
  Search,
} from "lucide-react";
import { createSpaceApi, getGlobalAnalyticsApi, listSpacesApi } from "@/lib/api";
import { ProjectProgressItem, Space } from "@/types";

export const SpacesPage: React.FC = () => {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [recentProjects, setRecentProjects] = useState<ProjectProgressItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Space Form Modal State
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchSpacesAndProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const [spacesData, analyticsData] = await Promise.all([
        listSpacesApi(),
        getGlobalAnalyticsApi().catch(() => null),
      ]);
      setSpaces(spacesData);
      setRecentProjects(analyticsData?.projects_by_progress || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load spaces";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSpacesAndProjects();
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
      await fetchSpacesAndProjects();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create space";
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  };

  const filteredSpaces = spaces.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return s.name.toLowerCase().includes(q) || (s.description && s.description.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-10">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2 text-accent text-xs font-mono font-semibold uppercase tracking-wider mb-1">
            <FolderKanban className="w-4 h-4" />
            <span>Knowledge Architecture</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
            Learning Spaces
          </h1>
          <p className="text-xs sm:text-sm text-text-secondary mt-1">
            Broad learning domains containing focused study projects.
          </p>
        </div>

        <div className="flex items-center gap-3 self-stretch sm:self-auto">
          {/* Search Spaces Input */}
          <div className="relative flex-1 sm:w-60">
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search spaces..."
              className="w-full pl-8 pr-3 py-2 text-xs bg-surface border border-border rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-all shadow-sm"
            />
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors shadow-sm whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Space</span>
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <Loader2 className="w-8 h-8 animate-spin text-accent mb-3" />
          <p className="text-sm">Loading your spaces...</p>
        </div>
      ) : spaces.length === 0 ? (
        /* Empty state */
        <div className="rounded-2xl border border-dashed border-border bg-surface-muted/40 p-12 text-center max-w-lg mx-auto my-8">
          <div className="inline-flex p-4 bg-accent/10 text-accent border border-accent/20 rounded-2xl mb-4">
            <FolderPlus className="w-10 h-10" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary">No learning spaces yet</h3>
          <p className="text-xs text-text-muted mt-2 leading-relaxed">
            A Space represents a broad knowledge area (e.g. Machine Learning, Distributed Systems, Biology).
            Create your first space to start organizing study projects.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Create Your First Space</span>
          </button>
        </div>
      ) : (
        /* Spaces Section */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold font-mono uppercase tracking-wider text-text-muted">
              Available Spaces ({filteredSpaces.length})
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredSpaces.map((space) => (
              <Link
                key={space.id}
                to={`/spaces/${space.id}`}
                className="group rounded-2xl border border-border bg-surface p-5 hover:border-accent/40 hover:bg-surface-muted/40 shadow-sm transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2.5 rounded-xl bg-accent/15 text-accent border border-accent/25 group-hover:scale-105 transition-transform">
                      <Folder className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-mono text-text-muted flex items-center gap-1.5 bg-surface-muted px-2.5 py-1 rounded-full border border-border">
                      <Layers className="w-3 h-3 text-accent" />
                      {space.projects_count} {space.projects_count === 1 ? "project" : "projects"}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-text-primary group-hover:text-accent transition-colors">
                    {space.name}
                  </h3>
                  <p className="text-xs text-text-muted mt-1.5 line-clamp-2 leading-relaxed">
                    {space.description || "No description provided."}
                  </p>
                </div>

                <div className="mt-5 pt-3.5 border-t border-border flex items-center justify-between text-xs text-accent font-semibold">
                  <span>View Projects</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* RECENT PROJECTS SECTION                                              */}
      {/* ==================================================================== */}
      {recentProjects.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-border">
          <div>
            <h2 className="text-lg font-bold text-text-primary tracking-tight">
              Recent Projects
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Focused learning journeys with dedicated materials, AI tutoring, and quizzes
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {recentProjects.map((p) => {
              const mastery = p.average_mastery !== null ? Math.round(p.average_mastery) : null;
              return (
                <Link
                  key={p.project_id}
                  to={`/projects/${p.project_id}`}
                  className="group rounded-2xl border border-border bg-surface p-5 hover:border-accent/40 hover:bg-surface-muted/40 shadow-sm transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono text-accent uppercase tracking-wider font-semibold">
                        {p.space_name}
                      </span>
                      {mastery !== null && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-accent-soft text-accent border border-accent/20 font-semibold">
                          {mastery}% mastery
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-text-primary group-hover:text-accent transition-colors">
                      {p.project_name}
                    </h3>
                    {p.learning_goal && (
                      <p className="text-xs text-text-muted mt-1 line-clamp-2">
                        {p.learning_goal}
                      </p>
                    )}

                    <div className="mt-3 flex items-center gap-3 text-[11px] text-text-muted">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        {p.assessed_concepts} / {p.total_concepts} concepts assessed
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-border flex items-center justify-between text-xs text-accent font-semibold">
                    <span>Continue Learning</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Space Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-text-primary">Create Learning Space</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-text-muted hover:text-text-primary text-sm p-1 rounded-lg hover:bg-surface-muted transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateSpace} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Space Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Machine Learning"
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-muted border border-border text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Description (Optional)</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What broad knowledge area does this space cover?"
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-muted border border-border text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-accent resize-none transition-colors"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl border border-border text-text-muted hover:text-text-primary hover:bg-surface-muted text-xs font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-sm transition-colors"
                >
                  {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Create Space</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
