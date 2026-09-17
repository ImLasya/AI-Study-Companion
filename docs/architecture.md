# System Architecture: AI Study Companion

This document details the architectural design for the **AI Study Companion** according to the Product Requirements Document (PRD v3.0).

---

## 1. Architectural Principles

1. **Context First**: AI interactions are strictly bounded to the active Project. Cross-project data leakage is structurally prevented at the database and retrieval layers.
2. **Evidence Over Guessing**: AI outputs are grounded in retrieved source documents with explicit citations (e.g. `Source: Machine Learning Notes — Page 14`). When sufficient evidence is missing, the system communicates uncertainty.
3. **Persistent but Relevant Context**: The system maintains high-signal contextual memory (goals, masteries, persistent weaknesses) without bloating prompt context windows.
4. **Asynchronous by Design**: Heavy tasks (PDF parsing, OCR, chunking, embedding generation, long-term analytics) run as asynchronous background jobs via Celery and Redis.
5. **Controlled AI Interfaces**: The AI communicates with internal systems through validated tool requests rather than direct database access.

---

## 2. High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                       │
│    React 18 • Vite • React Router • TypeScript • Tailwind   │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / JSON
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   API / Application Layer                   │
│          FastAPI • Pydantic v2 • Authentication Guard        │
└──────┬───────────────────────┬───────────────────────┬──────┘
       │                       │                       │
       ▼                       ▼                       ▼
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│ Repositories │       │  Services    │       │ AI / Prompts │
│ (SQLAlchemy) │       │(Domain Logic)│       │ (OpenAI/RAG) │
└──────┬───────┘       └──────┬───────┘       └──────┬───────┘
       │                      │                      │
       ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│                     Data & Storage Layer                    │
│   PostgreSQL 16 + pgvector (Embeddings & Relational Data)    │
│            Supabase Storage (PDFs & Documents)              │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Background Processing Layer                 │
│         Redis 7 (Broker) • Celery Workers (Tasks)           │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Tier Responsibilities

### 3.1 Frontend (`frontend/`)
- Built with **React 18**, **Vite**, **React Router 6**, **TypeScript** (Strict Mode), and **Tailwind CSS**.
- Interacts with the backend via versioned REST endpoints (`/api/v1/*`).
- Handles authentication state, interactive tutoring sessions, quiz taking, and mastery visualization.

### 3.2 Application & Business Layer (`backend/app/`)
- **FastAPI**: Asynchronous web framework exposing versioned endpoints (`/api/v1`).
- **Core (`app/core/`)**: Application configuration (`Settings` via Pydantic Settings), structured logging, and token security.
- **Repositories (`app/repositories/`)**: Encapsulates persistence queries away from business and AI logic.
- **Services (`app/services/`)**: Implements domain business rules (e.g., Space management, Project isolation, Quiz scoring).
- **AI Engine (`app/ai/`)**: Encapsulates LLM invocation, prompt templates, structured output parsing, and evaluation guards.
- **Workflows (`app/workflows/`)**: Orchestrates complex multi-turn or stateful interactions (e.g., LangGraph state graphs for tutoring and adaptive quizzes).
- **Events (`app/events/`)**: Handles domain event publishing and listening to trigger downstream analytics and recommendations.
- **Workers (`app/workers/`)**: Houses Celery task definitions for asynchronous PDF parsing, OCR, and vectorization.

### 3.3 Data Layer
- **PostgreSQL 16**: Primary source of truth for users, spaces, projects, quiz attempts, and analytics.
- **pgvector**: Native vector extension storing document embeddings (`vector(1536)`), enabling cosine similarity searches directly inside SQL queries with project isolation filters (`WHERE project_id = :id`).
- **Alembic**: Manages database migrations predictably.
- **Supabase Storage**: Object store for original uploaded PDF files.

---

## 4. Security & Data Isolation
- Every query to materials, chunks, conversations, and assessments must enforce tenant/project isolation:
  ```sql
  SELECT * FROM document_chunks 
  WHERE project_id = :project_id 
  ORDER BY embedding <=> :query_vector 
  LIMIT 5;
  ```
- Untrusted user input and document content are treated strictly as data, never system instructions, mitigating prompt injection risks.

---

## 5. Phase 1 Architecture: Authentication & Tenant Isolation

