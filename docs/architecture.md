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
