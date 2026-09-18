import React, { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  Eye,
  FileText,
  Folder,
  HelpCircle,
  Info,
  Layers,
  LayoutDashboard,
  Lightbulb,
  Loader2,
  MoreVertical,
  Play,
  Plus,
  RotateCw,
  Search,
  Target,
  TrendingUp,
  UploadCloud,
  X,
  Zap,
} from "lucide-react";
import {
  getProjectApi,
  getProjectConceptsApi,
  getProjectMasteryApi,
  getProjectMaterialsApi,
  getProjectQuizzesApi,
  getProjectRecommendationsApi,
  getSpaceApi,
  retryMaterialApi,
  uploadMaterialApi,
  listProjectInsightsApi,
  generateProjectInsightsApi,
} from "@/lib/api";
import {
  Concept,
  MasteryListResponse,
  Material,
  Project,
  Quiz,
  Recommendation,
  Space,
  LearningInsight,
} from "@/types";
import { TutorTab } from "@/components/TutorTab";
import { QuizTab } from "@/components/QuizTab";
import { GrowthTab } from "@/components/GrowthTab";
import { AnalyticsTab } from "./ProjectDetailPage/AnalyticsTab";
import { FlashcardTab } from "@/components/FlashcardTab";

type TabKey = "overview" | "materials" | "tutor" | "quiz" | "growth" | "analytics" | "flashcards";

interface NavItem {
  key: TabKey;
  label: string;
  icon: React.FC<{ className?: string }>;
  count?: number;
}

