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
