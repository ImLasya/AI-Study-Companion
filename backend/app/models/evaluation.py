"""AI Evaluation Run Model (Phase 6).

Stores evaluation harness test execution runs (suite, case, pass/fail, score, notes)
for quality metrics and regression detection without requiring external judging models.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AIEvaluationRun(Base):
    __tablename__ = "ai_evaluation_runs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    suite: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    case_id: Mapped[str] = mapped_column(String(100), nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
