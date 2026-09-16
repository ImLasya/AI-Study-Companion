/**
 * Core Domain Models and API Types
 */

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: "user" | "admin" | string;
  created_at: string;
}

export interface Space {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  projects_count: number;
}

export interface Project {
  id: string;
  space_id: string;
  user_id: string;
  name: string;
  description: string | null;
  learning_goal: string;
  created_at: string;
  updated_at: string;
}

export type MaterialStatus = "queued" | "processing" | "ready" | "failed";

export interface Material {
  id: string;
  project_id: string;
  filename: string;
  status: MaterialStatus;
  failure_reason: string | null;
  page_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface MaterialChunk {
  id: string;
  material_id: string;
  project_id: string;
  page_number: number;
  chunk_index: number;
  content: string;
  created_at: string;
}

export interface HealthStatus {
  status: "healthy" | "unhealthy";
  version: string;
}

export interface ReadyStatus {
  status: "ready" | "not_ready";
  database: "connected" | "unavailable";
  redis: "connected" | "unavailable";
  details?: {
    database_error?: string;
    redis_error?: string;
  };
}

export interface DatabaseHealthStatus {
  status: "healthy" | "unhealthy";
  database: string;
  pgvector: boolean;
  error?: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// Phase 3: AI Tutor Types
// ---------------------------------------------------------------------------

export interface TutorCitation {
  chunk_id: string;
  material_id: string;
  filename: string;
  page_number: number;
}

export interface TutorAnswer {
  conversation_id: string;
  message_id: string;
  answer: string;
  grounded: boolean;
  insufficient_evidence: boolean;
  citations: TutorCitation[];
}

export interface TutorMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  grounded: boolean;
  insufficient_evidence: boolean;
  citations: TutorCitation[];
  created_at: string;
}

export interface TutorConversation {
  id: string;
  project_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: TutorMessage[];
}

export interface TutorConversationSummary {
  id: string;
  project_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

// Local UI type merging user + assistant turns for the chat view
export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  grounded: boolean;
  insufficient_evidence: boolean;
  citations: TutorCitation[];
  created_at: string;
  isPending?: boolean;
}

// ---------------------------------------------------------------------------
// Phase 4: Adaptive Quiz & Assessment Types
// ---------------------------------------------------------------------------

export interface Concept {
  id: string;
  project_id: string;
  name: string;
  description: string;
  source_chunk_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface QuizQuestionPublic {
  id: string;
  quiz_id: string;
  concept_id: string | null;
  question_type: "mcq" | "open_ended";
  question_text: string;
  options: string[];
  difficulty: "easy" | "medium" | "hard";
  question_order: number;
  concept_name?: string | null;
}

export interface Quiz {
  id: string;
  project_id: string;
  title: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  question_count: number;
  questions: QuizQuestionPublic[];
}

export interface QuizAttempt {
  id: string;
  quiz_id: string;
  project_id: string;
  started_at: string;
  completed_at: string | null;
  score: number | null;
  total_questions: number;
  correct_answers: number;
  status: "in_progress" | "completed";
}

export interface QuizAnswer {
  id: string;
  attempt_id: string;
  question_id: string;
  concept_id: string | null;
  difficulty: string;
  selected_answer: string | null;
  answer_text: string | null;
  is_correct: boolean | null;
  score: number | null;
  evaluation_feedback: string | null;
  evaluated_at: string;
  correct_answer: string;
  explanation: string;
}

export interface ConceptPerformance {
  concept_id: string | null;
  concept_name: string;
  total_questions: number;
  correct_questions: number;
  accuracy_percentage: number;
}

export interface QuizResult {
  attempt_id: string;
  quiz_id: string;
  project_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  score_percentage: number;
  total_questions: number;
  correct_answers: number;
  answers: QuizAnswer[];
  concept_performance: ConceptPerformance[];
}

// ---------------------------------------------------------------------------
// Phase 5: Concept Mastery, Growth & Recommendations Types
// ---------------------------------------------------------------------------

export type ConfidenceLevel = "unassessed" | "low" | "medium" | "high";
export type GrowthStatus = "improving" | "stable" | "needs_attention" | "unassessed";
export type RecommendationType =
  | "review_concept"
  | "practice_quiz"
  | "study_material"
  | "explore_topic";

export interface ConceptMastery {
  id: string | null;
  concept_id: string;
  concept_name: string;
  mastery_score: number | null;
  confidence: number;
  confidence_level: ConfidenceLevel;
  evidence_count: number;
  is_assessed: boolean;
  last_updated_at: string | null;
}

export interface MasteryListResponse {
  project_id: string;
  masteries: ConceptMastery[];
  overall_average_mastery: number | null;
  assessed_count: number;
  total_concepts: number;
}

export interface SnapshotPoint {
  recorded_at: string;
  score: number;
}

export interface ConceptGrowthItem {
  concept_id: string;
  concept_name: string;
  current_score: number | null;
  baseline_score: number | null;
  delta: number;
  status: GrowthStatus;
  history: SnapshotPoint[];
}

export interface GrowthSummary {
  project_id: string;
  improving: ConceptGrowthItem[];
  stable: ConceptGrowthItem[];
  needs_attention: ConceptGrowthItem[];
  unassessed: ConceptGrowthItem[];
  overall_average: number | null;
}

export interface Recommendation {
  id: string;
  project_id: string;
  recommendation_type: RecommendationType;
  title: string;
  body: string;
  target_concept_id: string | null;
  target_concept_name: string | null;
  reasoning: string;
  status: "active" | "dismissed" | "completed";
  created_at: string;
}

// ----------------------------------------------------------------------------
// Phase 6: Analytics & Admin Observability Types
// ----------------------------------------------------------------------------

export interface DailyActivityBucket {
  date: string;
  event_count: number;
  event_breakdown: Record<string, number>;
}

export interface QuizPerformanceTrendItem {
  attempt_id: string;
  completed_at: string | null;
  score_percentage: number;
  passed: boolean;
  total_questions: number;
}

export interface MasteryDistribution {
  unassessed: number;
  needs_attention: number;
  stable: number;
  mastered: number;
  overall_average: number | null;
}

export interface ConceptTrendItem {
  concept_id: string;
  concept_name: string;
  latest_score: number | null;
  confidence: number;
  status: "unassessed" | "needs_attention" | "stable" | "mastered";
}

export interface TutorInteractionSummary {
  total_conversations: number;
  total_messages: number;
  assistant_messages: number;
}

export interface AIActivitySummary {
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_estimated_cost_usd: number;
  avg_latency_ms: number;
  calls_by_operation: Record<string, number>;
}

export interface ProjectAnalyticsResponse {
  project_id: string;
  learning_activity: DailyActivityBucket[];
  quiz_performance_trend: QuizPerformanceTrendItem[];
  current_mastery_distribution: MasteryDistribution;
  concept_trends: ConceptTrendItem[];
  tutor_interaction_counts: TutorInteractionSummary;
  ai_activity: AIActivitySummary;
}

export interface ProjectProgressItem {
  project_id: string;
  project_name: string;
  space_name: string;
  learning_goal: string;
  total_concepts: number;
  assessed_concepts: number;
  average_mastery: number | null;
  last_active_at: string | null;
}

export interface WeakAreaItem {
  concept_id: string;
  concept_name: string;
  project_id: string;
  project_name: string;
  mastery_score: number;
  confidence: number;
}

export interface GlobalStudyActivity {
  total_events: number;
  total_quizzes_completed: number;
  total_tutor_conversations: number;
  active_study_days: number;
}

export interface GlobalAnalyticsResponse {
  user_id: string;
  total_study_activity: GlobalStudyActivity;
  projects_by_progress: ProjectProgressItem[];
  weakest_areas: WeakAreaItem[];
  overall_trend: DailyActivityBucket[];
  ai_usage_summary: AIActivitySummary;
}

export interface AdminOverviewResponse {
  total_users: number;
  total_spaces: number;
  total_projects: number;
  active_users_daily: number;
  active_users_weekly: number;
  total_ai_spend_usd: number;
  total_ai_calls: number;
  job_health_summary: Record<string, number>;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  project_count: number;
  last_activity_at: string | null;
}

export interface AdminUserListResponse {
  items: AdminUserSummary[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminUserProjectSummary {
  id: string;
  name: string;
  space_name: string;
  created_at: string;
  concept_count: number;
  average_mastery: number | null;
}

export interface AdminUserRecentQuiz {
  attempt_id: string;
  project_name: string;
  score_percentage: number;
  passed: boolean;
  completed_at: string | null;
}

export interface AdminUserRecentActivity {
  id: string;
  event_type: string;
  project_id: string | null;
  created_at: string;
}

export interface AdminUserDetailResponse {
  user: AdminUserSummary;
  spaces_count: number;
  projects: AdminUserProjectSummary[];
  recent_activity: AdminUserRecentActivity[];
  recent_quizzes: AdminUserRecentQuiz[];
  ai_usage: AIActivitySummary;
}

export interface AdminActivityItem {
  id: string;
  user_id: string;
  user_email: string | null;
  project_id: string | null;
  project_name: string | null;
  event_type: string;
  created_at: string;
}

export interface AdminActivityFeedResponse {
  items: AdminActivityItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminAIUsageItem {
  id: string;
  user_id: string | null;
  project_id: string | null;
  operation: string;
  provider: string;
  model: string;
  latency_ms: number;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
  success: boolean;
  error: string | null;
  created_at: string;
}

export interface AdminAIUsageResponse {
  p50_latency_ms: number;
  p95_latency_ms: number;
  total_calls: number;
  failed_calls: number;
  failure_rate: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  recent_logs: AdminAIUsageItem[];
  total_records: number;
  page: number;
  page_size: number;
}

export interface AdminJobFailureItem {
  material_id: string;
  project_id: string;
  project_name: string;
  filename: string;
  status: string;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminJobHealthResponse {
  status_counts: Record<string, number>;
  total_materials: number;
  recent_failures: AdminJobFailureItem[];
}

export interface AIEvaluationSuiteSummary {
  suite: string;
  total: number;
  passed: number;
  pass_rate: number;
}

export interface AIEvaluationCaseItem {
  id: string;
  run_id: string;
  suite: string;
  case_id: string;
  passed: boolean;
  score: number | null;
  notes: string | null;
  run_at: string;
}

export interface AIEvaluationSummaryResponse {
  latest_run_id: string | null;
  latest_run_at: string | null;
  overall_pass_rate: number;
  total_cases: number;
  passed_cases: number;
  suite_summaries: AIEvaluationSuiteSummary[];
  cases: AIEvaluationCaseItem[];
}

