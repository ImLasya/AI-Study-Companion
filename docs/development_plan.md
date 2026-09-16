# Development & Implementation Plan

This roadmap tracks the step-by-step implementation of the **AI Study Companion** over a 3–4 day execution cycle following the PRD.

---

## Phase Breakdown

### Phase 0: System Architecture & Foundation (Current Phase)
- [x] Monorepo structure, Git & .gitignore setup.
- [x] Backend FastAPI application with Pydantic v2 and structured logging.
- [x] SQLAlchemy 2.0 Async engine and Sessionmaker.
- [x] PostgreSQL 16 + pgvector Docker Compose configuration.
- [x] Alembic migration framework with pgvector initialization.
- [x] Redis 7 and Celery background worker scaffolding.
- [x] Liveness, readiness, and database health endpoints (`/health`, `/health/ready`, `/health/db`).
- [x] React + Vite frontend with TypeScript strict mode, React Router, and Tailwind CSS.
- [x] Phase 0 dashboard with real-time health indicator.
- [x] Automated test suite (Pytest + AsyncClient) and CI workflow.
- [x] Architecture, data model, and learning loop documentation.

### Phase 1: Authentication & Project Isolation Data Model (Completed)
- [x] User authentication with JWT (Signup, Login, Refresh tokens via httpOnly cookies).
- [x] SQLAlchemy models & Alembic migrations: `User`, `Space`, `Project`, `ActivityEvent`.
- [x] Repositories for User, Space, Project with strict tenant isolation (user_id scoped, 404 on cross-tenant access).
- [x] API endpoints for Auth, Spaces, and Projects with comprehensive error handling.
- [x] React + Vite frontend with AuthContext, ProtectedRoute, Spaces & Projects navigation and management UI.
- [x] Real PostgreSQL test suite with 16 automated tests covering auth, token refresh, and data isolation.

### Phase 2: PDF Upload & Asynchronous Ingestion Pipeline (Completed)
- [x] Local filesystem storage service with path traversal sanitization.
- [x] Synchronous 202 Accepted upload endpoint with format and size validation.
- [x] Celery asynchronous worker pipeline for PyMuPDF text extraction.
- [x] Page-aware deterministic chunking preserving page boundaries and sequence order.
- [x] Sentence-transformers all-MiniLM-L6-v2 embeddings (dimension 384) with AI usage/latency logging.
- [x] Native PostgreSQL Vector(384) storage with HNSW cosine index (vector_cosine_ops).
- [x] Material status lifecycle (`queued` -> `processing` -> `ready` / `failed`).
- [x] Failure reason capture and manual retry endpoint (`POST /materials/{id}/retry`).
- [x] Idempotent chunk replacement ensuring safe re-processing.
- [x] Strict user/project/space tenant isolation with anti-enumeration 404s.
- [x] React + Vite Materials UI with drag-and-drop, optimistic queuing, status badges, and polling.
- [x] Test suite covering upload, pgvector similarity search, idempotency, corrupt PDF failure, and multi-tenant isolation.

### Phase 3: AI Tutor & Grounded RAG with Citations (Completed)
- [x] Semantic vector search repository with project-level isolation filters.
- [x] Grounded AI Tutor prompting with explicit citation format (`Source: File - Page X`).
- [x] Unsupported-question detector (returns uncertainty when evidence is insufficient).
- [x] Conversation history & persistent learning context persistence.
- [x] Frontend interactive chat interface with source citation previews.

### Phase 4: Adaptive Quiz & Assessment (Completed)
- [x] Incremental concept extraction and persistence with normalized deduplication.
- [x] Adaptive question generator (Multiple-Choice & Open-Ended) with difficulty calibration.
- [x] AI assessment engine evaluating open-ended answers with continuous scoring against rubrics.
- [x] Frontend quiz generation, taking, and instant feedback results UI.

### Phase 5: Concept Mastery, Growth Analysis & Recommendations (Completed)
- [x] Pure deterministic MasteryEngine with exponential recency decay ($0.85^{\Delta i}$), difficulty weights, and continuous partial credit.
- [x] Explicit answer eligibility rules: only submitted/evaluated answers count.
- [x] Unassessed state representation (`mastery_score=None`, `is_assessed=False`) for concepts with no evidence.
- [x] Deterministic GrowthEngine with categorical classification (`improving`, `stable`, `needs_attention`, `unassessed`) and historical timeline series.
- [x] Database-enforced idempotency via `processed_events` (`event_type`, `aggregate_id`) preventing duplicate mastery snapshots.
- [x] Transactionally consistent mastery updates and append-only `MasterySnapshot` persistence.
- [x] Decoupled, resilient recommendation generation: candidate-restricted concept selection, allowed types validation, active recommendation deduplication, and graceful degradation on Gemini failure.
- [x] Celery background task `process_quiz_completed` with robust worker execution.
- [x] React frontend `GrowthTab` with mastery progress bars, confidence indicators, growth trajectory badges, historical trend visualization, and interactive dismissible recommendation cards.
- [x] Comprehensive test suite with 69 passing backend tests and 100% type-checked code.

### Phase 6: Analytics, Admin Dashboard & AI Quality Observability (Completed)
- [x] Database migration 0007 creating `ai_usage_logs` and `ai_evaluation_runs` with composite indexes and historical backfill.
- [x] Inline, non-blocking AI telemetry persistence (`log_ai_usage`) wrapped in safe exception handling.
- [x] SQL-level aggregations for project analytics: daily study events, quiz score trends, mastery distributions, tutor counts, and AI spend.
- [x] Tenant-isolated Global Analytics (`/analytics/global`) aggregating cross-space progress and weakest concepts.
- [x] Segregated `AdminRepository` and `AdminService` strictly guarded by backend `get_current_admin` dependency (403 for non-admins).
- [x] Admin endpoints: Overview KPIs, Paginated Users list with drill-in learning journey, Cross-tenant activity audit feed, AI telemetry percentiles (P50/P95 latency, cost, tokens, failure rate), and Background job pipeline health.
- [x] Deterministic AI quality evaluation harness (`runner.py`) with curated test fixtures and deliberate rule-based/regex judging.
- [x] React frontend UI: Real `AnalyticsTab` on Project Detail, Global Learning Pulse on Dashboard, and comprehensive Admin Operations Dashboard at `/admin` guarded by `AdminRoute`.
- [x] Comprehensive documentation in `docs/architecture.md` and `docs/evaluation.md`.
- [x] Full quality gate: 77 pytest passing, 0 ruff errors, 0 mypy errors across 90 source files, and 0 Vite build errors.
