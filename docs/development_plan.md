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

### Phase 3: AI Tutor & Grounded RAG with Citations
- [ ] Semantic vector search repository with project-level isolation filters.
- [ ] Grounded AI Tutor prompting with explicit citation format (`Source: File - Page X`).
- [ ] Unsupported-question detector (returns uncertainty when evidence is insufficient).
- [ ] Conversation history & persistent learning context persistence.
- [ ] Frontend interactive chat interface with source citation previews.

### Phase 4: Adaptive Quiz, Assessment & Concept Mastery
- [ ] Concept extraction and relationship graph.
- [ ] Adaptive question generator (Multiple-Choice & Open-Ended).
- [ ] AI assessment engine evaluating open-ended answers against rubrics.
- [ ] Concept mastery probability estimation and growth classification (Improving/Stable/Attention).
- [ ] Frontend quiz taking and feedback results UI.

### Phase 5: Growth Analysis, Recommendations & Admin Dashboard
- [ ] Recommendation engine generating targeted next actions.
- [ ] Project-level and global analytics aggregates.
- [ ] Activity/event tracking pipeline.
- [ ] Administrative dashboard with visibility into users, AI usage, and system health.
- [ ] AI observability and evaluation suite (LangSmith integration).
- [ ] Production deployment to Vercel (Frontend) and Render/Railway (Backend).
