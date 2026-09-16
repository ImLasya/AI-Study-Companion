import {
  AdminActivityFeedResponse,
  AdminAIUsageResponse,
  AdminJobHealthResponse,
  AdminOverviewResponse,
  AdminUserDetailResponse,
  AdminUserListResponse,
  AIEvaluationSummaryResponse,
  Concept,
  DatabaseHealthStatus,
  GlobalAnalyticsResponse,
  GrowthSummary,
  HealthStatus,
  MasteryListResponse,
  Material,
  Project,
  ProjectAnalyticsResponse,
  Quiz,
  QuizAnswer,
  QuizAttempt,
  QuizResult,
  ReadyStatus,
  Recommendation,
  Space,
  User,
} from "@/types";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:8000/api/v1";

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 8000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
    const defaultHeaders: Record<string, string> = isFormData
      ? {}
      : { "Content-Type": "application/json" };

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      credentials: "include", // Transmit httpOnly auth cookies
      headers: {
        ...defaultHeaders,
        ...(options.headers || {}),
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ----------------------------------------------------------------------------
// Health Probes
// ----------------------------------------------------------------------------
export async function getBackendHealth(): Promise<{
  data: HealthStatus | null;
  error: string | null;
}> {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/health`, {}, 2500);
    if (!response.ok) {
      return { data: null, error: `Backend responded with HTTP ${response.status}` };
    }
    const data: HealthStatus = await response.json();
    return { data, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return { data: null, error: message };
  }
}

export async function getBackendReadiness(): Promise<{
  data: ReadyStatus | null;
  error: string | null;
}> {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/health/ready`, {}, 2500);
    const data: ReadyStatus = await response.json();
    return { data, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return { data: null, error: message };
  }
}

export async function getDatabaseHealth(): Promise<{
  data: DatabaseHealthStatus | null;
  error: string | null;
}> {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/health/db`, {}, 2500);
    const data: DatabaseHealthStatus = await response.json();
    return { data, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return { data: null, error: message };
  }
}

// ----------------------------------------------------------------------------
// Authentication API
// ----------------------------------------------------------------------------
export async function signupApi(payload: {
  email: string;
  password: string;
  full_name?: string;
}): Promise<User> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/auth/signup`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to register account");
  }
  const body = await res.json();
  return body.user;
}

export async function loginApi(payload: {
  email: string;
  password: string;
}): Promise<User> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Invalid email or password");
  }
  const body = await res.json();
  return body.user;
}

export async function logoutApi(): Promise<void> {
  await fetchWithTimeout(`${API_BASE_URL}/auth/logout`, {
    method: "POST",
  });
}

export async function getMeApi(): Promise<User | null> {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/auth/me`, {
      method: "GET",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// Spaces API
// ----------------------------------------------------------------------------
export async function listSpacesApi(): Promise<Space[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/spaces`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to fetch spaces");
  }
  return await res.json();
}

export async function createSpaceApi(payload: {
  name: string;
  description?: string;
}): Promise<Space> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/spaces`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create space");
  }
  return await res.json();
}

export async function getSpaceApi(spaceId: string): Promise<Space> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/spaces/${spaceId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Space not found");
  }
  return await res.json();
}

export async function deleteSpaceApi(spaceId: string): Promise<void> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/spaces/${spaceId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to delete space");
  }
}

// ----------------------------------------------------------------------------
// Projects API
// ----------------------------------------------------------------------------
export async function listProjectsInSpaceApi(spaceId: string): Promise<Project[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/spaces/${spaceId}/projects`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to fetch projects");
  }
  return await res.json();
}

