import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  FileText,
  Folder,
  FolderPlus,
  Home,
  Loader2,
  Plus,
  Search,
} from "lucide-react";
import { createSpaceApi, getGlobalAnalyticsApi, listSpacesApi } from "@/lib/api";
import { ProjectProgressItem, Space } from "@/types";

export const SpacesPage: React.FC = () => {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [recentProjects, setRecentProjects] = useState<ProjectProgressItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter state for Spaces
  const [spaceSearchQuery, setSpaceSearchQuery] = useState("");
  const [spaceSortBy, setSpaceSortBy] = useState<"recent" | "name" | "projects" | "mastery">("recent");

  // Filter state for Active Study Projects
  const [projectSpaceFilter, setProjectSpaceFilter] = useState<string>("all");

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

  const formatRelativeTime = (dateStr?: string | null): string => {
    if (!dateStr) return "2 days ago";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "recently";
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

  // Unique spaces available for project filtering
  const availableSpaces = useMemo(() => {
    const names = new Set<string>();
    spaces.forEach((s) => names.add(s.name));
    recentProjects.forEach((p) => names.add(p.space_name));
    return Array.from(names);
  }, [spaces, recentProjects]);

  // Filtered and sorted Spaces list
  const filteredAndSortedSpaces = useMemo(() => {
    const result = spaces.filter((s) => {
      if (!spaceSearchQuery.trim()) return true;
      const q = spaceSearchQuery.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q))
      );
    });

    result.sort((a, b) => {
      if (spaceSortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      if (spaceSortBy === "projects") {
        return b.projects_count - a.projects_count;
      }
      if (spaceSortBy === "mastery") {
        const getMastery = (s: Space) => {
          return s.average_mastery !== null && s.average_mastery !== undefined
            ? s.average_mastery
            : -1;
        };
        return getMastery(b) - getMastery(a);
      }
      // Default: "recent"
      const dateA = new Date(a.updated_at || a.created_at).getTime();
      const dateB = new Date(b.updated_at || b.created_at).getTime();
      return dateB - dateA;
    });

    return result;
  }, [spaces, spaceSearchQuery, spaceSortBy, recentProjects]);

  // Filtered Active Study Projects list
  const filteredProjects = useMemo(() => {
    if (projectSpaceFilter === "all") return recentProjects;
    return recentProjects.filter(
      (p) => p.space_name.toLowerCase() === projectSpaceFilter.toLowerCase()
    );
  }, [recentProjects, projectSpaceFilter]);

  if (loading && spaces.length === 0) {
    return (
      <div className="py-24 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Loading your learning spaces...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-12">
      {/* ==================================================================== */}
      {/* 1. BREADCRUMBS & PAGE HEADER                                         */}
      {/* ==================================================================== */}
      <div className="space-y-2">
        {/* Breadcrumb matching reference: Home icon > Learning Spaces */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-400 font-medium">
          <Home className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-300 dark:text-slate-600">›</span>
          <span className="text-slate-600 dark:text-slate-300 font-semibold">Learning Spaces</span>
        </div>

        {/* Title and Top-Right + New Space Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] dark:text-white tracking-tight">
              Learning Spaces
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Organize your learning into focused spaces. Keep your materials, projects, and progress in one place.
            </p>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs sm:text-sm font-semibold shadow-xs hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer self-start sm:self-auto shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New Space</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={fetchSpacesAndProjects} className="underline font-semibold cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. LARGE HORIZONTAL INTRODUCTORY BANNER                              */}
      {/* ==================================================================== */}
      <div className="rounded-3xl bg-gradient-to-r from-[#EFF1FE] via-[#F4F2FE] to-[#F9F7FF] dark:from-slate-900 dark:via-indigo-950/30 dark:to-slate-900 border border-[#E0E7FF] dark:border-indigo-500/20 p-6 sm:p-8 relative overflow-hidden shadow-2xs hover:shadow-md hover:border-purple-300 dark:hover:border-purple-700 transition-all duration-300 ease-out group">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left Text & CTA Button (6 cols on lg) */}
          <div className="lg:col-span-6 space-y-3 z-10">
            <span className="text-[10px] sm:text-[11px] font-bold tracking-wider text-purple-600 dark:text-purple-400 uppercase font-mono">
              YOUR LEARNING, YOUR SPACE
            </span>

            <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-[#0F172A] dark:text-white tracking-tight leading-snug">
              Create spaces for what you want to learn.
            </h2>

            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
              Keep your notes, materials, quizzes, and projects organized.
            </p>

            <div className="pt-2">
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs sm:text-sm font-bold shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>New Space</span>
              </button>
            </div>
          </div>

          {/* Center SaaS Minimal Floating UI Graphic (4 cols on lg) */}
          <div className="lg:col-span-4 flex items-center justify-center pointer-events-none py-2 lg:py-0">
            <div className="relative w-56 sm:w-64 h-36 flex items-center justify-center group-hover:scale-105 transition-transform duration-500 ease-out">
              {/* Back Left Angled Card */}
              <div className="absolute left-1 top-6 w-20 h-16 rounded-xl bg-indigo-200/50 dark:bg-indigo-900/30 transform -rotate-12 blur-[0.5px] border border-white/60 dark:border-indigo-500/20 shadow-xs" />

              {/* Back Right Angled Card */}
              <div className="absolute right-4 top-2 w-20 h-16 rounded-xl bg-purple-200/50 dark:bg-purple-900/30 transform rotate-12 blur-[0.5px] border border-white/60 dark:border-purple-500/20 shadow-xs" />

              {/* Bottom Card */}
              <div className="absolute bottom-1 right-8 w-24 h-14 rounded-xl bg-blue-100/60 dark:bg-blue-950/40 transform rotate-6 border border-white/80 dark:border-indigo-500/20 shadow-2xs" />

              {/* Main Center Floating Browser Card */}
              <div className="relative z-10 w-40 sm:w-44 rounded-2xl bg-white/95 dark:bg-slate-800/95 border border-indigo-100 dark:border-indigo-500/30 shadow-lg shadow-indigo-500/10 p-3 space-y-2 backdrop-blur-xs">
                {/* Header Dots */}
                <div className="flex items-center gap-1 pb-1 border-b border-slate-100 dark:border-slate-700/60">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <div className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                </div>

                {/* Inner Window Content matching reference mockup */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="col-span-1 h-10 rounded-lg bg-indigo-500/15 dark:bg-indigo-500/30 flex items-center justify-center">
                    <Folder className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="col-span-2 space-y-1.5 flex flex-col justify-center">
                    <div className="w-full h-2 rounded-full bg-indigo-100 dark:bg-indigo-900/50" />
                    <div className="w-2/3 h-2 rounded-full bg-slate-100 dark:bg-slate-700" />
                  </div>
                </div>

                {/* Secondary row */}
                <div className="w-full h-3 rounded-lg bg-slate-50 dark:bg-slate-700/40 border border-slate-100 dark:border-slate-700/40 flex items-center px-1.5 gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <div className="w-12 h-1 rounded-full bg-slate-200 dark:bg-slate-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Right Motivational Quote matching reference (2 cols on lg) */}
          <div className="lg:col-span-2 flex flex-col items-start lg:items-end justify-center text-left lg:text-right border-t lg:border-t-0 lg:border-l border-indigo-100 dark:border-indigo-500/20 pt-4 lg:pt-0 lg:pl-6">
            <p className="font-serif italic text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-snug">
              “Small steps every day lead to big results.”
            </p>
            <div className="w-7 h-0.5 bg-accent/80 rounded-full mt-2.5" />
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. YOUR SPACES SECTION (HORIZONTAL CARDS)                            */}
      {/* ==================================================================== */}
      <div className="space-y-3.5">
        {/* Section Header with Title, Search & Sorting Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-white tracking-tight">
            Your Spaces ({filteredAndSortedSpaces.length})
          </h2>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Search spaces input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={spaceSearchQuery}
                onChange={(e) => setSpaceSearchQuery(e.target.value)}
                placeholder="Search spaces..."
                className="pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-surface border border-slate-200 dark:border-border rounded-xl text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-accent w-48 sm:w-56 shadow-2xs transition-all"
              />
            </div>

            {/* Sorting dropdown matching reference */}
            <select
              value={spaceSortBy}
              onChange={(e) =>
                setSpaceSortBy(e.target.value as "recent" | "name" | "projects" | "mastery")
              }
              className="px-3 py-1.5 text-xs bg-white dark:bg-surface border border-slate-200 dark:border-border rounded-xl text-slate-700 dark:text-slate-200 focus:outline-none focus:border-accent cursor-pointer shadow-2xs transition-all"
            >
              <option value="recent">Recently Updated</option>
              <option value="name">Name (A–Z)</option>
              <option value="projects">Most Projects</option>
              <option value="mastery">Highest Mastery</option>
            </select>
          </div>
        </div>

        {/* Spaces Cards List (Wide Horizontal Cards matching reference) */}
        {filteredAndSortedSpaces.length > 0 ? (
          <div className="space-y-3">
            {filteredAndSortedSpaces.map((space) => {
              const conceptCount = space.concepts_count ?? 0;
              const hasMastery =
                space.average_mastery !== null && space.average_mastery !== undefined;
              const avgMastery = hasMastery ? Math.round(space.average_mastery!) : null;

              return (
                <Link
                  key={space.id}
                  to={`/spaces/${space.id}`}
                  className="w-full p-4 sm:p-5 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-border shadow-2xs hover:shadow-md hover:-translate-y-0.5 hover:border-purple-200 dark:hover:border-purple-800 transition-all duration-300 ease-out flex flex-col md:flex-row md:items-center justify-between gap-4 group cursor-pointer"
                >
                  {/* Left: Icon & Text Information */}
                  <div className="flex items-start sm:items-center gap-4 min-w-0 flex-1">
                    {/* Folder Icon Container matching reference */}
                    <div className="w-12 h-12 rounded-2xl bg-[#EEF2FF] text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-300 ease-out">
                      <Folder className="w-6 h-6 stroke-[1.75] fill-indigo-500/20" />
                    </div>

                    {/* Text Details */}
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-bold text-[#0F172A] dark:text-white group-hover:text-accent transition-colors truncate">
                        {space.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1 sm:line-clamp-2 leading-relaxed">
                        {space.description?.trim() ||
                          "Dedicated study domain containing curriculum notes, materials, and quizzes."}
                      </p>

                      {/* Metadata row: concepts, project, updated time */}
                      <div className="flex flex-wrap items-center gap-4 sm:gap-6 mt-2 text-[11px] text-slate-400 font-medium">
                        <span className="flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            {conceptCount} {conceptCount === 1 ? "concept" : "concepts"}
                          </span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Folder className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            {space.projects_count}{" "}
                            {space.projects_count === 1 ? "project" : "projects"}
                          </span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            Updated {formatRelativeTime(space.updated_at || space.created_at)}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Mastery Percentage, Progress Bar & Action Arrow */}
                  <div className="flex items-center gap-4 sm:gap-6 self-end md:self-center shrink-0 pl-16 md:pl-0">
                    {/* Mastery Progress Bar */}
                    <div className="text-right">
                      <div
                        className={`text-xs font-semibold font-mono mb-1 ${
                          avgMastery !== null
                            ? "text-purple-600 dark:text-purple-400"
                            : "text-slate-400 dark:text-slate-400"
                        }`}
                      >
                        {avgMastery !== null ? `${avgMastery}% mastery` : "Not assessed"}
                      </div>
                      <div className="w-32 sm:w-36 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-500"
                          style={{
                            width: `${avgMastery !== null ? Math.max(4, avgMastery) : 0}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Circular Action Arrow Button */}
                    <div className="w-9 h-9 rounded-full border border-slate-200 dark:border-border flex items-center justify-center text-slate-400 group-hover:border-accent group-hover:bg-accent group-hover:text-white transition-all duration-200 shrink-0 shadow-2xs">
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-border shadow-2xs">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {spaceSearchQuery
                ? `No learning spaces found matching "${spaceSearchQuery}"`
                : "No learning spaces yet. Create one to organize your learning!"}
            </p>
            {spaceSearchQuery && (
              <button
                onClick={() => setSpaceSearchQuery("")}
                className="mt-2 text-xs text-accent hover:underline font-semibold cursor-pointer"
              >
                Clear search
              </button>
            )}
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* 4. ACTIVE STUDY PROJECTS SECTION (HORIZONTAL CARDS)                  */}
      {/* ==================================================================== */}
      <div className="space-y-3.5 pt-2">
        {/* Section Header with Title, Subtitle, & Filter Dropdown */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-white tracking-tight">
              Active Study Projects ({filteredProjects.length})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Focused learning journeys within your spaces.
            </p>
          </div>

          {/* Filter Dropdown matching reference */}
          <div className="self-start sm:self-auto">
            <select
              value={projectSpaceFilter}
              onChange={(e) => setProjectSpaceFilter(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white dark:bg-surface border border-slate-200 dark:border-border rounded-xl text-slate-700 dark:text-slate-200 focus:outline-none focus:border-accent cursor-pointer shadow-2xs transition-all"
            >
              <option value="all">All Spaces</option>
              {availableSpaces.map((spaceName) => (
                <option key={spaceName} value={spaceName}>
                  {spaceName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Project Cards List (Horizontal Cards matching reference) */}
        {filteredProjects.length > 0 ? (
          <div className="space-y-3">
            {filteredProjects.map((p) => {
              const mastery =
                p.average_mastery !== null ? Math.round(p.average_mastery) : null;

              return (
                <Link
                  key={p.project_id}
                  to={`/projects/${p.project_id}`}
                  className="w-full p-4 sm:p-5 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-border shadow-2xs hover:shadow-md hover:-translate-y-0.5 hover:border-purple-200 dark:hover:border-purple-800 transition-all duration-300 ease-out flex flex-col md:flex-row md:items-center justify-between gap-4 group cursor-pointer"
                >
                  {/* Left: Icon & Text Info */}
                  <div className="flex items-start sm:items-center gap-4 min-w-0 flex-1">
                    {/* Document Icon container matching reference */}
                    <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-300 ease-out">
                      <FileText className="w-6 h-6 stroke-[1.75]" />
                    </div>

                    {/* Text Details */}
                    <div className="min-w-0 flex-1">
                      {/* Category Badge matching reference */}
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200/60 dark:border-purple-500/20 inline-block mb-1">
                        {p.space_name}
                      </span>

                      <h3 className="text-sm sm:text-base font-bold text-[#0F172A] dark:text-white group-hover:text-accent transition-colors truncate">
                        {p.project_name}
                      </h3>

                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1 sm:line-clamp-2 leading-relaxed">
                        {p.learning_goal || "Core learning concepts and interactive practice"}
                      </p>

                      {/* Metadata Row: concept count, mastery, updated date */}
                      <div className="flex flex-wrap items-center gap-4 sm:gap-6 mt-2 text-[11px] text-slate-400 font-medium">
                        <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          <span>
                            {p.assessed_concepts ?? 0}/{p.total_concepts ?? 0} concepts
                          </span>
                        </span>

                        <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                          <BarChart3 className="w-3.5 h-3.5 text-indigo-500" />
                          <span>{mastery !== null ? `${mastery}% mastery` : "Not assessed"}</span>
                        </span>

                        <span className="flex items-center gap-1.5 text-slate-400">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>Updated {formatRelativeTime(p.last_active_at)}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Circular Arrow Button */}
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
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No active study projects found in this space.
            </p>
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* 5. CREATE SPACE MODAL                                                */}
      {/* ==================================================================== */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-border bg-white dark:bg-surface p-6 sm:p-7 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 flex items-center justify-center">
                  <FolderPlus className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-[#0F172A] dark:text-white">
                  Create Learning Space
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

            <form onSubmit={handleCreateSpace} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Space Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Deep learning"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-surface-muted border border-slate-200 dark:border-border text-slate-900 dark:text-white placeholder:text-slate-400 text-xs focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Dedicated study domain containing curriculum notes, materials, and quizzes."
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

export default SpacesPage;
