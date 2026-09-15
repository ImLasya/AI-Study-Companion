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
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
        <p className="text-sm">Loading space details...</p>
      </div>
    );
  }

  if (error || !space) {
    return (
      <div className="max-w-md mx-auto my-16 text-center">
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs mb-4">
          {error || "Space not found"}
        </div>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Spaces
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Navigation Breadcrumb & Header */}
      <div>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Spaces</span>
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 mt-1">
              <Folder className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-400 font-bold">
                Learning Space
              </span>
              <h1 className="text-2xl font-bold text-white tracking-tight mt-0.5">
                {space.name}
              </h1>
              <p className="text-xs text-gray-400 mt-1">
                {space.description || "No description provided."}
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors shadow-sm self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            Create Project
          </button>
        </div>
      </div>

      {/* Projects List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <h2 className="text-base font-semibold text-white">Projects in this Space</h2>
          </div>
          <span className="text-xs text-gray-500 font-mono">
            {projects.length} {projects.length === 1 ? "project" : "projects"}
          </span>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-950/40 p-12 text-center max-w-lg mx-auto my-6">
            <div className="inline-flex p-4 bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 rounded-2xl mb-4">
              <FolderPlus className="w-10 h-10" />
            </div>
            <h3 className="text-base font-semibold text-white">No projects yet</h3>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              A Project represents a focused learning journey with materials, an AI tutor, and adaptive quizzes.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create First Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="group rounded-2xl border border-gray-800 bg-gray-900/60 p-6 hover:border-indigo-500/50 hover:bg-gray-900 transition-all flex flex-col justify-between"
              >
                <div>
                  <h3 className="text-base font-bold text-white group-hover:text-indigo-400 transition-colors">
                    {project.name}
                  </h3>
                  {project.description && (
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                      {project.description}
                    </p>
                  )}

                  {/* Learning Goal pill */}
                  <div className="mt-4 p-3 rounded-xl bg-gray-950 border border-gray-800/80">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-400 mb-1">
                      <Target className="w-3.5 h-3.5" />
                      Learning Goal
                    </div>
                    <p className="text-xs text-gray-300 line-clamp-2 italic">
                      "{project.learning_goal}"
                    </p>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-800/80 flex items-center justify-between text-xs text-indigo-400 font-medium">
                  <span>Enter workspace</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6 sm:p-8 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Create Learning Project</h3>
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

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Neural Networks & Backprop"
                  className="w-full px-3.5 py-2 rounded-lg bg-gray-950 border border-gray-800 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Learning Goal</label>
                <textarea
                  rows={2}
                  required
                  value={learningGoal}
                  onChange={(e) => setLearningGoal(e.target.value)}
                  placeholder="What specific skill or concept do you want to master?"
                  className="w-full px-3.5 py-2 rounded-lg bg-gray-950 border border-gray-800 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Additional context or notes"
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