export async function createProjectInSpaceApi(
  spaceId: string,
  payload: {
    name: string;
    learning_goal: string;
    description?: string;
  }
): Promise<Project> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/spaces/${spaceId}/projects`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create project");
  }
  return await res.json();
}

export async function getProjectApi(projectId: string): Promise<Project> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/projects/${projectId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Project not found");
  }
  return await res.json();
}

export async function deleteProjectApi(projectId: string): Promise<void> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/projects/${projectId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to delete project");
  }
}

// ----------------------------------------------------------------------------
// Materials API (Phase 2)
// ----------------------------------------------------------------------------
export async function uploadMaterialApi(
  projectId: string,
  file: File
): Promise<Material> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetchWithTimeout(
    `${API_BASE_URL}/projects/${projectId}/materials`,
    {
      method: "POST",
      body: formData,
    },
    30000 // 30s timeout for large file uploads
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to upload document");
  }
  return await res.json();
}

export async function getProjectMaterialsApi(
  projectId: string
): Promise<Material[]> {
  const res = await fetchWithTimeout(
    `${API_BASE_URL}/projects/${projectId}/materials`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to fetch project materials");
  }
  return await res.json();
}

export async function getMaterialApi(materialId: string): Promise<Material> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/materials/${materialId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Material not found");
  }
  return await res.json();
}

export async function retryMaterialApi(materialId: string): Promise<Material> {
  const res = await fetchWithTimeout(
    `${API_BASE_URL}/materials/${materialId}/retry`,
    {
      method: "POST",
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to retry material ingestion");
  }
  return await res.json();
}

// ---------------------------------------------------------------------------
// Phase 3: AI Tutor API
// ---------------------------------------------------------------------------
import type {
  TutorAnswer,
  TutorConversation,
  TutorConversationSummary,
} from "@/types";

export async function askTutorApi(
  projectId: string,
  question: string,
  conversationId?: string
): Promise<TutorAnswer> {
  const payload: { question: string; conversation_id?: string } = { question };
  if (conversationId) payload.conversation_id = conversationId;

  const res = await fetchWithTimeout(
    `${API_BASE_URL}/projects/${projectId}/tutor`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    60000 // 60s timeout for LLM calls
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "AI Tutor is temporarily unavailable.");
  }
  return await res.json();
}

export async function getConversationsApi(
  projectId: string
): Promise<TutorConversationSummary[]> {
  const res = await fetchWithTimeout(
    `${API_BASE_URL}/projects/${projectId}/tutor/conversations`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to load conversations.");
  }
  return await res.json();
}

export async function getConversationApi(
  conversationId: string
): Promise<TutorConversation> {
  const res = await fetchWithTimeout(
    `${API_BASE_URL}/tutor/conversations/${conversationId}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Conversation not found.");
  }
  return await res.json();
}

// ----------------------------------------------------------------------------
// Phase 4: Adaptive Quiz & Assessment Endpoints
// ----------------------------------------------------------------------------

export async function getProjectConceptsApi(projectId: string): Promise<Concept[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/projects/${projectId}/concepts`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to load project concepts.");
  }
  return await res.json();
}

export async function extractProjectConceptsApi(projectId: string): Promise<Concept[]> {
  const res = await fetchWithTimeout(
    `${API_BASE_URL}/projects/${projectId}/concepts/extract`,
    { method: "POST" },
    60000 // 60s timeout for LLM extraction
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to extract concepts from materials.");
  }
  return await res.json();
}

export async function getProjectQuizzesApi(projectId: string): Promise<Quiz[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/projects/${projectId}/quizzes`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to load project quizzes.");
  }
  return await res.json();
}

export async function createQuizApi(
  projectId: string,
  title: string = "Adaptive Quiz",
  questionCount: number = 5,
  preferredDifficulty: string = "adaptive"
): Promise<Quiz> {
  const res = await fetchWithTimeout(
    `${API_BASE_URL}/projects/${projectId}/quizzes`,
    {
      method: "POST",
      body: JSON.stringify({
        title,
        question_count: questionCount,
        preferred_difficulty: preferredDifficulty,
      }),
    },
    90000 // 90s timeout for question generation
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to generate adaptive quiz.");
  }
  return await res.json();
}

export async function getQuizApi(projectId: string, quizId: string): Promise<Quiz> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/projects/${projectId}/quizzes/${quizId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Quiz not found.");
  }
  return await res.json();
}

export async function startQuizAttemptApi(
  projectId: string,
  quizId: string
): Promise<QuizAttempt> {
  const res = await fetchWithTimeout(
    `${API_BASE_URL}/projects/${projectId}/quizzes/${quizId}/attempts`,
    { method: "POST" }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to start quiz attempt.");
  }
  return await res.json();
}

export async function getQuizAttemptApi(
  projectId: string,
  quizId: string,
  attemptId: string
): Promise<QuizAttempt> {
  const res = await fetchWithTimeout(
    `${API_BASE_URL}/projects/${projectId}/quizzes/${quizId}/attempts/${attemptId}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Attempt not found.");
  }
  return await res.json();
}

export async function submitQuizAnswerApi(
  projectId: string,
  quizId: string,
  attemptId: string,
  questionId: string,
  payload: { selected_answer?: string; answer_text?: string }
): Promise<QuizAnswer> {
  const res = await fetchWithTimeout(
    `${API_BASE_URL}/projects/${projectId}/quizzes/${quizId}/attempts/${attemptId}/questions/${questionId}/answers`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    60000 // 60s timeout for open-ended LLM evaluation
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to submit and evaluate answer.");
  }
  return await res.json();
}

export async function completeQuizAttemptApi(
  projectId: string,
  quizId: string,
  attemptId: string
): Promise<QuizResult> {
  const res = await fetchWithTimeout(
    `${API_BASE_URL}/projects/${projectId}/quizzes/${quizId}/attempts/${attemptId}/complete`,
    { method: "POST" }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to complete attempt.");
  }
  return await res.json();
}

// ----------------------------------------------------------------------------
// Phase 5: Concept Mastery, Growth & Recommendations APIs
// ----------------------------------------------------------------------------

export async function getProjectMasteryApi(projectId: string): Promise<MasteryListResponse> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/projects/${projectId}/mastery`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to fetch concept mastery.");
  }
  return await res.json();
}