### 5.1 Cookie-Based JWT Authentication & CORS Strategy
- **Transport Security**: JWT tokens are issued as `httpOnly`, `SameSite=lax` cookies (`access_token` and `refresh_token`), rather than returned in JSON payloads.
  - Mitigates Cross-Site Scripting (XSS) credential theft because JavaScript running in the browser cannot read `document.cookie` for httpOnly tokens.
  - Protects against Cross-Site Request Forgery (CSRF) using `samesite="lax"`, standard path scoping (`/api/v1/auth/refresh` for refresh token), and strict CORS origin validation.
- **Frontend / Backend Communication**:
  - Frontend (`http://localhost:3000`) uses `credentials: "include"` on all `fetch` requests via `apiClient`.
  - Backend FastAPI CORS middleware explicitly configures `allow_credentials=True` with explicit origins (`http://localhost:3000`). Wildcard `*` origins are rejected when credentials are enabled.
- **Header Fallback**:
  - `get_current_user` first inspects the `access_token` cookie; if missing, it falls back to standard `Authorization: Bearer <token>` headers to support automated scripts and API clients.

### 5.2 Token Refresh Tradeoff & Expiry Policy
- **Design Choices**:
  1. **Short-Lived Access Token (15–30 minutes, default 15m)**:
     - Minimizes the blast radius of a compromised token without requiring stateful token revocation lists in the database for everyday requests.
  2. **Long-Lived Refresh Token (7 days)**:
     - Stored as an `httpOnly` cookie scoped specifically to `path="/api/v1/auth/refresh"`.
     - Re-authenticates the user transparently via `POST /api/v1/auth/refresh` without prompting for re-login.
- **Tradeoff Analysis**:
  - *Option A (Implemented)*: Dual-token system with `POST /auth/refresh`. Provides optimal balance of security (fast invalidation window) and user experience (7-day persistence).
  - *Option B (Alternative)*: Single long-lived access token (e.g. 24–72 hours) without refresh endpoint. Simpler architecture with fewer moving parts, but revocation requires maintaining a Redis token blacklist or database invalidation timestamp (`token_valid_after`). We implemented Option A to adhere to zero-trust security best practices required by the PRD.

### 5.3 Repository-Level Tenant Isolation
- **Strict Query Scoping**:
  - Every persistence operation in `SpaceRepository` and `ProjectRepository` enforces tenant filtering directly within the SQL statement:
    ```sql
    -- Space access
    SELECT * FROM spaces WHERE id = :space_id AND user_id = :user_id;

    -- Project access (via direct user_id or space ownership)
    SELECT * FROM projects WHERE id = :project_id AND user_id = :user_id;
    ```
- **Anti-Enumeration 404 Policy**:
  - Any request attempting to access or mutate a space or project owned by another tenant returns **HTTP 404 Not Found**, never HTTP 403 Forbidden.
  - This completely prevents unauthorized callers from discovering whether a given entity ID exists in the database.

---

## 6. Phase 2 Architecture: Learning Materials & Knowledge Pipeline

### 6.1 Ingestion Flow & Async Processing Pattern
The document ingestion architecture decouples file upload from heavy vector computation:
1. **Upload Request (`POST /api/v1/projects/{id}/materials`)**:
   - Authenticated user submits a `multipart/form-data` payload containing a PDF file.
   - Validation ensures:
     - MIME type is `application/pdf` or extension is `.pdf`.
     - File size does not exceed `MAX_UPLOAD_SIZE_BYTES` (default 20MB).
     - Target project belongs to the requesting user (returns HTTP 404 on mismatch).
   - Synchronous Storage: File is streamed to disk via `StorageService` at `{STORAGE_PATH}/materials/{project_id}/{material_id}/original.pdf` with path traversal sanitization.
   - Initial State: A `Material` record is persisted with status `queued`.
   - Async Dispatch: A Celery background task `process_material.delay(material_id)` is enqueued on Redis.
   - Response: Returns **HTTP 202 Accepted** immediately with `MaterialResponse`.

2. **Celery Worker Execution (`process_material`)**:
   - Status transition: Updates `Material.status` to `processing`.
   - Extraction: PyMuPDF (`fitz`) opens the PDF from storage, extracts text page by page, and validates content.
   - Chunking: Deterministic page-preserving chunking generates text chunks with exact `page_number` and sequential `chunk_index`.
   - Embeddings: Generates 384-dimensional dense vectors using `sentence-transformers/all-MiniLM-L6-v2`.
   - Storage & Indexing: Inserts `MaterialChunk` records with native `Vector(384)` embeddings.
   - Completion: Updates `Material.status` to `ready`, sets `page_count`.
   - Error Handling: On any extraction or processing exception, catches the error, sets status to `failed`, and persists the detailed message in `Material.failure_reason`.

