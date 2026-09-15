# AI Study Companion - Backend

FastAPI backend service for the **AI Study Companion** platform.

## Architecture

- **FastAPI**: Asynchronous web framework exposing RESTful endpoints.
- **SQLAlchemy 2.0 (asyncpg)**: Fully asynchronous ORM and database engine.
- **pgvector**: Vector extension support for high-dimensional semantic embeddings.
- **Alembic**: Database schema migration management.
- **Celery + Redis**: Background asynchronous job processing.
- **Pydantic v2**: Strict request/response validation schemas and settings management.

## Module Structure

```
backend/app/
├── api/v1/         # Versioned API routes (/health, /spaces, /projects, etc.)
├── core/           # Configuration, security, logging
├── db/             # Database session and base model definitions
├── models/         # SQLAlchemy ORM models (Phase 1)
├── schemas/        # Pydantic validation schemas
├── repositories/   # Persistence & query abstractions (Phase 1+)
├── services/       # Domain business logic (Phase 2+)
├── ai/             # LLM orchestration, embeddings, evaluations (Phase 3+)
├── workflows/      # Multi-step stateful workflows (Phase 3+)
├── events/         # Event bus, publishers, handlers (Phase 4+)
├── workers/        # Celery background tasks (Phase 4+)
└── main.py         # Application entrypoint
```

## Quick Start

### 1. Prerequisites
- Python 3.11+
- `uv` (recommended) or `pip`
- Docker & Docker Compose (for PostgreSQL + Redis)

### 2. Environment Configuration
```bash
cp .env.example .env
```

### 3. Install Dependencies
```bash
# Using uv (fastest)
uv sync

# Or using pip
pip install -e ".[dev]"
```

### 4. Database Migrations
```bash
alembic upgrade head
```

### 5. Start Development Server
```bash
uv run uvicorn app.main:app --reload --port 8000
```
Interactive API documentation will be available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### 6. Run Tests and Quality Checks
```bash
# Run pytest suite
uv run pytest

# Run linter
uv run ruff check .

# Run type checker
uv run mypy app
```
