from pydantic import BaseModel, Field


class HealthStatus(BaseModel):
    status: str = Field(default="healthy", description="Application liveness status")
    version: str = Field(..., description="API Version")


class ReadyStatus(BaseModel):
    status: str = Field(
        ..., description="'ready' if all critical services are healthy, else 'not_ready'"
    )
    database: str = Field(..., description="'connected' or 'unavailable'")
    redis: str = Field(..., description="'connected' or 'unavailable'")
    details: dict | None = Field(default=None, description="Optional diagnostic details")


class DatabaseHealthStatus(BaseModel):
    status: str = Field(..., description="'healthy' or 'unhealthy'")
    database: str = Field(default="postgresql", description="Underlying database engine")
    pgvector: bool = Field(..., description="Whether pgvector extension is installed and ready")
    error: str | None = Field(default=None, description="Error message if database is unavailable")
