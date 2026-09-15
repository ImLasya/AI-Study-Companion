/**
 * Phase 0 System Health and Core API Types
 * Full domain models (Space, Project, Material, Quiz) will be defined in Phase 1+.
 */

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
  timestamp: string;
}