### 6.2 Storage Abstraction & Cloud Portability
- **Storage Service Interface**: Local filesystem storage is implemented via `StorageService` rooted at `STORAGE_PATH` (default `./storage`).
- **Path Sanitization**: Filenames are sanitized to prevent directory traversal attacks (`../` stripping).
- **Structure**: Files are partitioned by hierarchy: `storage/materials/{project_id}/{material_id}/original.pdf`.
- **Cloud Migration Path**: The `StorageService` interface isolates file persistence; future migration to S3, Google Cloud Storage, or MinIO requires changing only the storage driver without affecting extraction or database logic.

### 6.3 PyMuPDF Extraction & Page-Preserving Chunking
- **Engine**: PyMuPDF (`fitz`) is selected for high-performance C-based text extraction.
- **Scanned/Empty PDF Detection**: Pages with zero extractable text are flagged; documents with no extractable text fail with a descriptive `failure_reason` guiding users to upload text-based PDFs.
- **Deterministic Chunking Policy**:
  - Target size: ~500–800 tokens (~2400 characters).
  - Target overlap: ~400 characters between adjacent chunks.
  - Page Boundary Invariance: Chunks **never cross page boundaries**. Each chunk is strictly bounded to a single page. This guarantees that downstream Phase 3 RAG citations (`Source: File - Page X`) are 100% accurate and verifiable.
  - Sentence Boundary Respect: Chunk splits prioritize newline and sentence punctuation (`. `, `! `, `? `) over arbitrary character cutoffs.

### 6.4 Native PostgreSQL `Vector(384)` & HNSW Indexing
- **Native pgvector Requirement**: All vector representations use native PostgreSQL `vector(384)`. Real array (`real[]`), JSON, or SQLite fallbacks are strictly prohibited.
- **Embedding Model**: `sentence-transformers/all-MiniLM-L6-v2`, producing 384-dimensional normalized dense vectors.
- **HNSW Cosine Index**: An HNSW index (`m=16`, `ef_construction=64`) is created using the `vector_cosine_ops` operator class:
  ```sql
  CREATE INDEX idx_material_chunks_embedding_hnsw 
  ON material_chunks 
  USING hnsw (embedding vector_cosine_ops) 
  WITH (m = 16, ef_construction = 64);
  ```
- **Semantic Distance**: Vector similarity searches utilize the cosine distance operator `<=>`, computing cosine distance in sub-millisecond query time.

### 6.5 Idempotency & Retry Guarantee
- **Reprocessing Safety**: The Celery worker implements idempotent chunk replacement via `MaterialRepository.replace_chunks()`. Any existing chunks for the material are deleted within an atomic database transaction before newly computed chunks are inserted.
- **Manual Retry Endpoint (`POST /api/v1/materials/{id}/retry`)**: If a document fails due to temporary worker starvation or downstream timeouts, users can trigger a retry, which resets status to `queued`, clears `failure_reason`, and re-dispatches the Celery task.

### 6.6 Strict Multi-Tenant Isolation
- All material queries and mutations verify ownership at the repository level:
  ```sql
  SELECT * FROM materials WHERE id = :material_id AND user_id = :user_id;
  ```
- Cross-tenant requests return **HTTP 404 Not Found**, preserving the zero-knowledge anti-enumeration policy established in Phase 1.

---

## 7. Adaptive Quiz & Assessment Architecture (Phase 4)

### 7.1 Concept Discovery & Normalized Extraction
- Concepts are extracted incrementally upon PDF material processing (`status = ready`) using Gemini structured extraction.
- Concepts are deduplicated per project using trimmed, case-insensitive, whitespace-normalized names (`normalize_concept_name`).
- Material ingestion failure is decoupled from concept extraction; temporary LLM unavailability does not invalidate processed materials and remains independently retryable.

### 7.2 Adaptive Question Generation & Answer Scoring
- Supports Multiple Choice Questions (MCQ) and Open-Ended Questions.
- MCQ evaluation is deterministic on the backend: correct = 1.0, incorrect = 0.0.
- Open-Ended answers undergo semantic rubric evaluation via Google Gemini, producing continuous normalized scores in $[0.0, 1.0]$.
- Answer eligibility rule: only successfully submitted and evaluated answers contribute to learner records. Unanswered, abandoned, or incomplete questions are excluded.

