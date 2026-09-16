import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock,
  File,
  FileText,
  HelpCircle,
  Loader2,
  RotateCw,
  Sparkles,
  Target,
  TrendingUp,
  UploadCloud,
} from "lucide-react";
import {
  getProjectApi,
  getProjectMasteryApi,
  getProjectMaterialsApi,
  getProjectRecommendationsApi,
  retryMaterialApi,
  uploadMaterialApi,
} from "@/lib/api";
import { MasteryListResponse, Material, Project, Recommendation } from "@/types";
import { TutorTab } from "@/components/TutorTab";
import { QuizTab } from "@/components/QuizTab";
import { GrowthTab } from "@/components/GrowthTab";
import { RecommendationCard } from "@/components/RecommendationCard";
import { AnalyticsTab } from "./ProjectDetailPage/AnalyticsTab";

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

  // Materials Tab State
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Phase 5 State
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [masteryData, setMasteryData] = useState<MasteryListResponse | null>(null);

  // Fetch project details, recommendations, and mastery
  useEffect(() => {
    if (!projectId) return;
    const fetchProjectAndMastery = async () => {
      try {
        setLoading(true);
        const [projectData, recsData, mastery] = await Promise.all([
          getProjectApi(projectId),
          getProjectRecommendationsApi(projectId).catch(() => []),
          getProjectMasteryApi(projectId).catch(() => null),
        ]);
        setProject(projectData);
        setRecommendations(recsData);
        setMasteryData(mastery);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load project";
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    fetchProjectAndMastery();
  }, [projectId]);

  // Fetch materials for project
  const fetchMaterials = async (silent: boolean = false) => {
    if (!projectId) return;
    if (!silent) setMaterialsLoading(true);
    try {
      const data = await getProjectMaterialsApi(projectId);
      setMaterials(data);
    } catch (err: unknown) {
      if (!silent) {
        console.error("Failed to load materials:", err);
      }
    } finally {
      if (!silent) setMaterialsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "materials" && projectId) {
      fetchMaterials();
    }
  }, [activeTab, projectId]);

  // Status Polling: Poll every 2.5s while any material is queued or processing
  useEffect(() => {
    if (activeTab !== "materials" || !projectId) return;

    const hasPending = materials.some(
      (m) => m.status === "queued" || m.status === "processing"
    );

    if (!hasPending) return;

    const intervalId = setInterval(() => {
      fetchMaterials(true);
    }, 2500);

    return () => clearInterval(intervalId);
  }, [materials, activeTab, projectId]);

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
      // Optimistically prepend to materials list
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

            <div className="flex items-center gap-3">
              <span className="px-3 py-1.5 rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-xs text-indigo-300 flex items-center gap-2 font-mono">
                <Target className="w-3.5 h-3.5 text-indigo-400" />
                <span>Phase 5: Mastery &amp; Growth</span>
              </span>
            </div>
          </div>

          {/* Learning Goal Banner */}
          <div className="mt-4 pt-4 border-t border-gray-800/80 flex items-start gap-3 text-xs">
            <div className="mt-0.5 p-1 rounded-md bg-indigo-500/10 text-indigo-400">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-semibold text-gray-300">Learning Goal: </span>
              <span className="text-gray-400">{project.learning_goal}</span>
            </div>
          </div>

          {/* Phase 5 Mastery Overview */}
          {masteryData && masteryData.assessed_count > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-800/60 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-gray-400">Average Mastery: </span>
                  <span className="font-bold text-indigo-300">
                    {masteryData.overall_average_mastery !== null
                      ? `${masteryData.overall_average_mastery}%`
                      : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Assessed: </span>
                  <span className="font-semibold text-gray-200">
                    {masteryData.assessed_count} / {masteryData.total_concepts} concepts
                  </span>
                </div>
              </div>
              <button
                onClick={() => setActiveTab("growth")}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-1 transition-colors"
              >
                <span>View Growth Trajectory &rarr;</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Recommended Next Action */}
      {recommendations.length > 0 && (
        <RecommendationCard
          recommendation={recommendations[0]}
          projectId={project.id}
          onDismiss={(recId) =>
            setRecommendations((prev) => prev.filter((r) => r.id !== recId))
          }
        />
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-800 overflow-x-auto no-scrollbar">
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
              {tab.key === "materials" && materials.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-indigo-500/20 text-indigo-300 font-mono">
                  {materials.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Materials Tab */}
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
                ? "border-indigo-500 bg-indigo-500/10"
                : "border-gray-800 bg-gray-900/30 hover:border-gray-700 hover:bg-gray-900/50"
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
            <div className="p-3.5 rounded-2xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 mb-3">
              {uploading ? (
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
              ) : (
                <UploadCloud className="w-6 h-6" />
              )}
            </div>
            <h3 className="text-sm font-semibold text-white">
              {uploading ? "Uploading PDF document..." : "Click or drag & drop PDF to upload"}
            </h3>
            <p className="text-xs text-gray-400 mt-1 max-w-sm">
              Upload textbook chapters, papers, or lecture slides (PDF up to 20MB).
              Ingestion, page extraction, and pgvector vectorization happen in the background.
            </p>
          </div>

          {uploadError && (
            <div className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          {/* Materials List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white tracking-tight">
                Project Learning Materials
              </h2>
              {materials.some((m) => m.status === "queued" || m.status === "processing") && (
                <span className="flex items-center gap-1.5 text-[11px] font-mono text-indigo-400">
                  <Loader2 className="w-3 h-3 animate-spin" /> Auto-refreshing status...
                </span>
              )}
            </div>

            {materialsLoading && materials.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-gray-500 text-xs">
                <Loader2 className="w-5 h-5 animate-spin mr-2 text-indigo-500" />
                Loading materials...
              </div>
            ) : materials.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-950/40 p-12 text-center flex flex-col items-center justify-center">
                <File className="w-8 h-8 text-gray-600 mb-2" />
                <p className="text-xs text-gray-400 font-medium">No materials uploaded yet</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Upload your first PDF above to enable AI tutoring and RAG search.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {materials.map((m) => {
                  return (
                    <div
                      key={m.id}
                      className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 transition-all hover:border-gray-700/80"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start sm:items-center gap-3 min-w-0">
                          <div className="p-2.5 rounded-xl bg-gray-800/60 text-gray-300 flex-shrink-0">
                            <FileText className="w-5 h-5 text-indigo-400" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-white truncate">
                              {m.filename}
                            </h4>
                            <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-0.5">
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
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 border border-amber-500/20 text-amber-300">
                              <Clock className="w-3 h-3 text-amber-400" />
                              <span>Queued</span>
                            </span>
                          )}

                          {m.status === "processing" && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                              <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                              <span>Processing...</span>
                            </span>
                          )}

                          {m.status === "ready" && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>Ready</span>
                            </span>
                          )}

                          {m.status === "failed" && (
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 border border-rose-500/20 text-rose-300">
                                <AlertCircle className="w-3 h-3 text-rose-400" />
                                <span>Failed</span>
                              </span>
                              <button
                                onClick={() => handleRetry(m.id)}
                                disabled={retryingId === m.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 border border-gray-700 transition-colors disabled:opacity-50"
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

                      {/* Failure Reason Banner if Failed */}
                      {m.status === "failed" && m.failure_reason && (
                        <div className="mt-3 p-2.5 rounded-lg bg-rose-950/30 border border-rose-800/30 text-rose-300 text-[11px]">
                          <span className="font-semibold">Failure reason: </span>
                          <span>{m.failure_reason}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: AI Tutor — Phase 3 Grounded RAG */}
      {activeTab === "tutor" && projectId && (
        <TutorTab projectId={projectId} />
      )}

      {/* Tab 3: Adaptive Quiz Placeholder (Phase 4) */}
      {/* Tab 3: Adaptive Quiz (Phase 4) */}
      {activeTab === "quiz" && projectId && <QuizTab projectId={projectId} />}

      {/* Tab 4: Growth Analysis — Phase 5 */}
      {activeTab === "growth" && projectId && <GrowthTab projectId={projectId} />}

      {/* Tab 5: Analytics — Phase 6 SQL Aggregations */}
      {activeTab === "analytics" && projectId && (
        <AnalyticsTab projectId={projectId} />
      )}
    </div>
  );
};
