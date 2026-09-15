# Data Model Design: AI Study Companion

This document outlines the relational database schema, vector embeddings, and entity relationships to be implemented across the development phases.

---

## 1. Entity-Relationship Overview

```
User (1) ──< Space (N) ──< Project (N)
                              │
  ┌───────────────┬───────────┴───────────┬────────────────┐
  │               │                       │                │
  ▼               ▼                       ▼                ▼
Material       Concept               Conversation        Quiz
  │               │                       │                │
  ▼               ▼                       ▼                ▼
DocumentChunk  ConceptMastery          Message        QuizQuestion
(with vector)     ▲                                        │
                  │                                        ▼
                  └──────────────────────────────── QuizAttempt
                                                           │
                                                           ▼
                                                       Assessment
```

---

## 2. Core Entities

### 2.1 User
- `id`: UUID (Primary Key)
- `email`: String (Unique, Indexed)
- `hashed_password`: String
- `full_name`: String
- `role`: Enum (`user`, `admin`)
- `created_at`, `updated_at`: Timestamps

### 2.2 Space
- Represents a broad area of exploration (e.g. "Computer Science", "Cloud Architecture").
- `id`: UUID (Primary Key)
- `user_id`: UUID (Foreign Key -> `User.id`, Indexed)
- `name`: String
- `description`: Text (Nullable)
- `color_code`: String (Nullable)
- `created_at`, `updated_at`: Timestamps

### 2.3 Project
- Focused learning journey within a Space.
- `id`: UUID (Primary Key)
- `space_id`: UUID (Foreign Key -> `Space.id`, Indexed)
- `user_id`: UUID (Foreign Key -> `User.id`, Indexed)
- `name`: String
- `description`: Text (Nullable)
- `learning_goal`: Text
- `created_at`, `updated_at`: Timestamps

### 2.4 Material
- Uploaded learning resources (e.g., PDF notes, textbooks).
- `id`: UUID (Primary Key)
- `project_id`: UUID (Foreign Key -> `Project.id`, Indexed)
- `file_name`: String
- `file_url`: String (Supabase Storage URL)
- `file_size`: Integer (Bytes)
- `status`: Enum (`queued`, `processing`, `ready`, `failed`)
- `error_message`: Text (Nullable)
- `total_pages`: Integer (Default 0)
- `created_at`, `updated_at`: Timestamps

### 2.5 DocumentChunk (pgvector)
- Extracted and vector-indexed content units.
- `id`: UUID (Primary Key)
- `material_id`: UUID (Foreign Key -> `Material.id`, Cascade Delete)
- `project_id`: UUID (Foreign Key -> `Project.id`, Indexed for project isolation)
- `chunk_index`: Integer
- `content`: Text
- `page_number`: Integer (For citation tracing)
- `embedding`: `Vector(1536)` (OpenAI text-embedding-3-small)
- `metadata`: JSONB (Headings, page section, token count)
- `created_at`: Timestamp

### 2.6 Concept & ConceptMastery
- `Concept`: Key topic extracted from materials or goals.
  - `id`: UUID, `project_id`: UUID, `name`: String, `description`: Text
- `ConceptMastery`:
  - `id`: UUID, `concept_id`: UUID, `user_id`: UUID, `project_id`: UUID
  - `mastery_score`: Float (0.0 to 1.0)
  - `confidence_score`: Float (0.0 to 1.0)
  - `status`: Enum (`improving`, `stable`, `requiring_attention`)
  - `last_evaluated_at`: Timestamp

### 2.7 Conversation & Message
- Persistent AI Tutor interaction log.
- `Conversation`: `id`: UUID, `project_id`: UUID, `user_id`: UUID, `title`: String
- `Message`: `id`: UUID, `conversation_id`: UUID, `role`: Enum (`user`, `assistant`, `system`), `content`: Text, `citations`: JSONB (Array of `{material_id, page_number, excerpt}`)

### 2.8 Quiz, Question & Assessment
- Adaptive assessments.
- `Quiz`: `id`: UUID, `project_id`: UUID, `difficulty`: Enum (`easy`, `medium`, `hard`)
- `QuizQuestion`: `id`: UUID, `quiz_id`: UUID, `concept_id`: UUID, `type`: Enum (`multiple_choice`, `open_ended`), `prompt`: Text, `options`: JSONB, `rubric`: Text
- `QuizAttempt`: `id`: UUID, `quiz_id`: UUID, `user_id`: UUID, `score`: Float
- `Assessment`: `id`: UUID, `attempt_id`: UUID, `evaluation_feedback`: Text, `missing_concepts`: JSONB

### 2.9 ActivityEvent
- Immutable event log for analytics and administrative tracking.
- `id`: UUID, `user_id`: UUID, `project_id`: UUID (Nullable), `event_type`: String, `payload`: JSONB, `created_at`: Timestamp