---

## 8. Concept Mastery & Growth Analysis (Phase 5)

### 8.1 Deterministic MasteryEngine
Mastery calculation is pure, deterministic, and free of non-deterministic LLM judgments:
1. **Recency Decay**: Exponential decay weighting $w_i = \text{diff\_weight} \times \lambda^{\Delta i}$, where $\lambda = 0.85$ and $\Delta i = N - 1 - i$ for chronological answers $i \in [0, N-1]$.
2. **Difficulty Multipliers**:
   - `easy`: $0.8$
   - `medium`: $1.0$
   - `hard`: $1.3$
3. **Mastery Score**:
   $$\text{Mastery} = 100 \times \frac{\sum_{i} w_i \cdot s_i}{\sum_{i} w_i}$$
   where $s_i \in [0.0, 1.0]$ is the normalized answer score.
4. **Asymptotic Confidence**:
   $$\text{Confidence} = 1.0 - e^{-N / 5.0}$$
   Reflects evidence depth (thin evidence yields low confidence; 10+ questions approach 90%+ confidence).
5. **Unassessed State**: Concepts with zero eligible answers store `mastery_score = None`, `confidence = 0.0`, and `is_assessed = False`. "No data" is explicitly never conflated with zero mastery.

### 8.2 Deterministic GrowthEngine
Categorizes learner trajectory based on historical mastery snapshots:
- `unassessed`: Concept has zero evaluated answers.
- `improving`: Latest mastery exceeds baseline/previous by $\ge 5.0$ percentage points.
- `needs_attention`: Latest mastery dropped by $\ge 5.0$ points, or latest mastery is below $60.0\%$.
- `stable`: Mastery change within $\pm 5.0$ points and latest mastery $\ge 60.0\%$.

### 8.3 Idempotency & Transaction Safety
- **Database-Enforced Idempotency**: Handled via `processed_events` table with unique constraint `(event_type, aggregate_id)`. Concurrent Celery deliveries or duplicate events are safely ignored.
- **Atomic Commits**: Concept mastery updates and append-only `MasterySnapshot` rows are committed in a single atomic transaction.

---

## 9. Next-Step Recommendations Architecture (Phase 5)

### 9.1 Grounded Gemini Recommendation Workflow
1. Triggered following successful mastery snapshot persistence.
2. Learner diagnostic profile (mastery scores, confidence, weak concepts, recent errors) and project candidate concepts are provided to Gemini.
3. Candidate restriction: Gemini may only select from backend-provided candidate concept IDs. Invalid IDs are filtered out server-side.
4. Allowed types: Restricted to `review_concept`, `take_quiz`, `read_material`, `practice_open_ended`.
5. Recommendation deduplication: Active, undismissed recommendations for the same concept and type are reused rather than duplicated.
---

## 10. Analytics SQL Aggregation & Indexing Strategy (Phase 6)

### 10.1 SQL-Level Aggregations (Read-Side Optimization)
Analytics queries are purely read-side operations that avoid in-memory Python looping over high-volume tables. They leverage database-native functions and CTEs:
- **Project Activity Timeline**: `date_trunc('day', created_at)` with `COUNT(*)` grouped by calendar day over `activity_events`.
- **Quiz Performance Trend**: Chronological queries selecting `attempt_id`, `score`, `passed`, and `completed_at` filtered by `status = 'completed'`.
- **Mastery Distribution**: Categorization of `ConceptMastery` into buckets (`unassessed`, `needs_attention`, `stable`, `mastered`) via SQL `CASE` statements and `COUNT(CASE ...)`.
- **Global User Analytics**: Multi-tenant aggregation calculating total study events, quizzes completed, active study days, and top weak areas across all spaces and projects belonging to the authenticated user.

### 10.2 Indexing Strategy (Migration 0007)
To ensure sub-10ms query latency as event logs scale, composite and partial indexes were established without redundant overlaps:
- `ix_activity_events_project_created`: `(project_id, created_at DESC)` for project timeline buckets.
- `ix_activity_events_user_created`: `(user_id, created_at DESC)` for user-scoped global feeds.
- `ix_ai_usage_logs_project_created`: `(project_id, created_at DESC)` for project AI telemetry.
- `ix_ai_usage_logs_operation_created`: `(operation, created_at DESC)` for operation breakdown and latency percentiles.
- `ix_ai_usage_logs_user_created`: `(user_id, created_at DESC)` for tenant-isolated user auditing.

