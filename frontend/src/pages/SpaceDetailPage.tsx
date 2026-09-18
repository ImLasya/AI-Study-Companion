import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Folder,
  FolderPlus,
  Layers,
  Loader2,
  Plus,
  Target,
} from "lucide-react";
import { createProjectInSpaceApi, getSpaceApi, listProjectsInSpaceApi } from "@/lib/api";
import { Project, Space } from "@/types";

export const SpaceDetailPage: React.FC = () => {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();

  const [space, setSpace] = useState<Space | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create Project Modal State
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [learningGoal, setLearningGoal] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadData = async () => {
    if (!spaceId) return;
    try {
      setLoading(true);
      const [spaceData, projectsData] = await Promise.all([
        getSpaceApi(spaceId),
        listProjectsInSpaceApi(spaceId),
      ]);
      setSpace(spaceData);
      setProjects(projectsData);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load space";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [spaceId]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spaceId) return;
    setCreateError(null);
    setCreating(true);

    try {
      const newProj = await createProjectInSpaceApi(spaceId, {
        name,
        learning_goal: learningGoal,
        description: description.trim() || undefined,
      });
      setShowModal(false);
      setName("");
      setLearningGoal("");
      setDescription("");
      navigate(`/projects/${newProj.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create project";
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-text-muted">
        <Loader2 className="w-8 h-8 animate-spin text-accent mb-3" />
        <p className="text-sm">Loading space details...</p>
      </div>
    );
  }

  if (error || !space) {
    return (
      <div className="max-w-md mx-auto my-16 text-center">
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-300 text-xs mb-4">
          {error || "Space not found"}
        </div>
        <Link
          to="/spaces"
          className="inline-flex items-center gap-2 text-xs text-accent hover:text-accent-hover font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Spaces
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Navigation Breadcrumb & Header (Open layout) */}
      <div className="space-y-4">
        <Link
          to="/spaces"
          className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Spaces</span>
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/40">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
              <Folder className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-accent font-bold">
                Learning Space
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight mt-0.5">
                {space.name}
              </h1>
              <p className="text-xs sm:text-sm text-text-muted mt-1 max-w-2xl leading-relaxed">
                {space.description?.trim() || "Domain workspace organizing dedicated study projects and course materials."}
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold transition-all hover-lift shadow-sm self-start sm:self-auto cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Project</span>
          </button>
        </div>
      </div>

      {/* Projects List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-accent" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted">
              Projects in this Space ({projects.length})
            </h2>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border/80 bg-surface-muted/30 p-12 text-center max-w-md mx-auto my-6">
            <div className="inline-flex p-4 bg-accent/10 text-accent rounded-2xl mb-4">
              <FolderPlus className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-text-primary">No study projects yet</h3>
            <p className="text-xs text-text-muted mt-2 leading-relaxed">
              A Project represents a focused study journey with textbook materials, AI tutoring, and adaptive tests.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-all hover-lift shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create First Project</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="group p-5 rounded-2xl bg-surface border border-border/60 hover:border-accent/40 shadow-xs hover-lift transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <h3 className="text-base font-bold text-text-primary group-hover:text-accent transition-colors">
                    {project.name}
                  </h3>
                  {project.description && (
                    <p className="text-xs text-text-muted line-clamp-2 leading-relaxed">
                      {project.description}
                    </p>
                  )}

                  {/* Learning Goal pill */}
                  <div className="p-3 rounded-xl bg-surface-muted/60 border border-border/50">
                    <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase font-bold text-accent mb-1">
                      <Target className="w-3 h-3" />
                      <span>Learning Goal</span>
                    </div>
                    <p className="text-xs text-text-secondary line-clamp-2 italic leading-relaxed">
                      "{project.learning_goal}"
                    </p>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-border/40 flex items-center justify-between text-xs text-accent font-semibold">
                  <span>Enter workspace</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-text-primary">Create Learning Project</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-text-muted hover:text-text-primary text-sm"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-300 text-xs">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Neural Networks & Backprop"
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-muted border border-border text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Learning Goal</label>
                <textarea
                  rows={2}
                  required
                  value={learningGoal}
                  onChange={(e) => setLearningGoal(e.target.value)}
                  placeholder="What specific skill or concept do you want to master?"
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-muted border border-border text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-accent resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Additional context or notes"
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-muted border border-border text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-accent resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl border border-border text-text-secondary hover:text-text-primary hover:bg-surface-muted text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                  {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
