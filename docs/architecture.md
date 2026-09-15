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

