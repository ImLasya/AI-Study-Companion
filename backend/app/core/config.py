from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # 1. Core & Runtime (Phase 0 Required)
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    APP_VERSION: str = "0.1.0"
    API_V1_PREFIX: str = "/api/v1"

    # 2. CORS & Networking (Phase 0 Required)
    CORS_ORIGINS: list[str] | str = ["http://localhost:3000", "http://127.0.0.1:3000"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, list):
            return v
        return ["http://localhost:3000", "http://127.0.0.1:3000"]

    # 3. Database (Phase 0 Required)
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/ai_study_companion"
    SYNC_DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/ai_study_companion"
    TEST_DATABASE_URL: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:5432/ai_study_companion_test"
    )

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def assemble_database_url(cls, v: str | None) -> str:
        if not v:
            return "postgresql+asyncpg://postgres:postgres@localhost:5432/ai_study_companion"
        # Railway and cloud providers inject postgres:// or postgresql://
        if v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql+asyncpg://", 1)
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    @field_validator("SYNC_DATABASE_URL", mode="before")
    @classmethod
    def assemble_sync_database_url(cls, v: str | None, info) -> str:
        raw = v
        # If not explicitly provided, or if left as default while DATABASE_URL was overridden
        default_sync = "postgresql://postgres:postgres@localhost:5432/ai_study_companion"
        if not raw or raw == default_sync:
            db_url = info.data.get("DATABASE_URL")
            default_async = "postgresql+asyncpg://postgres:postgres@localhost:5432/ai_study_companion"
            if db_url and db_url != default_async:
                raw = db_url

        if not raw:
            return default_sync
        if raw.startswith("postgresql+asyncpg://"):
            return raw.replace("postgresql+asyncpg://", "postgresql://", 1)
        if raw.startswith("postgres://"):
            return raw.replace("postgres://", "postgresql://", 1)
        return raw

    # 4. Redis & Celery (Phase 0 Required)
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    @field_validator("CELERY_BROKER_URL", mode="before")
    @classmethod
    def assemble_celery_broker_url(cls, v: str | None, info) -> str:
        redis_url: str = str(info.data.get("REDIS_URL") or "")
        env = str(info.data.get("ENVIRONMENT", "development"))
        # If explicitly specified to a custom URL, respect it
        if v and v != "redis://localhost:6379/0":
            return str(v)
        # Use REDIS_URL if non-default
        if redis_url and redis_url != "redis://localhost:6379/0":
            return redis_url
        if env.lower() == "production" and (not v or v == "redis://localhost:6379/0"):
            if not redis_url or redis_url == "redis://localhost:6379/0":
                raise ValueError(
                    "In production, REDIS_URL or CELERY_BROKER_URL must be configured and cannot be localhost."
                )
        return str(redis_url or v or "redis://localhost:6379/0")

    @field_validator("CELERY_RESULT_BACKEND", mode="before")
    @classmethod
    def assemble_celery_result_backend(cls, v: str | None, info) -> str:
        redis_url: str = str(info.data.get("REDIS_URL") or "")
        env = str(info.data.get("ENVIRONMENT", "development"))
        if v and v != "redis://localhost:6379/1":
            return str(v)
        if redis_url and redis_url != "redis://localhost:6379/0":
            return redis_url
        if env.lower() == "production" and (not v or v == "redis://localhost:6379/1"):
            if not redis_url or redis_url == "redis://localhost:6379/0":
                raise ValueError(
                    "In production, REDIS_URL or CELERY_RESULT_BACKEND must be configured and cannot be localhost."
                )
        return str(redis_url or v or "redis://localhost:6379/1")

    # 5. Authentication & JWT
    JWT_SECRET: str = "development-insecure-secret-key-32-chars-long"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60  # 1 hour
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days

    # 6. Phase 2: Learning Materials & Embeddings
    STORAGE_PATH: str = "./storage"
    MAX_UPLOAD_SIZE_BYTES: int = 20 * 1024 * 1024  # 20 MB limit
    EMBEDDING_MODEL_NAME: str = "sentence-transformers/all-MiniLM-L6-v2"
    EMBEDDING_DIMENSION: int = 384

    # 7. Phase 3: AI Tutor & Grounded RAG
    GEMINI_API_KEY: str | None = None
    GEMINI_MODEL: str = "gemini-flash-lite-latest"
    # Empirical prototype starting point (cosine distance <= 0.65 is accepted as relevant evidence).
    # Note: 0.65 is an empirical prototype threshold for all-MiniLM-L6-v2, not a guaranteed relevance cutoff.
    TUTOR_SIMILARITY_THRESHOLD: float = 0.65
    TUTOR_TOP_K: int = 10
    TUTOR_MAX_QUESTION_LENGTH: int = 2000
    TUTOR_HISTORY_LIMIT: int = 6  # Bounded recent message context window

    # 8. Phase 4: Adaptive Quiz & Assessment
    QUIZ_QUESTION_COUNT: int = 5
    QUIZ_MAX_OPTIONS: int = 4
    QUIZ_DIFFICULTY_LEVELS: list[str] = ["easy", "medium", "hard"]
    QUIZ_MAX_GENERATION_RETRIES: int = 2
    QUIZ_OPEN_ENDED_PASSING_SCORE: float = 0.7

    # Future Phases (Optional placeholders)
    OPENAI_API_KEY: str | None = None
    OPENAI_MODEL: str = "gpt-4o"
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"

    SUPABASE_URL: str | None = None
    SUPABASE_SERVICE_ROLE_KEY: str | None = None
    STORAGE_BUCKET: str = "study-companion-materials"

    # LangSmith Tracing & Observability (Optional)
    LANGSMITH_TRACING: bool = False
    LANGSMITH_API_KEY: str | None = None
    LANGSMITH_PROJECT: str | None = None
    LANGSMITH_ENDPOINT: str = "https://api.smith.langchain.com"

    # Backward compatibility with legacy LANGCHAIN_* environment variables
    LANGCHAIN_TRACING_V2: bool = False
    LANGCHAIN_API_KEY: str | None = None
    LANGCHAIN_PROJECT: str = "ai-study-companion"
    LANGCHAIN_ENDPOINT: str = "https://api.smith.langchain.com"

    @property
    def is_langsmith_enabled(self) -> bool:
        """Check if LangSmith tracing is enabled and credentials are present."""
        tracing_flag = self.LANGSMITH_TRACING or self.LANGCHAIN_TRACING_V2
        api_key = self.LANGSMITH_API_KEY or self.LANGCHAIN_API_KEY
        return bool(tracing_flag and api_key and api_key.strip())

    @property
    def langsmith_api_key(self) -> str | None:
        """Resolve LangSmith API key with fallback to legacy LANGCHAIN_API_KEY."""
        return self.LANGSMITH_API_KEY or self.LANGCHAIN_API_KEY

    @property
    def langsmith_project(self) -> str:
        """Resolve LangSmith project name with fallback to legacy LANGCHAIN_PROJECT."""
        return self.LANGSMITH_PROJECT or self.LANGCHAIN_PROJECT or "ai-study-companion"

    @property
    def langsmith_endpoint(self) -> str:
        """Resolve LangSmith endpoint with fallback to legacy LANGCHAIN_ENDPOINT."""
        return self.LANGSMITH_ENDPOINT or self.LANGCHAIN_ENDPOINT or "https://api.smith.langchain.com"


settings = Settings()