export const ProjectDetailPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active Tab from URL query param if valid, fallback to overview
  const initialTab = (searchParams.get("tab") as TabKey) || "overview";
  const [activeTab, setActiveTab] = useState<TabKey>(
    ["overview", "materials", "tutor", "quiz", "growth", "analytics", "flashcards"].includes(initialTab)
      ? initialTab
      : "overview"
  );

  const [project, setProject] = useState<Project | null>(null);
  const [space, setSpace] = useState<Space | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Project Scoped Data
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [masteryData, setMasteryData] = useState<MasteryListResponse | null>(null);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [insights, setInsights] = useState<LearningInsight[]>([]);
  const [refreshingInsights, setRefreshingInsights] = useState(false);

  // Filter state for Key Concepts
  const [conceptFilter, setConceptFilter] = useState<string>("all");

  // Materials tab search, sort, and modal states
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialSort, setMaterialSort] = useState<"recent" | "name" | "pages">("recent");
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [newSessionTrigger, setNewSessionTrigger] = useState(0);
  const [newQuizTrigger, setNewQuizTrigger] = useState(0);
  const [viewingMaterial, setViewingMaterial] = useState<{
    id: string;
    filename: string;
    page_count?: number | null;
    status: string;
    created_at: string;
    tags?: string[];
  } | null>(null);

  // Sync tab with URL
  const handleTabChange = (key: TabKey) => {
    setActiveTab(key);
    setSearchParams({ tab: key });
  };

  const handleRefreshInsights = async () => {
    if (!projectId) return;
    try {
      setRefreshingInsights(true);
      const fresh = await generateProjectInsightsApi(projectId);
      setInsights(fresh);
    } catch (e) {
      console.error("Failed refreshing insights:", e);
    } finally {
      setRefreshingInsights(false);
    }
  };

  // 0. Reset all project-scoped state immediately when projectId changes
  //    so that data from a previous project cannot bleed into this one
  //    while the new project's API calls are still in-flight.
  useEffect(() => {
    setLoading(true);
    setProject(null);
    setSpace(null);
    setMaterials([]);
    setMasteryData(null);
    setConcepts([]);
    setQuizzes([]);
    setRecommendations([]);
    setInsights([]);
    setError(null);
    setMaterialSearch("");
    setConceptFilter("all");
  }, [projectId]);

  // 1. Fetch Project Details, Recommendations, Mastery, Concepts, Quizzes, Insights
  useEffect(() => {
    if (!projectId) return;

    const fetchProjectData = async () => {
      try {
        setLoading(true);
        const [projectData, recsData, mastery, conceptsData, quizzesData, insightsData] = await Promise.all([
          getProjectApi(projectId),
          getProjectRecommendationsApi(projectId).catch(() => []),
          getProjectMasteryApi(projectId).catch(() => null),
          getProjectConceptsApi(projectId).catch(() => []),
          getProjectQuizzesApi(projectId).catch(() => []),
          listProjectInsightsApi(projectId).catch(() => []),
        ]);
        setProject(projectData);
        if (projectData.space_id) {
          getSpaceApi(projectData.space_id).then(setSpace).catch(() => null);
        }
        setRecommendations(recsData);
        setMasteryData(mastery);
        setConcepts(conceptsData);
        setQuizzes(quizzesData);
        setInsights(insightsData);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load project";
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    fetchProjectData();
  }, [projectId]);

  // 2. Fetch Materials
  const fetchMaterials = async (silent: boolean = false) => {
    if (!projectId) return;
    if (!silent) setMaterialsLoading(true);
    try {
      const data = await getProjectMaterialsApi(projectId);
      setMaterials(data);
    } catch (err: unknown) {
      if (!silent) console.error("Failed to load materials:", err);
    } finally {
      if (!silent) setMaterialsLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      fetchMaterials();
    }
  }, [projectId]);

  // Status Polling: Poll every 2.5s while any material is queued or processing
  useEffect(() => {
    if (!projectId) return;

    const hasPending = materials.some(
      (m) => m.status === "queued" || m.status === "processing"
    );

    if (!hasPending) return;

    const intervalId = setInterval(() => {
      fetchMaterials(true);
    }, 2500);

    return () => clearInterval(intervalId);
  }, [materials, projectId]);

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    if (!projectId) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setUploadError("Only PDF files (.pdf) are supported.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setUploadError("File exceeds the maximum allowed size of 20MB.");
      return;
    }

    setUploadError(null);
    setUploading(true);
    try {
      const queuedMaterial = await uploadMaterialApi(projectId, file);
      setMaterials((prev) => [queuedMaterial, ...prev]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUploadError(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleRetry = async (materialId: string) => {
    setRetryingId(materialId);
    try {
      const updated = await retryMaterialApi(materialId);
      setMaterials((prev) =>
        prev.map((m) => (m.id === materialId ? updated : m))
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Retry failed";
      alert(msg);
    } finally {
      setRetryingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-[#4F46E5] mb-3" />
        <p className="text-sm font-medium">Loading project workspace...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="max-w-md mx-auto my-16 text-center">
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-300 text-xs mb-4">
          {error || "Project not found"}
        </div>
        <Link
          to="/spaces"
          className="inline-flex items-center gap-2 text-xs text-[#4F46E5] hover:text-[#4338CA] font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Spaces
        </Link>
      </div>
    );
  }

  // Derived Overview Metrics
  const totalConceptsCount = masteryData?.total_concepts ?? concepts.length ?? 0;
  const completedConceptsCount =
    masteryData?.masteries?.filter((m) => (m.mastery_score ?? 0) >= 70).length ?? 0;
  const weakTopicsCount =
    masteryData?.masteries?.filter(
      (m) => m.mastery_score !== null && m.mastery_score < 50 && m.evidence_count > 0
    ).length ?? 0;
  const averageMastery =
    masteryData?.overall_average_mastery !== null && masteryData?.overall_average_mastery !== undefined
      ? Math.round(masteryData.overall_average_mastery)
      : null;

  // Display values for stat cards
  const displayOverallProgress = averageMastery !== null ? `${averageMastery}%` : "Not assessed";
  const displayConceptsCount = totalConceptsCount;
  const displayCompletedCount = completedConceptsCount;
  const displayWeakCount = weakTopicsCount;

  // Navigation Items — counts reflect ONLY real data fetched from the API.
  // No fallback counts: if the project has no materials/quizzes yet, the badge
  // is omitted (undefined) rather than showing a fabricated number.
  const navItems: NavItem[] = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "materials", label: "Materials", icon: FileText, count: materials.length > 0 ? materials.length : undefined },
    { key: "tutor", label: "AI Tutor", icon: Bot },
    { key: "quiz", label: "Adaptive Quiz", icon: HelpCircle, count: quizzes.length > 0 ? quizzes.length : undefined },
    { key: "flashcards", label: "Flashcards", icon: BookOpen },
    { key: "growth", label: "Growth", icon: TrendingUp },
    { key: "analytics", label: "Analytics", icon: BarChart3 },
  ];

  // Only display real materials fetched from the API for THIS project.
  // No sample/demo fallback: an empty project shows an empty list with
  // an honest upload prompt.
  const displayedMaterials = materials.map((m, idx) => {
    // Derive up to 3 concept-name tags from the project's real concepts
    const conceptTags = concepts.slice(idx * 3, idx * 3 + 3).map((c) => c.name);
    return {
      id: m.id,
      filename: m.filename,
      page_count: m.page_count,
      status: m.status,
      created_at: m.created_at,
      // Only attach real concept tags; never inject generic placeholder tags
      tags: conceptTags.length > 0 ? conceptTags : [],
    };
  });

  // Filter materials by search query
  const filteredMaterials = displayedMaterials.filter((m) => {
    if (!materialSearch.trim()) return true;
    const q = materialSearch.toLowerCase();
    return (
      m.filename.toLowerCase().includes(q) ||
      m.tags?.some((t) => t.toLowerCase().includes(q))
    );
  });

  // Sort materials
  const sortedMaterials = [...filteredMaterials].sort((a, b) => {
    if (materialSort === "name") {
      return a.filename.localeCompare(b.filename);
    }
    if (materialSort === "pages") {
      return (b.page_count || 0) - (a.page_count || 0);
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Map real mastery data to displayable concept rows.
  // No demo/sample fallback: an empty project shows no concepts with an
  // honest "No concepts extracted yet" message.
  const mappedConcepts =
    masteryData && masteryData.masteries.length > 0
      ? masteryData.masteries.map((c) => {
          const score = c.mastery_score !== null ? Math.round(c.mastery_score) : 0;
          let status: "In Progress" | "Not Started" | "Mastered" | "Needs Practice" = "Not Started";
          let statusCode = "not_started";
          let action = "Start";

          if (c.evidence_count === 0 || c.mastery_score === null) {
            status = "Not Started";
            statusCode = "not_started";
            action = "Start";
          } else if (score >= 70) {
            status = "Mastered";
            statusCode = "mastered";
            action = "Review";
          } else if (score < 50) {
            status = "Needs Practice";
            statusCode = "needs_practice";
            action = "Practice";
          } else {
            status = "In Progress";
            statusCode = "in_progress";
            action = "Continue";
          }

          return {
            id: c.concept_id,
            name: c.concept_name,
            status,
            statusCode,
            score,
            action,
          };
        })
      : concepts.map((c) => ({
          id: c.id,
          name: c.name,
          // Concepts with no mastery evidence are honestly shown as Not Started
          status: "Not Started" as const,
          statusCode: "not_started",
          score: 0,
          action: "Start",
        }));

  // Filter concepts based on dropdown
  const filteredConcepts = mappedConcepts.filter((item) => {
    if (conceptFilter === "all") return true;
    return item.statusCode === conceptFilter;
  });

  // Next-up recommendation — only shown when real recommendations exist.
  // Never inject hardcoded recommendation text.
  const hasRecommendation =
    recommendations.length > 0 &&
    (recommendations[0].target_concept_name || recommendations[0].title);
  const nextUpTitle = hasRecommendation
    ? (recommendations[0].target_concept_name || recommendations[0].title)!
    : null;
  const nextUpSubtitle = hasRecommendation
    ? (recommendations[0].reasoning || recommendations[0].body || "")
    : null;

  return (
    <div className="space-y-6">
      {/* ==================================================================== */}
      {/* 1. BREADCRUMBS & PROJECT HEADER (When not on Growth or Analytics)   */}
      {/* ==================================================================== */}
      {activeTab !== "growth" && activeTab !== "analytics" && (
        <>
          <div className="space-y-3 pb-2">
            {/* Breadcrumbs */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Link to="/spaces" className="hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
                Spaces
              </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          {space ? (
            <Link to={`/spaces/${space.id}`} className="hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
              {space.name}
            </Link>
          ) : (
            <span className="hover:text-slate-800 dark:hover:text-slate-200 transition-colors">Space</span>
          )}
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span
            onClick={() => handleTabChange("overview")}
            className="hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer truncate"
          >
            {project.name}
          </span>
          {activeTab === "materials" && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-[#0F172A] dark:text-white font-medium">Materials</span>
            </>
          )}
          {activeTab === "tutor" && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-[#0F172A] dark:text-white font-medium">AI Tutor</span>
            </>
          )}
          {activeTab === "quiz" && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-[#0F172A] dark:text-white font-medium">Adaptive Quiz</span>
            </>
          )}
          {activeTab === "flashcards" && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-[#0F172A] dark:text-white font-medium">Flashcards</span>
            </>
          )}
        </div>

        {/* Project Header Title & Action Buttons */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-1">
          <div className="flex items-start gap-4">
            {/* Square Icon Badge with soft lavender/periwinkle background */}
            <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-[#EEF2FF] dark:bg-indigo-950/50 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-2xs">
              {activeTab === "quiz" ? (
                <Target className="w-7 h-7" />
              ) : activeTab === "flashcards" ? (
                <BookOpen className="w-7 h-7" />
              ) : (
                <FileText className="w-7 h-7" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A] dark:text-white tracking-tight">
                  {activeTab === "flashcards" ? "Flashcards & Spaced Repetition" : project.name}
                </h1>
                {activeTab !== "flashcards" && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#EEF2FF] dark:bg-indigo-950/60 text-[#4F46E5] dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40">
                    {displayOverallProgress} Mastery
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {activeTab === "flashcards" ? (
                  "Turn your study materials into smart flashcards with AI and review them using spaced repetition."
                ) : (
                  <>
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Goal:</span>{" "}
                    {project.learning_goal || <span className="italic text-slate-400">No learning goal set.</span>}
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto shrink-0">
            {activeTab === "flashcards" ? (
              <button
                onClick={() => handleTabChange("materials")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-semibold shadow-2xs transition-all hover:shadow-xs cursor-pointer group"
              >
                <BookOpen className="w-4 h-4 text-slate-500" />
                <span>View Study Material</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
            ) : activeTab === "quiz" ? (
              <>
                {/* Outlined View Materials Button */}
                <button
                  onClick={() => handleTabChange("materials")}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-semibold shadow-2xs transition-all hover:shadow-xs cursor-pointer"
                >
                  <BookOpen className="w-4 h-4 text-slate-500" />
                  <span>View Materials</span>
                </button>

                {/* Purple Primary + New Adaptive Quiz Button */}
                <button
                  onClick={() => setNewQuizTrigger((prev) => prev + 1)}
                  className="inline-flex items-center gap-2 px-4.5 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-semibold shadow-sm transition-all hover-lift cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Adaptive Quiz</span>
                </button>
              </>
            ) : activeTab === "tutor" ? (
              <>
                {/* Outlined View Materials Button */}
                <button
                  onClick={() => handleTabChange("materials")}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-semibold shadow-2xs transition-all hover:shadow-xs cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-slate-500" />
                  <span>View Materials</span>
                </button>

                {/* Purple Primary + New Session Button */}
                <button
                  onClick={() => setNewSessionTrigger((prev) => prev + 1)}
                  className="inline-flex items-center gap-2 px-4.5 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-semibold shadow-sm transition-all hover-lift cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Session</span>
                </button>
              </>
            ) : activeTab === "materials" ? (
              <>
                {/* Ask AI Tutor Button */}
                <button
                  onClick={() => handleTabChange("tutor")}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-[#4F46E5] dark:text-indigo-400 border border-slate-200 dark:border-slate-700 text-xs font-semibold shadow-2xs transition-all hover:shadow-xs cursor-pointer"
                >
                  <Bot className="w-4 h-4 text-[#4F46E5] dark:text-indigo-400" />
                  <span>Ask AI Tutor</span>
                </button>

                {/* + Add Material Button */}
                <button
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                  className="inline-flex items-center gap-2 px-4.5 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-semibold shadow-sm transition-all hover-lift cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Material</span>
                  <ChevronDown className="w-3.5 h-3.5 opacity-80" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleTabChange("tutor")}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-[#4F46E5] dark:text-indigo-400 border border-slate-200 dark:border-slate-700 text-xs font-semibold shadow-2xs transition-all hover:shadow-xs cursor-pointer"
                >
                  <Bot className="w-4 h-4 text-[#4F46E5] dark:text-indigo-400" />
                  <span>Ask AI Tutor</span>
                </button>

                <button
                  onClick={() => handleTabChange("quiz")}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-semibold shadow-sm transition-all hover-lift cursor-pointer"
                >
                  <span>Continue Learning</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 2. HORIZONTAL NAVIGATION TABS (MATCHING REFERENCE)                   */}
      {/* ==================================================================== */}
      <div className="border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-6 sm:gap-8 overflow-x-auto scrollbar-none">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => handleTabChange(item.key)}
                className={`relative py-3 flex items-center gap-2 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? "text-[#4F46E5] dark:text-indigo-400 border-b-2 border-[#4F46E5] dark:border-indigo-400 -mb-px"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 border-b-2 border-transparent -mb-px"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-[#4F46E5] dark:text-indigo-400" : "text-slate-400"}`} />
                <span>{item.label}</span>
                {item.count !== undefined && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                      isActive
                        ? "bg-[#4F46E5] text-white"
                        : "bg-indigo-50 dark:bg-indigo-950/50 text-[#4F46E5] dark:text-indigo-400"
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      </>
    )}

      {/* ==================================================================== */}
      {/* 3. MAIN TAB CONTENT                                                  */}
      {/* ==================================================================== */}
      <div>
        {/* ================================================================== */}
        {/* TAB 1: OVERVIEW (2 COLUMNS)                                        */}
        {/* ================================================================== */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT COLUMN: ~68% width (lg:col-span-8) */}
            <div className="lg:col-span-8 space-y-6">
              {/* Row 1: 4 Visual Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                {/* 1. Overall Progress */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800 p-3.5 flex items-center gap-3.5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                  <div className="w-10 h-10 rounded-xl bg-[#EEF2FF] text-[#4F46E5] flex items-center justify-center shrink-0">
                    <Target className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xl sm:text-2xl font-bold font-mono text-[#0F172A] dark:text-white">
                      {displayOverallProgress}
                    </div>
                    <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      Overall Progress
                    </div>
                  </div>
                </div>

                {/* 2. Key Concepts */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800 p-3.5 flex items-center gap-3.5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                  <div className="w-10 h-10 rounded-xl bg-[#E0F2FE] text-[#0284C7] flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xl sm:text-2xl font-bold font-mono text-[#0F172A] dark:text-white">
                      {displayConceptsCount}
                    </div>
                    <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      Key Concepts
                    </div>
                  </div>
                </div>

                {/* 3. Completed */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800 p-3.5 flex items-center gap-3.5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                  <div className="w-10 h-10 rounded-xl bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xl sm:text-2xl font-bold font-mono text-[#0F172A] dark:text-white">
                      {displayCompletedCount}
                    </div>
                    <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      Completed
                    </div>
                  </div>
                </div>

                {/* 4. Need Practice */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800 p-3.5 flex items-center gap-3.5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                  <div className="w-10 h-10 rounded-xl bg-[#FFEDD5] text-[#EA580C] flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xl sm:text-2xl font-bold font-mono text-[#0F172A] dark:text-white">
                      {displayWeakCount}
                    </div>
                    <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      Need Practice
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 2: Next Up Card — only shown when the API returns a real recommendation */}
              {nextUpTitle ? (
                <div className="bg-[#F8FAFF] dark:bg-slate-800/80 border border-indigo-100 dark:border-indigo-900/40 rounded-2xl p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-[#EEF2FF] text-[#4F46E5] flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                      <Compass className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="inline-flex items-center gap-1 text-xs font-bold text-[#4F46E5]">
                        <span>Next Up</span>
                        <span className="text-[10px]">›</span>
                      </div>
                      <h3 className="text-base font-bold text-[#0F172A] dark:text-white mt-0.5">
                        {nextUpTitle.startsWith("Review") ? nextUpTitle : `Review ${nextUpTitle}`}
                      </h3>
                      {nextUpSubtitle && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl leading-relaxed">
                          {nextUpSubtitle}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleTabChange("quiz")}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-semibold shadow-sm transition-all hover-lift shrink-0 cursor-pointer self-start sm:self-auto"
                  >
                    <span>Start Practice</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                // No real recommendation yet — show an honest prompt
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/50 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400 flex items-center justify-center shrink-0 mt-0.5">
                      <Compass className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-400">Next Up</div>
                      <h3 className="text-sm font-semibold text-slate-400 dark:text-slate-500 mt-0.5">
                        No recommendation yet
                      </h3>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        Upload study materials and take a quiz to receive personalised recommendations.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleTabChange("materials")}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all shrink-0 cursor-pointer self-start sm:self-auto"
                  >
                    <span>Add Materials</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Row 3: Key Concepts Section */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#4F46E5]" />
                    <h2 className="text-base font-bold text-[#0F172A] dark:text-white tracking-tight">
                      Key Concepts ({displayConceptsCount})
                    </h2>
                  </div>

                  {/* Filter Dropdown */}
                  <div className="relative inline-block">
                    <select
                      value={conceptFilter}
                      onChange={(e) => setConceptFilter(e.target.value)}
                      className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium pl-3.5 pr-8 py-1.5 rounded-xl shadow-2xs hover:border-slate-300 focus:outline-none cursor-pointer"
                    >
                      <option value="all">All Concepts</option>
                      <option value="in_progress">In Progress</option>
                      <option value="not_started">Not Started</option>
                      <option value="mastered">Mastered</option>
                      <option value="needs_practice">Needs Practice</option>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* Concepts List Card */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700/80 shadow-xs divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden">
                  {filteredConcepts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400 dark:text-slate-500">
                      <Layers className="w-8 h-8 mb-3 opacity-40" />
                      <p className="text-sm font-semibold">
                        {concepts.length === 0 ? "No concepts extracted yet" : "No concepts match the selected filter"}
                      </p>
                      <p className="text-xs mt-1">
                        {concepts.length === 0
                          ? "Upload a study material — key concepts will be extracted automatically."
                          : "Try selecting \"All Concepts\" from the filter above."}
                      </p>
                    </div>
                  ) : filteredConcepts.map((item, index) => {
                    let badgeClass = "bg-slate-100 text-slate-500 border-slate-200";
                    if (item.status === "In Progress") {
                      badgeClass = "bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]";
                    } else if (item.status === "Mastered") {
                      badgeClass = "bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]";
                    } else if (item.status === "Needs Practice") {
                      badgeClass = "bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]";
                    }

                    return (
                      <div
                        key={item.id}
                        className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-700/50 transition-colors group"
                      >
                        {/* Number, Title, and Status Pill */}
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 w-4 text-center shrink-0">
                            {index + 1}
                          </span>
                          <span className="text-xs sm:text-sm font-semibold text-[#0F172A] dark:text-white truncate">
                            {item.name}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border shrink-0 ${badgeClass}`}
                          >
                            {item.status}
                          </span>
                        </div>

                        {/* Progress Bar & Percentage */}
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="w-24 sm:w-32 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden hidden sm:block">
                            <div
                              className="h-full rounded-full bg-[#4F46E5] transition-all duration-500"
                              style={{ width: `${item.score}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 w-8 text-right font-mono">
                            {item.score}%
                          </span>

                          {/* Action Button */}
                          <button
                            onClick={() => handleTabChange("quiz")}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#4F46E5] bg-[#EEF2FF] hover:bg-[#E0E7FF] transition-colors cursor-pointer shrink-0"
                          >
                            <Play className="w-3 h-3 fill-[#4F46E5]" />
                            <span>{item.action}</span>
                          </button>

                          {/* Right Arrow Chevron */}
                          <ChevronRight
                            onClick={() => handleTabChange("quiz")}
                            className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 transition-colors shrink-0 cursor-pointer"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Advisory Learning Insights */}
              {insights.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-700/60">
                    <div className="flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-amber-500" />
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider font-mono">
                        Advisory Learning Insights
                      </h4>
                    </div>
                    <button
                      onClick={handleRefreshInsights}
                      disabled={refreshingInsights}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <RotateCw className={`w-3 h-3 ${refreshingInsights ? "animate-spin" : ""}`} />
                      <span>Refresh</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {insights.slice(0, 4).map((ins) => {
                      let borderAccent = "border-l-[#4F46E5]";
                      let badgeColor = "bg-indigo-50 text-[#4F46E5] border-indigo-200";
                      if (ins.insight_type === "repeated_mistake") {
                        borderAccent = "border-l-rose-500";
                        badgeColor = "bg-rose-50 text-rose-600 border-rose-200";
                      } else if (ins.insight_type === "weak_concept") {
                        borderAccent = "border-l-amber-500";
                        badgeColor = "bg-amber-50 text-amber-600 border-amber-200";
                      } else if (ins.insight_type === "improving_concept") {
                        borderAccent = "border-l-emerald-500";
                        badgeColor = "bg-emerald-50 text-emerald-600 border-emerald-200";
                      }

                      return (
                        <div
                          key={ins.id}
                          className={`p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 border-l-4 ${borderAccent} space-y-1.5 shadow-2xs`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate pr-2">
                              {ins.title}
                            </span>
                            <span className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded-full border ${badgeColor}`}>
                              {ins.insight_type.replace("_", " ")}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                            {ins.content}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: ~32% width (lg:col-span-4) */}
            <div className="lg:col-span-4 space-y-5">
              {/* 1. About this Space Card */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700/80 p-5 shadow-xs space-y-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center shrink-0">
                    <Info className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">About this Space</h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {space?.description ||
                    "This space contains curated materials, quizzes and practice resources to help you master " +
                      (project.name || "ANN, CNN and Transformers") +
                      " at your own pace."}
                </p>
                <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-700/60">
                  <div className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                    <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>
                      {materials.length} {materials.length === 1 ? "material" : "materials"}
                      {quizzes.length > 0 ? ` · ${quizzes.length} ${quizzes.length === 1 ? "quiz" : "quizzes"}` : ""}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Motivational Quote Card */}
              <div className="bg-[#F8FAFC] dark:bg-slate-800/40 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 p-6 text-center shadow-2xs space-y-2 transition-all duration-200 hover:shadow-sm">
                <p className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 italic leading-relaxed">
                  “Consistency today builds the expertise you want tomorrow.”
                </p>
                <div className="w-8 h-0.5 bg-indigo-200 dark:bg-indigo-800 mx-auto mt-2 rounded-full" />
              </div>

              {/* 3. Quick Actions Card */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700/80 p-4 shadow-xs space-y-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                  <Zap className="w-4 h-4 text-[#4F46E5] fill-[#4F46E5]" />
                  <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">Quick Actions</h3>
                </div>
                <button
                  onClick={() => handleTabChange("materials")}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-[#4F46E5] flex items-center justify-center shrink-0">
                      <Plus className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Add Material</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 transition-colors" />
                </button>
                <button
                  onClick={() => handleTabChange("quiz")}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-[#4F46E5] flex items-center justify-center shrink-0">
                      <HelpCircle className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Generate Quiz</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 transition-colors" />
                </button>
                <button
                  onClick={() => handleTabChange("flashcards")}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-[#4F46E5] flex items-center justify-center shrink-0">
                      <BookOpen className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Create Flashcards</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 transition-colors" />
                </button>
                <button
                  onClick={() => handleTabChange("growth")}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-[#4F46E5] flex items-center justify-center shrink-0">
                      <TrendingUp className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">View Progress</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 transition-colors" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* TAB 2: MATERIALS (MATCHING REFERENCE media_1789732481523.png)       */}
        {/* ================================================================== */}
        {activeTab === "materials" && (
          <div className="space-y-6">
            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
              accept=".pdf,application/pdf"
              className="hidden"
            />

            {/* Error banner if upload fails */}
            {uploadError && (
              <div className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* 1. Build your learning library Hero Banner */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#EFF6FF] via-[#F5F3FF] to-[#EEF2FF] dark:from-slate-800/90 dark:via-slate-800/80 dark:to-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 p-6 sm:p-7 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-6 transition-all duration-300 hover:shadow-md">
              {/* Left: Folder Icon & Copy */}
              <div className="flex items-start gap-4 max-w-xl">
                <div className="w-14 h-14 rounded-2xl bg-white/80 dark:bg-slate-700/80 text-[#4F46E5] dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                  <Folder className="w-7 h-7 fill-[#EEF2FF] dark:fill-indigo-950/40 text-[#4F46E5]" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-[#0F172A] dark:text-white tracking-tight">
                    Build your learning library
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                    Upload your notes, textbooks, or lecture slides. We’ll automatically extract key topics and make them easier to learn.
                  </p>
                </div>
              </div>

              {/* Center Floating Documents Graphic Decoration */}
              <div className="hidden xl:flex items-center justify-center shrink-0 pointer-events-none opacity-90 select-none">
                <div className="relative w-28 h-24">
                  <div className="absolute left-0 top-2 w-20 h-20 bg-indigo-200/50 dark:bg-indigo-900/30 rounded-xl rotate-[-8deg]" />
                  <div className="absolute left-3 top-1 w-20 h-20 bg-indigo-300/40 dark:bg-indigo-900/40 rounded-xl rotate-[4deg]" />
                  <div className="absolute left-4 top-0 w-22 h-22 bg-white dark:bg-slate-700 rounded-xl shadow-xs p-2.5 border border-indigo-100 dark:border-slate-600 flex flex-col gap-1.5 rotate-[-2deg]">
                    <div className="w-8 h-1.5 bg-indigo-400 rounded-full" />
                    <div className="w-14 h-1 bg-slate-200 dark:bg-slate-500 rounded-full mt-1" />
                    <div className="w-12 h-1 bg-slate-200 dark:bg-slate-500 rounded-full" />
                    <div className="w-10 h-1 bg-slate-200 dark:bg-slate-500 rounded-full" />
                  </div>
                </div>
              </div>

              {/* Right: Large Dashed Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl px-6 py-5 sm:px-8 sm:py-6 text-center flex flex-col items-center justify-center cursor-pointer transition-all duration-200 min-w-[280px] sm:min-w-[320px] lg:min-w-[340px] group shadow-2xs ${
                  dragOver
                    ? "border-[#4F46E5] bg-white dark:bg-slate-800 scale-[1.02]"
                    : "border-indigo-200 dark:border-indigo-800/80 bg-white/70 dark:bg-slate-800/70 hover:bg-white dark:hover:bg-slate-800 hover:border-[#4F46E5] hover:shadow-xs"
                }`}
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-[#4F46E5] dark:text-indigo-400 mb-1.5 group-hover:-translate-y-0.5 transition-transform duration-200">
                  {uploading ? (
                    <Loader2 className="w-6 h-6 animate-spin text-[#4F46E5]" />
                  ) : (
                    <UploadCloud className="w-6 h-6" />
                  )}
                </div>
                <div className="text-xs font-bold text-[#0F172A] dark:text-white">
                  {uploading ? "Uploading & vectorizing..." : "Click or drag & drop files here"}
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  PDF, PPT, DOCX (up to 20MB)
                </div>
              </div>
            </div>

            {/* 2. Materials Header & Filtering Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <h3 className="text-base font-bold text-[#0F172A] dark:text-white tracking-tight">
                Materials ({sortedMaterials.length})
              </h3>

              <div className="flex items-center gap-3">
                {/* Search Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={materialSearch}
                    onChange={(e) => setMaterialSearch(e.target.value)}
                    placeholder="Search materials..."
                    className="w-44 sm:w-56 pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-[#4F46E5] shadow-2xs transition-colors"
                  />
                  {materialSearch && (
                    <button
                      onClick={() => setMaterialSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Sort Dropdown */}
                <div className="relative inline-block">
                  <select
                    value={materialSort}
                    onChange={(e) => setMaterialSort(e.target.value as "recent" | "name" | "pages")}
                    className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium pl-3.5 pr-8 py-1.5 rounded-xl shadow-2xs hover:border-slate-300 focus:outline-none cursor-pointer"
                  >
                    <option value="recent">Recently Added</option>
                    <option value="name">Name (A-Z)</option>
                    <option value="pages">Most Pages</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Materials List (Wide Horizontal Cards) */}
            {materialsLoading && materials.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-slate-400 text-xs">
                <Loader2 className="w-5 h-5 animate-spin mr-2 text-[#4F46E5]" />
                Loading document library...
              </div>
            ) : sortedMaterials.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700/80">
                <FileText className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm font-semibold">No materials yet</p>
                <p className="text-xs mt-1">Drag &amp; drop a PDF above or click "Add Material" to get started.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedMaterials.map((m) => (
                  <div
                    key={m.id}
                    className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700/80 p-4 sm:p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                  >
                    {/* Left: Soft Red/Pink PDF Badge + Filename + Pages/Date + Category Tags */}
                    <div className="flex items-start sm:items-center gap-4 min-w-0">
                      <div className="w-12 h-12 rounded-2xl bg-[#FFF1F2] dark:bg-rose-950/40 text-[#E11D48] flex flex-col items-center justify-center shrink-0 shadow-2xs">
                        <FileText className="w-5 h-5" />
                        <span className="text-[9px] font-extrabold tracking-wider mt-0.5">PDF</span>
                      </div>

                      <div className="min-w-0">
                        <h4 className="text-sm sm:text-base font-bold text-[#0F172A] dark:text-white group-hover:text-[#4F46E5] transition-colors truncate">
                          {m.filename}
                        </h4>

                        <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-medium">
                          <span>
                            {m.page_count !== null && m.page_count !== undefined
                              ? `${m.page_count} pages`
                              : "—"}
                          </span>
                          <span>·</span>
                          <span>
                            Added{" "}
                            {new Date(m.created_at).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        </div>

                        {/* Category Tags — only shown when real concept tags exist */}
                        {m.tags && m.tags.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap mt-2">
                            {m.tags.map((tag, tIdx) => (
                              <span
                                key={tIdx}
                                className="bg-[#F1F5F9] dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 text-[11px] font-medium px-2.5 py-0.5 rounded-lg"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Status Badge + View Button + Three-dot Menu */}
                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                      {/* Status Badge */}
                      {m.status === "ready" ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#ECFDF5] dark:bg-emerald-950/40 border border-[#A7F3D0] dark:border-emerald-800 text-[#059669] dark:text-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#059669]" />
                          <span>Indexed</span>
                        </span>
                      ) : m.status === "processing" ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-[#4F46E5] border border-indigo-200">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#4F46E5]" />
                          <span>Processing...</span>
                        </span>
                      ) : m.status === "queued" ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-600 border border-purple-200">
                          <Clock className="w-3.5 h-3.5 text-purple-500" />
                          <span>Queued</span>
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-200">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                            <span>Failed</span>
                          </span>
                          <button
                            onClick={() => handleRetry(m.id)}
                            disabled={retryingId === m.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            <RotateCw className={`w-3 h-3 ${retryingId === m.id ? "animate-spin" : ""}`} />
                            <span>Retry</span>
                          </button>
                        </div>
                      )}

                      {/* View Button */}
                      <button
                        onClick={() => setViewingMaterial(m)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800/80 bg-white dark:bg-slate-800 hover:bg-indigo-50/60 dark:hover:bg-slate-700 text-[#4F46E5] dark:text-indigo-400 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </button>

                      {/* Three-dot Action Menu */}
                      <div className="relative">
                        <button
                          onClick={() => setActiveMenuId(activeMenuId === m.id ? null : m.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {activeMenuId === m.id && (
                          <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-100 dark:border-slate-700 py-1.5 z-20 animate-in fade-in zoom-in-95 duration-150">
                            <button
                              onClick={() => {
                                setViewingMaterial(m);
                                setActiveMenuId(null);
                              }}
                              className="w-full px-3.5 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5 text-slate-400" />
                              <span>View Details</span>
                            </button>
                            <button
                              onClick={() => {
                                handleRetry(m.id);
                                setActiveMenuId(null);
                              }}
                              className="w-full px-3.5 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 cursor-pointer"
                            >
                              <RotateCw className="w-3.5 h-3.5 text-slate-400" />
                              <span>Re-index Vector</span>
                            </button>
                            <button
                              onClick={() => {
                                handleTabChange("tutor");
                                setActiveMenuId(null);
                              }}
                              className="w-full px-3.5 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 cursor-pointer"
                            >
                              <Bot className="w-3.5 h-3.5 text-indigo-500" />
                              <span>Ask AI Tutor</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 3. Tip Section (Matching Reference Exactly) */}
            <div className="bg-[#FFFDF5] dark:bg-amber-950/20 rounded-2xl border border-amber-200/70 dark:border-amber-900/40 p-4 sm:p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs transition-all duration-200 hover:shadow-xs">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-full bg-[#FEF3C7] dark:bg-amber-900/50 text-[#D97706] flex items-center justify-center shrink-0 shadow-2xs">
                  <Lightbulb className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Tip
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Add more materials like lecture slides or notes to get personalized quizzes and flashcards.
                  </p>
                </div>
              </div>

              <button
                onClick={() => handleTabChange("quiz")}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800/80 bg-white dark:bg-slate-800 hover:bg-indigo-50/60 dark:hover:bg-slate-700 text-[#4F46E5] dark:text-indigo-400 text-xs font-semibold shadow-2xs transition-colors cursor-pointer shrink-0 self-start sm:self-auto"
              >
                <span>Learn More</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Document Details Modal */}
            {viewingMaterial && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl max-w-lg w-full p-6 space-y-4 animate-in zoom-in-95 duration-200">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-xs sm:max-w-sm">
                          {viewingMaterial.filename}
                        </h3>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {viewingMaterial.page_count ? `${viewingMaterial.page_count} pages · ` : ""}
                          RAG Vector Store Indexed
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setViewingMaterial(null)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-600 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                      <span>Status</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Indexed &amp; Chunked
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                      <span>Vector Embedding</span>
                      <span className="font-mono text-slate-700 dark:text-slate-300">pgvector (cosine)</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                      <span>Added Date</span>
                      <span className="text-slate-700 dark:text-slate-300">
                        {new Date(viewingMaterial.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {viewingMaterial.tags && viewingMaterial.tags.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Extracted Topics:</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {viewingMaterial.tags.map((t, idx) => (
                          <span
                            key={idx}
                            className="bg-[#F1F5F9] dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 text-[11px] font-medium px-2.5 py-0.5 rounded-lg"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2.5 pt-2">
                    <button
                      onClick={() => setViewingMaterial(null)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => {
                        setViewingMaterial(null);
                        handleTabChange("tutor");
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#4F46E5] hover:bg-[#4338CA] text-white shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <Bot className="w-3.5 h-3.5" />
                      <span>Ask AI Tutor</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================== */}
        {/* TAB 3: AI TUTOR                                                    */}
        {/* ================================================================== */}
        {activeTab === "tutor" && projectId && (
          <TutorTab
            projectId={projectId}
            newSessionTrigger={newSessionTrigger}
            onNavigateTab={(tab) => handleTabChange(tab as TabKey)}
          />
        )}

        {/* ================================================================== */}
        {/* TAB 4: ADAPTIVE QUIZ                                               */}
        {/* ================================================================== */}
        {activeTab === "quiz" && projectId && (
          <QuizTab
            projectId={projectId}
            projectMastery={masteryData?.overall_average_mastery ?? undefined}
            newQuizTrigger={newQuizTrigger}
            onNavigateTab={(tab) => setActiveTab(tab as TabKey)}
          />
        )}

        {/* ================================================================== */}
        {/* TAB 5: PROGRESS / GROWTH                                           */}
        {/* ================================================================== */}
        {activeTab === "growth" && projectId && (
          <GrowthTab
            projectId={projectId}
            project={project}
            spaceName={space?.name}
            spaceId={space?.id}
            onNavigateTab={(tab) => handleTabChange(tab as TabKey)}
          />
        )}

        {/* ================================================================== */}
        {/* TAB 6: ANALYTICS                                                   */}
        {/* ================================================================== */}
        {activeTab === "analytics" && projectId && (
          <AnalyticsTab
            projectId={projectId}
            project={project}
            spaceName={space?.name}
            spaceId={space?.id}
            onNavigateTab={(tab) => handleTabChange(tab as TabKey)}
          />
        )}

        {/* ================================================================== */}
        {/* TAB 7: FLASHCARDS                                                  */}
        {/* ================================================================== */}
        {activeTab === "flashcards" && projectId && (
          <FlashcardTab
            projectId={projectId}
            concepts={concepts}
            onNavigateTab={(tab) => handleTabChange(tab as TabKey)}
          />
        )}
      </div>
    </div>
  );
};
