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
  Clock,
  File,
  FileText,
  HelpCircle,
  Layers,
  LayoutDashboard,
  Loader2,
  RotateCw,
  Sparkles,
  Target,
  TrendingUp,
  UploadCloud,
  Lightbulb,
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
}

const navItems: NavItem[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "materials", label: "Materials", icon: FileText },
  { key: "tutor", label: "AI Tutor", icon: Bot },
  { key: "quiz", label: "Adaptive Quiz", icon: HelpCircle },
  { key: "flashcards", label: "Flashcards", icon: BookOpen },
  { key: "growth", label: "Growth", icon: TrendingUp },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
];

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
      <div className="flex flex-col items-center justify-center py-24 text-text-muted">
        <Loader2 className="w-8 h-8 animate-spin text-accent mb-3" />
        <p className="text-sm">Loading project workspace...</p>
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
          className="inline-flex items-center gap-2 text-xs text-accent hover:text-accent-hover font-medium"
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

  return (
    <div className="space-y-6">
      {/* ==================================================================== */}
      {/* 1. PROJECT HEADER                                                    */}
      {/* ==================================================================== */}
      <div>
        <Link
          to={`/spaces/${project.space_id}`}
          className="inline-flex items-center gap-2 text-xs text-text-muted hover:text-text-primary transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Space</span>
        </Link>

        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="p-2.5 rounded-xl bg-accent/10 text-accent border border-accent/20 flex-shrink-0">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-accent font-bold">
                    Project Workspace
                  </span>
                  <span className="text-text-muted">•</span>
                  <span className="text-[11px] text-text-muted font-mono">
                    {averageMastery !== null ? `${averageMastery}% Mastery` : "Unassessed"}
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight mt-0.5">
                  {project.name}
                </h1>
                {project.description && (
                  <p className="text-xs text-text-secondary mt-1">{project.description}</p>
                )}
              </div>
            </div>

            {/* Quick action button */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                onClick={() => handleTabChange("tutor")}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors shadow-sm"
              >
                <Bot className="w-3.5 h-3.5" />
                <span>Ask AI Tutor</span>
              </button>
            </div>
          </div>

          {/* Learning Goal Banner */}
          {project.learning_goal && (
            <div className="mt-4 pt-3.5 border-t border-border flex items-start gap-2.5 text-xs">
              <Sparkles className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-text-primary">Learning Goal: </span>
                <span className="text-text-secondary italic">"{project.learning_goal}"</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 2. SPLIT WORKSPACE: LEFT SUB-SIDEBAR + MAIN CONTENT                  */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left Sub-Sidebar (3 cols on md / ~220px) */}
        <div className="md:col-span-3 lg:col-span-3 rounded-2xl border border-border bg-surface p-2.5 space-y-1 shadow-sm">
          <div className="px-3 py-2 text-[10px] font-mono font-semibold uppercase tracking-wider text-text-muted">
            Workspace Nav
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => handleTabChange(item.key)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? "bg-accent-soft text-accent border border-accent/30 font-semibold shadow-sm"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-muted border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={`w-4 h-4 ${
                      isActive ? "text-accent" : "text-text-muted"
                    }`}
                  />
                  <span>{item.label}</span>
                </div>

                {item.key === "materials" && materials.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-accent/15 text-accent border border-accent/25">
                    {materials.length}
                  </span>
                )}
                {item.key === "quiz" && quizzes.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-500/25">
                    {quizzes.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right Main Content Pane (9 cols on md) */}
        <div className="md:col-span-9 lg:col-span-9 space-y-6">
          {/* ================================================================ */}
          {/* TAB 1: OVERVIEW                                                  */}
          {/* ================================================================ */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Row 1: Project Overview KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Overall Mastery */}
                <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
                  <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider font-mono">
                    Overall Mastery
                  </span>
                  <div className="mt-2 text-2xl font-bold text-text-primary font-mono">
                    {averageMastery !== null ? `${averageMastery}%` : "—"}
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5">Assessed progress</p>
                </div>

                {/* Total Concepts */}
                <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
                  <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider font-mono">
                    Total Concepts
                  </span>
                  <div className="mt-2 text-2xl font-bold text-accent font-mono">
                    {totalConceptsCount}
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5">Extracted from notes</p>
                </div>

                {/* Completed Concepts */}
                <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
                  <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider font-mono">
                    Completed
                  </span>
                  <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    {completedConceptsCount}
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5">Mastery &ge; 70%</p>
                </div>

                {/* Weak Topics */}
                <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
                  <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider font-mono">
                    Weak Topics
                  </span>
                  <div className="mt-2 text-2xl font-bold text-amber-500 dark:text-amber-400 font-mono">
                    {weakTopicsCount}
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5">Needs practice</p>
                </div>
              </div>

              {/* Continue Learning Action Card */}
              {recommendations.length > 0 && (
                <div className="p-4 rounded-xl border border-accent/25 bg-accent-soft/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-accent/15 text-accent border border-accent/25">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] font-mono text-accent uppercase font-bold tracking-wider">
                        Continue Learning
                      </span>
                      <h4 className="text-xs sm:text-sm font-semibold text-text-primary mt-0.5">
                        Your next recommended action: Review {recommendations[0].target_concept_name || recommendations[0].title}
                      </h4>
                      <p className="text-[11px] text-text-secondary mt-0.5">
                        {recommendations[0].reasoning || recommendations[0].body || "Based on your latest assessment"}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleTabChange("quiz")}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold self-start sm:self-auto transition-colors shadow-sm"
                  >
                    <span>Start Practice</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Advisory Learning Insights (Background Intelligence) */}
              <div className="p-4 rounded-xl border border-border bg-surface space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
                      <Lightbulb className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider font-mono">
                        Advisory Learning Insights
                      </h4>
                      <p className="text-[11px] text-text-secondary">
                        Observations &amp; study suggestions based on your practice
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleRefreshInsights}
                    disabled={refreshingInsights}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-surface-muted hover:bg-surface text-text-secondary hover:text-text-primary border border-border transition-colors disabled:opacity-50"
                  >
                    <RotateCw className={`w-3 h-3 ${refreshingInsights ? "animate-spin" : ""}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                {insights.length === 0 ? (
                  <div className="py-4 text-center text-text-muted text-xs">
                    No learning insights generated yet. Complete quizzes or ask the AI Tutor to generate personalized study patterns!
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    {insights.slice(0, 4).map((ins) => {
                      let badgeColor = "bg-accent/10 text-accent border-accent/20";
                      if (ins.insight_type === "repeated_mistake") {
                        badgeColor = "bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/20";
                      } else if (ins.insight_type === "weak_concept") {
                        badgeColor = "bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20";
                      } else if (ins.insight_type === "improving_concept") {
                        badgeColor = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20";
                      }

                      return (
                        <div
                          key={ins.id}
                          className="p-3 rounded-xl bg-surface-muted/60 border border-border space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-text-primary truncate pr-2">
                              {ins.title}
                            </span>
                            <span
                              className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-full border ${badgeColor}`}
                            >
                              {ins.insight_type.replace("_", " ")}
                            </span>
                          </div>
                          <p className="text-[11px] text-text-secondary line-clamp-2 leading-relaxed">
                            {ins.content}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Key Concepts List */}
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-accent" />
                    <h3 className="text-sm font-bold text-text-primary tracking-tight">
                      Key Concepts ({masteryData?.masteries?.length || concepts.length})
                    </h3>
                  </div>
                  <button
                    onClick={() => handleTabChange("growth")}
                    className="text-xs text-accent hover:text-accent-hover font-medium inline-flex items-center gap-1"
                  >
                    <span>Growth Analysis</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

                {(!masteryData || masteryData.masteries.length === 0) && concepts.length === 0 ? (
                  <div className="py-8 text-center text-text-muted text-xs">
                    No concepts extracted yet. Upload materials in the Materials tab to begin.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(masteryData?.masteries || []).slice(0, 6).map((c) => {
                      const score = c.mastery_score !== null ? Math.round(c.mastery_score) : null;
                      const hasEvidence = c.evidence_count > 0;
                      const isLowEvidence = hasEvidence && c.evidence_count < 3;
                      const isMastered = score !== null && score >= 75;
                      const isBuilding = score !== null && score >= 50 && score < 75;
                      const isNeedsPractice = score !== null && score < 50 && !isLowEvidence;

                      let statusLabel = "Not Yet Assessed";
                      let badgeClass = "bg-surface-muted text-text-muted border-border";
                      let barColor = "bg-slate-300 dark:bg-slate-700";

                      if (!hasEvidence || score === null) {
                        statusLabel = "Not Yet Assessed";
                        badgeClass = "bg-surface-muted text-text-muted border-border";
                        barColor = "bg-slate-300 dark:bg-slate-700";
                      } else if (isLowEvidence) {
                        statusLabel = "Early Evidence";
                        badgeClass = "bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-500/20";
                        barColor = "bg-blue-500";
                      } else if (isNeedsPractice) {
                        statusLabel = "Needs Practice";
                        badgeClass = "bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20";
                        barColor = "bg-amber-500";
                      } else if (isBuilding) {
                        statusLabel = "Building Understanding";
                        badgeClass = "bg-sky-500/10 text-sky-600 dark:text-sky-300 border-sky-500/20";
                        barColor = "bg-sky-500";
                      } else if (isMastered) {
                        statusLabel = "Mastered";
                        badgeClass = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20";
                        barColor = "bg-emerald-500";
                      }

                      return (
                        <div
                          key={c.concept_id}
                          className="p-3 rounded-xl bg-surface-muted/60 border border-border space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-text-primary truncate mr-2">
                              {c.concept_name}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${badgeClass}`}>
                                {statusLabel}
                              </span>
                              <span className="font-mono text-text-primary font-bold w-12 text-right">
                                {score !== null ? `${score}%` : "—"}
                              </span>
                            </div>
                          </div>

                          <div className="w-full h-1.5 bg-surface-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                              style={{ width: `${score !== null ? score : 0}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* TAB 2: MATERIALS                                                 */}
          {/* ================================================================ */}
          {activeTab === "materials" && (
            <div className="space-y-6">
              {/* Upload Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`rounded-2xl border-2 border-dashed transition-all p-8 text-center flex flex-col items-center justify-center cursor-pointer ${
                  dragOver
                    ? "border-accent bg-accent/10"
                    : "border-border bg-surface-muted/30 hover:border-accent/50 hover:bg-surface-muted/60"
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
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
                <div className="p-3.5 rounded-2xl bg-accent/10 text-accent border border-accent/20 mb-3">
                  {uploading ? (
                    <Loader2 className="w-6 h-6 animate-spin text-accent" />
                  ) : (
                    <UploadCloud className="w-6 h-6" />
                  )}
                </div>
                <h3 className="text-sm font-semibold text-text-primary">
                  {uploading ? "Uploading PDF document..." : "Click or drag & drop PDF to upload"}
                </h3>
                <p className="text-xs text-text-secondary mt-1 max-w-sm">
                  Upload textbook chapters, notes, or lecture slides (PDF up to 20MB).
                  Background OCR, chunking, and pgvector vectorization happen automatically.
                </p>
              </div>

              {uploadError && (
                <div className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Materials List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-text-primary tracking-tight">
                    Uploaded Learning Materials
                  </h3>
                  {materials.some((m) => m.status === "queued" || m.status === "processing") && (
                    <span className="flex items-center gap-1.5 text-[11px] font-mono text-accent">
                      <Loader2 className="w-3 h-3 animate-spin" /> Processing document...
                    </span>
                  )}
                </div>

                {materialsLoading && materials.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-text-muted text-xs">
                    <Loader2 className="w-5 h-5 animate-spin mr-2 text-accent" />
                    Loading materials...
                  </div>
                ) : materials.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-surface-muted/30 p-10 text-center flex flex-col items-center justify-center">
                    <File className="w-8 h-8 text-text-muted mb-2" />
                    <p className="text-xs text-text-secondary font-medium">No materials uploaded yet</p>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      Upload your first PDF above to enable AI tutoring and RAG search.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {materials.map((m) => (
                      <div
                        key={m.id}
                        className="rounded-xl border border-border bg-surface p-4 transition-all hover:border-accent/40 shadow-sm"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-start sm:items-center gap-3 min-w-0">
                            <div className="p-2.5 rounded-xl bg-accent/10 text-accent border border-accent/20 flex-shrink-0">
                              <FileText className="w-5 h-5 text-accent" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-sm font-semibold text-text-primary truncate">
                                {m.filename}
                              </h4>
                              <div className="flex items-center gap-3 text-[11px] text-text-muted mt-0.5">
                                <span>
                                  {m.page_count !== null && m.page_count !== undefined
                                    ? `${m.page_count} page${m.page_count === 1 ? "" : "s"}`
                                    : "Calculating pages..."}
                                </span>
                                <span>•</span>
                                <span>
                                  {new Date(m.created_at).toLocaleDateString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Status Badge & Actions */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {m.status === "queued" && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-300">
                                <Clock className="w-3 h-3 text-purple-500" />
                                <span>Queued</span>
                              </span>
                            )}

                            {m.status === "processing" && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-accent/10 border border-accent/20 text-accent">
                                <Loader2 className="w-3 h-3 animate-spin text-accent" />
                                <span>Processing...</span>
                              </span>
                            )}

                            {m.status === "ready" && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-300">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                <span>Ready</span>
                              </span>
                            )}

                            {m.status === "failed" && (
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-300">
                                  <AlertCircle className="w-3 h-3 text-rose-500" />
                                  <span>Failed</span>
                                </span>
                                <button
                                  onClick={() => handleRetry(m.id)}
                                  disabled={retryingId === m.id}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-surface-muted text-text-secondary hover:text-text-primary border border-border transition-colors disabled:opacity-50"
                                >
                                  <RotateCw
                                    className={`w-3 h-3 ${
                                      retryingId === m.id ? "animate-spin" : ""
                                    }`}
                                  />
                                  <span>Retry</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* TAB 3: AI TUTOR                                                  */}
          {/* ================================================================ */}
          {activeTab === "tutor" && projectId && <TutorTab projectId={projectId} />}

          {/* ================================================================ */}
          {/* TAB 4: ADAPTIVE QUIZ                                             */}
          {/* ================================================================ */}
          {activeTab === "quiz" && projectId && <QuizTab projectId={projectId} />}

          {/* ================================================================ */}
          {/* TAB 5: GROWTH                                                    */}
          {/* ================================================================ */}
          {activeTab === "growth" && projectId && (
            <GrowthTab
              projectId={projectId}
              project={project}
              spaceName={space?.name}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

          {/* ================================================================ */}
          {/* TAB 6: ANALYTICS                                                 */}
          {/* ================================================================ */}
          {activeTab === "analytics" && projectId && (
            <AnalyticsTab
              projectId={projectId}
              project={project}
              spaceName={space?.name}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

          {/* ================================================================ */}
          {/* TAB 7: FLASHCARDS                                                */}
          {/* ================================================================ */}
          {activeTab === "flashcards" && projectId && (
            <FlashcardTab
              projectId={projectId}
              concepts={concepts}
            />
          )}
        </div>
      </div>
    </div>
  );
};