export async function getProjectGrowthApi(projectId: string): Promise<GrowthSummary> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/projects/${projectId}/growth`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to fetch growth summary.");
  }
  return await res.json();
}

export async function getProjectRecommendationsApi(projectId: string): Promise<Recommendation[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/projects/${projectId}/recommendations`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to fetch recommendations.");
  }
  return await res.json();
}

export async function dismissRecommendationApi(
  projectId: string,
  recId: string
): Promise<void> {
  const res = await fetchWithTimeout(
    `${API_BASE_URL}/projects/${projectId}/recommendations/${recId}/dismiss`,
    { method: "POST" }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to dismiss recommendation.");
  }
}

// ----------------------------------------------------------------------------
// Phase 6: Analytics & Admin Observability APIs
// ----------------------------------------------------------------------------

export async function getProjectAnalyticsApi(
  projectId: string
): Promise<ProjectAnalyticsResponse> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/projects/${projectId}/analytics`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to fetch project analytics.");
  }
  return await res.json();
}

export async function getGlobalAnalyticsApi(): Promise<GlobalAnalyticsResponse> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/analytics/global`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to fetch global analytics.");
  }
  return await res.json();
}

export async function getAdminOverviewApi(): Promise<AdminOverviewResponse> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/admin/overview`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to fetch admin overview.");
  }
  return await res.json();
}

export async function getAdminUsersApi(
  page: number = 1,
  pageSize: number = 20,
  search?: string
): Promise<AdminUserListResponse> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (search) params.append("search", search);
  const res = await fetchWithTimeout(`${API_BASE_URL}/admin/users?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to fetch users.");
  }
  return await res.json();
}

export async function getAdminUserDetailApi(userId: string): Promise<AdminUserDetailResponse> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/admin/users/${userId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to fetch user learning journey.");
  }
  return await res.json();
}

export async function getAdminActivityFeedApi(filters?: {
  userId?: string;
  projectId?: string;
  eventType?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}): Promise<AdminActivityFeedResponse> {
  const params = new URLSearchParams();
  if (filters?.page) params.append("page", String(filters.page));
  if (filters?.pageSize) params.append("page_size", String(filters.pageSize));
  if (filters?.userId) params.append("user_id", filters.userId);
  if (filters?.projectId) params.append("project_id", filters.projectId);
  if (filters?.eventType) params.append("event_type", filters.eventType);
  if (filters?.fromDate) params.append("from_date", filters.fromDate);
  if (filters?.toDate) params.append("to_date", filters.toDate);

  const res = await fetchWithTimeout(`${API_BASE_URL}/admin/activity?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to fetch activity feed.");
  }
  return await res.json();
}

export async function getAdminAIUsageApi(filters?: {
  operation?: string;
  model?: string;
  success?: boolean;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}): Promise<AdminAIUsageResponse> {
  const params = new URLSearchParams();
  if (filters?.page) params.append("page", String(filters.page));
  if (filters?.pageSize) params.append("page_size", String(filters.pageSize));
  if (filters?.operation) params.append("operation", filters.operation);
  if (filters?.model) params.append("model", filters.model);
  if (filters?.success !== undefined) params.append("success", String(filters.success));
  if (filters?.fromDate) params.append("from_date", filters.fromDate);
  if (filters?.toDate) params.append("to_date", filters.toDate);

  const res = await fetchWithTimeout(`${API_BASE_URL}/admin/ai-usage?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to fetch AI usage telemetry.");
  }
  return await res.json();
}

export async function getAdminJobsApi(): Promise<AdminJobHealthResponse> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/admin/jobs`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to fetch background jobs health.");
  }
  return await res.json();
}

export async function getAdminEvaluationsApi(): Promise<AIEvaluationSummaryResponse> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/admin/evaluations`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to fetch AI evaluations.");
  }
  return await res.json();
}

export async function runAdminEvaluationsApi(): Promise<AIEvaluationSummaryResponse> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/admin/evaluations/run`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to run AI evaluations.");
  }
  return await res.json();
}