---

## 11. Admin Authorization Boundary & Observability (Phase 6)

### 11.1 Strict Authorization Boundary
- **No Repository Bypass Flags**: Cross-tenant queries are strictly segregated into a dedicated `AdminRepository` and `AdminService`. Normal tenant repositories (`ProjectRepository`, `SpaceRepository`, etc.) enforce strict user-isolation and contain no `is_admin` bypass parameters.
- **Backend Dependency Enforcement**: The sole entrypoint to cross-tenant data is the FastAPI dependency `get_current_admin`. Frontend guards (`AdminRoute`) exist solely for UX routing and never substitute for server-side verification. Non-admin requests immediately receive `403 Forbidden`.
- **Sensitive Data Redaction**: Admin DTOs strictly redact passwords, bcrypt hashes, session tokens, raw user prompts, and full LLM response completions.

### 11.2 Inline AI Telemetry Persistence
- **Awaited Inline Writes**: AI telemetry writes (`log_ai_usage`) are awaited inline within the active request context, wrapped in a fail-safe `try/except` block.
- **Non-Blocking Reliability**: Telemetry failures never interrupt or fail the primary user operation. Inline execution prevents dropped writes caused by event-loop shutdowns.
- **Telemetry Sanitization**: Model names, latency, token counts, cost estimates, and error messages are recorded while stripping sensitive secrets or proprietary prompt text.

---

## 12. LangSmith Tracing & External Observability

### 12.1 Overview & Dual Observability Model
The AI Study Companion architecture implements a **dual observability model**:
1. **Internal Application Telemetry (`ai_usage_logs`)**: Internal PostgreSQL-backed telemetry capturing token counts, latency, cost estimates, and success/failure statuses. Powers administrative dashboards and user usage metrics.
2. **External Tracing & Observability (LangSmith)**: Deep execution tracing, debugging, token breakdown, and step-by-step latency profiling of Google Gemini calls via the official `langsmith.wrappers.wrap_gemini` SDK instrumentation.

```
                  Gemini Generation Call
                            |
             +--------------+--------------+
             |                             |
             v                             v
   Internal Telemetry             LangSmith Tracing
   (app.ai.observability)        (app.ai.tracing)
             |                             |
             v                             v
    PostgreSQL Table:             LangSmith Cloud /
     ai_usage_logs             Project: ai-study-companion
```

### 12.2 Fail-Safe & Non-Blocking Design
- **Completely Optional**: LangSmith is fully optional. If `LANGSMITH_API_KEY` is not provided or `LANGSMITH_TRACING` is `false`, the application operates with zero performance penalty or exceptions.
- **Error Isolation**: Tracing operates out-of-band. Any network error, timeout, or issue connecting to LangSmith is caught and logged as a warning; it **never** converts a successful Gemini call into a failed learner request.
- **Preserved Business Logic**: Gemini error handling (such as HTTP 429 quota exhaustion) remains strictly within `GeminiProvider` and application service boundaries.

### 12.3 Configuration Variables

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `LANGSMITH_TRACING` | boolean | `false` | Enables or disables LangSmith tracing (`true` or `false`). |
| `LANGSMITH_API_KEY` | string | `None` | LangSmith API key (format: `lsv2_pt_...`). Keep secret; do not commit. |
| `LANGSMITH_PROJECT` | string | `ai-study-companion` | Target project name in LangSmith for organizing traces. |
| `LANGSMITH_ENDPOINT` | string | `https://api.smith.langchain.com` | LangSmith API endpoint URL. |

> **Note**: Backward compatibility with legacy `LANGCHAIN_TRACING_V2`, `LANGCHAIN_API_KEY`, and `LANGCHAIN_PROJECT` is automatically maintained.

### 12.4 Traced Operations & Sanitization
Traced features include:
- `tutor`: Grounded RAG conversational answers
- `quiz`: Adaptive quiz generation and open-ended evaluation
- `recommendation`: Next-step pedagogical recommendations
- `concept_extraction`: Knowledge extraction from uploaded learning materials
- `evaluation`: RAG offline benchmarks and accuracy assertions

**Data Privacy & Sanitization**:
All metadata passes through `sanitize_metadata()` before dispatch to LangSmith. Sensitive fields (including `api_key`, `access_token`, `jwt_token`, `user_password`, `authorization`) are automatically stripped. Embeddings remain local via `sentence-transformers` and are not dispatched to Gemini or external trace endpoints.


