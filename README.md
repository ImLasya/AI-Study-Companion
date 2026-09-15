# AI Study Companion

> **A persistent, contextual, measurable AI learning workspace** designed to help learners understand, practice, measure, and continuously improve in any area of knowledge.

Based on **Product Requirements Document (PRD v3.0)**.

---

## 1. Overview & Core Learning Loop

AI Study Companion integrates learning materials, grounded AI tutoring, adaptive assessments, concept mastery tracking, and growth analysis into a single unified learning loop:

```
Space ➔ Project ➔ Learning Material ➔ Document Processing ➔ Knowledge/RAG
      ➔ AI Tutor ➔ Adaptive Quiz ➔ Assessment ➔ Concept Mastery
      ➔ Growth Analysis ➔ Recommendation ➔ Continue Learning
```

### Key Architectural Principles
- **Context First**: Strict project-level data isolation. Knowledge from unrelated projects never bleeds into tutoring responses.
- **Evidence Over Guessing**: Tutoring answers are grounded in uploaded documents with exact page citations (`Source: Notes.pdf — Page 14`). When evidence is lacking, the AI explicitly reports insufficient information.
- **Persistent Relevant Context**: Maintains learner strengths, repeated mistakes, and mastery without overflowing LLM context windows.
- **Asynchronous by Design**: Heavy processing (PDF extraction, OCR, vector embeddings, evaluations) runs asynchronously via Celery and Redis.
- **Controlled Application Interfaces**: AI components interact with application features through strictly validated interfaces.

---

## 2. Monorepo Repository Structure

```
ai-study-companion/
├── .github/
│   └── workflows/
│       └── ci.yml                 # GitHub Actions (Ruff, Mypy, Pytest, ESLint, TSC, Build)
├── backend/
│   ├── app/
│   │   ├── api/v1/
│   │   │   ├── endpoints/health.py# /health, /health/ready, /health/db
│   │   │   └── router.py          # Central v1 router
│   │   ├── core/
│   │   │   ├── config.py          # Pydantic BaseSettings (Phase 0 required + optional)
│   │   │   └── logging.py         # Structured application logging
│   │   ├── db/
│   │   │   ├── base.py            # SQLAlchemy DeclarativeBase with timestamp mixins
│   │   │   └── session.py         # Async engine & pgvector connectivity probe
│   │   ├── models/                # Domain models (Phase 1)
│   │   ├── schemas/               # Pydantic request/response schemas
│   │   ├── repositories/          # Database query abstraction layer (Phase 1+)
│   │   ├── services/              # Domain business logic (Phase 2+)
│   │   ├── ai/                    # LLMs, embeddings, and prompt templates (Phase 3+)
│   │   ├── workflows/             # Stateful orchestration (Phase 3+)
│   │   ├── events/                # Event publishers and subscribers (Phase 4+)
│   │   ├── workers/               # Celery app and asynchronous task workers (Phase 4+)
│   │   └── main.py                # FastAPI application entrypoint with CORS & lifespan
│   ├── migrations/                # Alembic database migrations
│   │   ├── env.py
│   │   └── versions/0001_enable_pgvector.py
│   ├── tests/
│   │   ├── conftest.py            # Async test fixtures
│   │   └── test_health.py         # Health probe test suite
│   ├── alembic.ini
│   ├── pyproject.toml
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/health/route.ts# Next.js route health probe
│   │   │   ├── layout.tsx         # Root layout with dark theme tokens
│   │   │   ├── page.tsx           # Phase 0 System Dashboard & Loop Visualizer
│   │   │   └── globals.css        # Tailwind CSS styling
│   │   ├── components/            # Header, SystemStatusCard
│   │   ├── lib/api.ts             # Backend API client
│   │   └── types/index.ts         # Phase 0 TypeScript contracts
│   ├── package.json
│   ├── tsconfig.json
│   └── tailwind.config.ts
├── docs/
│   ├── architecture.md            # System architecture & service boundaries
│   ├── data_model.md              # Entity-relationship & vector index design
│   ├── learning_loop.md           # 12-step learning loop specification
│   └── development_plan.md        # Phase-by-phase execution plan
├── scripts/
│   ├── setup.ps1                  # Monorepo setup script (PowerShell)
│   ├── dev-backend.ps1            # Starts FastAPI backend
│   ├── dev-frontend.ps1           # Starts Next.js frontend
│   └── test.ps1                   # Runs all tests, linters, and type checkers
├── docker-compose.yml             # PostgreSQL 16 (pgvector/pgvector:pg16) + Redis 7
├── .env.example                   # Master environment variables template
└── README.md
```

---

## 3. Technology Stack

- **Frontend**: Next.js 14 (App Router), TypeScript (Strict Mode), Tailwind CSS, Lucide Icons.
- **Backend**: FastAPI, Python 3.11+, Pydantic v2, SQLAlchemy 2.0 (asyncpg).
- **Database & Vectors**: PostgreSQL 16, pgvector extension, Alembic.
- **Worker & Cache**: Redis 7, Celery 5.
- **Quality Assurance**: Pytest, pytest-asyncio, HTTPX, Ruff, Mypy, ESLint, TypeScript compiler.

---

## 4. Quick Start Guide

### Prerequisites
- **Node.js**: `v20+` (npm `10+`)
- **Python**: `3.11+` (`uv` package manager recommended)
- **Docker & Docker Compose** (for PostgreSQL + Redis)

### Step 1: Clone and Configure Environment
```bash
# Clone the repository
git clone <repo-url>
cd ai-study-companion

# Copy environment variables
cp .env.example .env
```

### Step 2: Start Infrastructure (PostgreSQL + pgvector & Redis)
```bash
docker compose up -d
```

### Step 3: Set Up & Run Backend
```bash
cd backend

# Using uv
uv sync
# Or using pip: pip install -e ".[dev]"

# Run database migrations
uv run alembic upgrade head

# Start FastAPI dev server
uv run uvicorn app.main:app --reload --port 8000
```
- **Backend API**: `http://localhost:8000`
- **Interactive OpenAPI Docs**: `http://localhost:8000/docs`

### Step 4: Set Up & Run Frontend
```bash
cd frontend

# Install dependencies
npm install

# Start Next.js dev server
npm run dev
```
- **Frontend App**: `http://localhost:3000`

---

## 5. Health Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/health` | `GET` | **Liveness Probe**: Confirms the FastAPI process is responsive. Always returns `200 OK`. |
| `/api/v1/health/ready` | `GET` | **Readiness Probe**: Checks PostgreSQL and Redis connectivity. Returns `200 OK` if ready, or `503 Service Unavailable` if dependencies are down. |
| `/api/v1/health/db` | `GET` | **Database Probe**: Runs a SQL query and verifies the `pgvector` extension is active. |

---

## 6. Testing & Code Quality

You can run all tests and quality checks with a single command:
```powershell
# PowerShell script running monorepo test suite
.\scripts\test.ps1
```

Or individually:

### Backend Quality Suite
```bash
cd backend

# 1. Pytest suite
uv run pytest

# 2. Ruff linter
uv run ruff check .

# 3. Mypy type checker
uv run mypy app
```

### Frontend Quality Suite
```bash
cd frontend

# 1. TypeScript compilation
npm run typecheck

# 2. Production build
npm run build
```

---

## 7. Documentation Links
- [System Architecture](docs/architecture.md)
- [Data Model & Embeddings](docs/data_model.md)
- [12-Step Learning Loop](docs/learning_loop.md)
- [Phase-by-Phase Roadmap](docs/development_plan.md)
