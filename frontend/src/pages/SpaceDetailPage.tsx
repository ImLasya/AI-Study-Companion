import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  FileText,
  Folder,
  FolderPlus,
  Layers,
  Loader2,
  Plus,
  Search,
  Trash2,
  UploadCloud,
} from "lucide-react";
import {
  createProjectInSpaceApi,
  deleteSpaceApi,
  getGlobalAnalyticsApi,
  getProjectMaterialsApi,
  getSpaceApi,
  listProjectsInSpaceApi,
} from "@/lib/api";
import { Material, Project, ProjectProgressItem, Space } from "@/types";

export const SpaceDetailPage: React.FC = () => {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();

  const [space, setSpace] = useState<Space | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectAnalytics, setProjectAnalytics] = useState<ProjectProgressItem[]>([]);
  const [materialsByProject, setMaterialsByProject] = useState<Record<string, Material[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tabs state: Projects, Materials, Settings
  const [activeTab, setActiveTab] = useState<"projects" | "materials" | "settings">("projects");

  // Project Search & Sorting
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "name" | "concepts">("recent");

  // Create Project Modal State
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [learningGoal, setLearningGoal] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Space deletion state
  const [deletingSpace, setDeletingSpace] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const loadData = async () => {
    if (!spaceId) return;
    try {
      setLoading(true);
      setError(null);
      const [spaceData, projectsData, analyticsData] = await Promise.all([
        getSpaceApi(spaceId),
        listProjectsInSpaceApi(spaceId),
        getGlobalAnalyticsApi().catch(() => null),
      ]);
      setSpace(spaceData);
      setProjects(projectsData);
      setProjectAnalytics(analyticsData?.projects_by_progress || []);

      // Fetch materials for projects in this space
      if (projectsData.length > 0) {
        const matResults = await Promise.allSettled(
          projectsData.map((p) => getProjectMaterialsApi(p.id))
        );
        const matMap: Record<string, Material[]> = {};
        projectsData.forEach((p, idx) => {
          const res = matResults[idx];
          if (res.status === "fulfilled") {
            matMap[p.id] = res.value;
          } else {
            matMap[p.id] = [];
          }
        });
        setMaterialsByProject(matMap);
      }
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

  const handleDeleteSpace = async () => {
    if (!spaceId) return;
    setDeletingSpace(true);
    try {
      await deleteSpaceApi(spaceId);
      navigate("/spaces");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete space";
      setError(msg);
      setShowDeleteConfirm(false);
    } finally {
      setDeletingSpace(false);
    }
  };

  const formatRelativeTime = (dateStr?: string | null): string => {
    if (!dateStr) return "2 days ago";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "2 days ago";
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours < 1) return "just now";
      if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 1) return "yesterday";
      if (diffDays < 7) return `${diffDays} days ago`;
      if (diffDays < 30) {
        const weeks = Math.floor(diffDays / 7);
        return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
      }
      const months = Math.floor(diffDays / 30);
      return `${months} month${months === 1 ? "" : "s"} ago`;
    } catch {
      return "2 days ago";
    }
  };

  // Filtered and sorted projects
  const filteredProjects = useMemo(() => {
    const result = projects.filter((p) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.learning_goal.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
      );
    });

    result.sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "concepts") {
        const getConcepts = (proj: Project) => {
          const item = projectAnalytics.find((pa) => pa.project_id === proj.id);
          return item?.total_concepts || 0;
        };
        return getConcepts(b) - getConcepts(a);
      }
      // Default: "recent"
      const dateA = new Date(a.updated_at || a.created_at).getTime();
      const dateB = new Date(b.updated_at || b.created_at).getTime();
      return dateB - dateA;
    });

    return result;
  }, [projects, searchQuery, sortBy, projectAnalytics]);

  // Aggregate all materials across this space's projects
  const allSpaceMaterials = useMemo(() => {
    const list: { material: Material; project: Project }[] = [];
    projects.forEach((p) => {
      const mats = materialsByProject[p.id] || [];
      mats.forEach((m) => list.push({ material: m, project: p }));
    });
    return list;
  }, [projects, materialsByProject]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-accent mb-3" />
        <p className="text-xs font-medium">Loading space details...</p>
      </div>
    );
  }

  if (error || !space) {
    return (
      <div className="max-w-md mx-auto my-16 text-center">
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 text-xs mb-4">
          {error || "Space not found"}
        </div>
        <Link
          to="/spaces"
          className="inline-flex items-center gap-2 text-xs text-accent hover:text-accent-hover font-semibold"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Spaces
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-12">
      {/* ==================================================================== */}
      {/* 1. BREADCRUMBS & BACK ACTION                                         */}
      {/* ==================================================================== */}
      <div className="space-y-3">
        {/* Breadcrumb matching reference: Spaces > Space Details */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-400 font-medium">
          <Link to="/spaces" className="hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            Spaces
          </Link>
          <span className="text-slate-300 dark:text-slate-600">›</span>
          <span className="text-slate-600 dark:text-slate-300 font-semibold">Space Details</span>
        </div>

        {/* Back to Spaces Link */}
        <div>
          <Link
            to="/spaces"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-accent transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Spaces</span>
          </Link>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 2. SPACE HEADER SECTION                                              */}
      {/* ==================================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        {/* Left: Big Folder Icon & Details */}
        <div className="flex items-start gap-4 sm:gap-5">
          {/* Soft Lavender Rounded Icon Badge matching reference */}
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#EEF2FF] text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-2xs">
            <Folder className="w-7 h-7 stroke-[1.75] fill-indigo-500/20" />
          </div>

          <div>
            {/* Upper Badge: LEARNING SPACE */}
            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200/60 dark:border-purple-500/20 inline-block mb-1">
              LEARNING SPACE
            </span>

            {/* Space Name */}
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] dark:text-white tracking-tight">
              {space.name}
            </h1>

            {/* Description */}
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
              {space.description?.trim() ||
                "Domain workspace organizing dedicated study projects and course materials."}
            </p>
          </div>
        </div>

        {/* Right: + Create Project Button matching reference */}
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs sm:text-sm font-semibold shadow-xs hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer self-start sm:self-auto shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Create Project</span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* 3. TABS BAR (Projects, Materials, Settings)                          */}
      {/* ==================================================================== */}
      <div className="flex items-center gap-8 border-b border-slate-200/80 dark:border-border text-xs sm:text-sm">
        <button
          onClick={() => setActiveTab("projects")}
          className={`pb-2.5 font-semibold transition-all cursor-pointer relative ${
            activeTab === "projects"
              ? "text-accent font-bold border-b-2 border-accent -mb-[1px]"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          Projects
        </button>

        <button
          onClick={() => setActiveTab("materials")}
          className={`pb-2.5 font-semibold transition-all cursor-pointer relative ${
            activeTab === "materials"
              ? "text-accent font-bold border-b-2 border-accent -mb-[1px]"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          Materials
        </button>

        <button
          onClick={() => setActiveTab("settings")}
          className={`pb-2.5 font-semibold transition-all cursor-pointer relative ${
            activeTab === "settings"
              ? "text-accent font-bold border-b-2 border-accent -mb-[1px]"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          Settings
        </button>
      </div>

      {/* ==================================================================== */}
      {/* 4. TAB CONTENT: PROJECTS (DEFAULT)                                   */}
      {/* ==================================================================== */}
      {activeTab === "projects" && (
        <div className="space-y-4 pt-1">
          {/* Section Header: Title, Description, Search, & Sorting */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-white tracking-tight">
                Projects in this Space ({filteredProjects.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Manage and access all projects under this learning space.
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Search projects input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search projects..."
                  className="pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-surface border border-slate-200 dark:border-border rounded-xl text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-accent w-48 sm:w-56 shadow-2xs transition-all"
                />
              </div>

              {/* Sorting dropdown matching reference */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "recent" | "name" | "concepts")}
                className="px-3 py-1.5 text-xs bg-white dark:bg-surface border border-slate-200 dark:border-border rounded-xl text-slate-700 dark:text-slate-200 focus:outline-none focus:border-accent cursor-pointer shadow-2xs transition-all"
              >
                <option value="recent">Recently Updated</option>
                <option value="name">Name (A–Z)</option>
                <option value="concepts">Most Concepts</option>
              </select>
            </div>
          </div>

          {/* Projects List (Wide Horizontal Cards matching reference) */}
          {filteredProjects.length > 0 ? (
            <div className="space-y-3">
              {filteredProjects.map((project) => {
                const analytics = projectAnalytics.find((pa) => pa.project_id === project.id);
                const conceptsCount = analytics?.total_concepts ?? 0;
                const mats = materialsByProject[project.id] || [];
                const materialsCount = mats.length;

                return (
                  <Link
                    key={project.id}
                    to={`/projects/${project.id}`}
                    className="w-full p-4 sm:p-5 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-border shadow-2xs hover:shadow-md hover:-translate-y-0.5 hover:border-purple-200 dark:hover:border-purple-800 transition-all duration-300 ease-out flex flex-col md:flex-row md:items-center justify-between gap-4 group cursor-pointer"
                  >
                    {/* Left: Icon & Info */}
                    <div className="flex items-start sm:items-center gap-4 min-w-0 flex-1">
                      {/* Document Icon Container matching reference */}
                      <div className="w-12 h-12 rounded-2xl bg-[#EEF2FF] text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-300 ease-out">
                        <FileText className="w-6 h-6 stroke-[1.75]" />
                      </div>

                      {/* Text Details */}
                      <div className="min-w-0 flex-1">
                        {/* Learning Goal Pill */}
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200/60 dark:border-purple-500/20 inline-block mb-1">
                          LEARNING GOAL
                        </span>

                        {/* Title */}
                        <h3 className="text-sm sm:text-base font-bold text-[#0F172A] dark:text-white group-hover:text-accent transition-colors truncate">
                          {project.name}
                        </h3>

                        {/* Learning Goal Quote */}
                        <p className="italic font-serif text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                          “{project.learning_goal || project.description || "Deep learning mastery"}”
                        </p>

                        {/* Metadata Row: concepts, materials, updated time */}
                        <div className="flex flex-wrap items-center gap-4 sm:gap-6 mt-2 text-[11px] text-slate-400 font-medium">
                          <span className="flex items-center gap-1.5">
                            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              {conceptsCount} {conceptsCount === 1 ? "concept" : "concepts"}
                            </span>
                          </span>

                          <span className="flex items-center gap-1.5">
                            <Folder className="w-3.5 h-3.5 text-slate-400" />
                            <span>Materials ({materialsCount})</span>
                          </span>

                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>Updated {formatRelativeTime(project.updated_at || project.created_at)}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Circular Action Arrow Button */}
                    <div className="self-end md:self-center shrink-0 pl-16 md:pl-0">
                      <div className="w-9 h-9 rounded-full border border-slate-200 dark:border-border flex items-center justify-center text-slate-400 group-hover:border-accent group-hover:bg-accent group-hover:text-white transition-all duration-200 shadow-2xs">
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-border shadow-2xs">
              <div className="inline-flex p-3 bg-indigo-50 dark:bg-indigo-950/40 text-accent rounded-2xl mb-3">
                <FolderPlus className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">
                {searchQuery ? "No matching projects found" : "No study projects yet"}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                {searchQuery
                  ? `No projects found matching "${searchQuery}".`
                  : "A project represents a focused study journey with textbook materials, AI tutoring, and adaptive tests."}
              </p>
              {searchQuery ? (
                <button
                  onClick={() => setSearchQuery("")}
                  className="mt-3 text-xs text-accent hover:underline font-semibold cursor-pointer"
                >
                  Clear search
                </button>
              ) : (
                <button
                  onClick={() => setShowModal(true)}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow-xs hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create First Project</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 5. TAB CONTENT: MATERIALS                                            */}
      {/* ==================================================================== */}
      {activeTab === "materials" && (
        <div className="space-y-4 pt-1">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-white tracking-tight">
                Materials in this Space ({allSpaceMaterials.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                All uploaded documents, notes, and study files across projects in {space.name}.
              </p>
            </div>
          </div>

          {allSpaceMaterials.length > 0 ? (
            <div className="space-y-2.5">
              {allSpaceMaterials.map(({ material, project }) => (
                <div
                  key={material.id}
                  className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-border shadow-2xs hover:shadow-md hover:-translate-y-0.5 hover:border-purple-200 dark:hover:border-purple-800 transition-all duration-300 ease-out flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/40 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#0F172A] dark:text-white truncate">
                        {material.filename}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-400">
                        <span className="text-accent font-medium">{project.name}</span>
                        <span>•</span>
                        <span>{formatRelativeTime(material.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Ready</span>
                    </span>
                    <Link
                      to={`/projects/${project.id}?tab=materials`}
                      className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
                    >
                      View in Project &rarr;
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-border shadow-2xs">
              <div className="inline-flex p-3 bg-purple-50 text-purple-600 rounded-2xl mb-3">
                <UploadCloud className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">
                No materials uploaded yet
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                Upload PDFs, notes, and study guides inside any study project to populate this space.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 6. TAB CONTENT: SETTINGS                                             */}
      {/* ==================================================================== */}
      {activeTab === "settings" && (
        <div className="space-y-6 pt-1 max-w-2xl">
          {/* Space Details Card */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-border shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-[#0F172A] dark:text-white tracking-tight">
              Space Overview
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-surface-muted border border-slate-100 dark:border-border">
                <span className="text-slate-400 block mb-0.5">Created Date</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                  {new Date(space.created_at).toLocaleDateString()}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-surface-muted border border-slate-100 dark:border-border">
                <span className="text-slate-400 block mb-0.5">Total Projects</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                  {projects.length}
                </span>
              </div>
            </div>
          </div>

          {/* Danger Zone: Delete Space */}
          <div className="p-5 sm:p-6 rounded-2xl bg-rose-50/50 dark:bg-rose-950/10 border border-rose-200/80 dark:border-rose-900/30 space-y-3">
            <h3 className="text-sm font-bold text-rose-700 dark:text-rose-400 tracking-tight">
              Danger Zone
            </h3>
            <p className="text-xs text-rose-600 dark:text-rose-400 leading-relaxed">
              Deleting this learning space will remove the space domain. Study projects within it will be detached or deleted.
            </p>

            {showDeleteConfirm ? (
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleDeleteSpace}
                  disabled={deletingSpace}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {deletingSpace && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirm Delete</span>
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-border text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-950/40 text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Learning Space</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 7. CREATE PROJECT MODAL                                              */}
      {/* ==================================================================== */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-border bg-white dark:bg-surface p-6 sm:p-7 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 flex items-center justify-center">
                  <Layers className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-[#0F172A] dark:text-white">
                  Create Learning Project
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-surface-muted transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Neural networks and transformers"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-surface-muted border border-slate-200 dark:border-border text-slate-900 dark:text-white placeholder:text-slate-400 text-xs focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Learning Goal
                </label>
                <textarea
                  rows={2}
                  required
                  value={learningGoal}
                  onChange={(e) => setLearningGoal(e.target.value)}
                  placeholder="Learning ANN, CNN and Transformers"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-surface-muted border border-slate-200 dark:border-border text-slate-900 dark:text-white placeholder:text-slate-400 text-xs focus:outline-none focus:border-accent resize-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Dedicated study journey with textbook materials and AI practice"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-surface-muted border border-slate-200 dark:border-border text-slate-900 dark:text-white placeholder:text-slate-400 text-xs focus:outline-none focus:border-accent resize-none transition-colors"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-border text-slate-600 dark:text-slate-400 hover:text-slate-800 hover:bg-slate-50 dark:hover:bg-surface-muted text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Create Project</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpaceDetailPage;

