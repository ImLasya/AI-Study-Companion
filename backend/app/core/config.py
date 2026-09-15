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

    # 4. Redis & Celery (Phase 0 Required)
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

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
    GEMINI_MODEL: str = "gemini-3.6-flash"
    # Empirical prototype starting point (cosine distance <= 0.65 is accepted as relevant evidence).
    # Note: 0.65 is an empirical prototype threshold for all-MiniLM-L6-v2, not a guaranteed relevance cutoff.
    TUTOR_SIMILARITY_THRESHOLD: float = 0.65
    TUTOR_TOP_K: int = 5
    TUTOR_MAX_QUESTION_LENGTH: int = 2000
    TUTOR_HISTORY_LIMIT: int = 6  # Bounded recent message context window

    # Future Phases (Optional placeholders)
    OPENAI_API_KEY: str | None = None
    OPENAI_MODEL: str = "gpt-4o"
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"

    SUPABASE_URL: str | None = None
    SUPABASE_SERVICE_ROLE_KEY: str | None = None
    STORAGE_BUCKET: str = "study-companion-materials"

    LANGCHAIN_TRACING_V2: bool = False
    LANGCHAIN_API_KEY: str | None = None
    LANGCHAIN_PROJECT: str = "ai-study-companion"


settings = Settings()
