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
