"""Tests for AI Evaluation Harness (Phase 6).

Verifies deterministic evaluation run against MockLLMProvider,
storage in ai_evaluation_runs, and admin evaluation run endpoint.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.gemini_provider import MockLLMProvider, set_llm_provider
from app.evaluations.runner import AIEvaluationRunner
from app.models.evaluation import AIEvaluationRun
from app.models.user import User


@pytest.fixture(autouse=True)
def ensure_mock_provider():
    set_llm_provider(MockLLMProvider())
    yield
    set_llm_provider(None)


@pytest.mark.asyncio
async def test_evaluation_runner_mock_provider(db_session: AsyncSession):
    """Verifies that the evaluation harness runs deterministically against MockLLMProvider."""
    runner = AIEvaluationRunner(db_session, provider=MockLLMProvider())
    summary = await runner.run_all()

    assert summary["total_cases"] >= 5
    assert summary["passed_cases"] == summary["total_cases"]
    assert summary["pass_rate"] == 100.0

    # Verify rows in database
    db_runs = (
        (
            await db_session.execute(
                select(AIEvaluationRun).where(AIEvaluationRun.run_id == summary["run_id"])
            )
        )
        .scalars()
        .all()
    )

    assert len(db_runs) == summary["total_cases"]
    suites = {r.suite for r in db_runs}
    assert "tutor_grounding" in suites
    assert "citation_correctness" in suites
    assert "unsupported_handling" in suites
    assert "retrieval_relevance" in suites


@pytest.mark.asyncio
async def test_evaluations_admin_run_endpoint(client: AsyncClient, db_session: AsyncSession):
    # 1. Non-admin gets 403
    await client.post(
        "/api/v1/auth/signup",
        json={"email": "student@example.com", "password": "password123"},
    )
    unauth_run = await client.post("/api/v1/admin/evaluations/run")
    assert unauth_run.status_code == 403

    # 2. Admin gets 200 and triggers execution
    signup_resp = await client.post(
        "/api/v1/auth/signup",
        json={"email": "eval_admin@example.com", "password": "password123"},
    )
    admin_id = uuid.UUID(signup_resp.json()["user"]["id"])

    user = (await db_session.execute(select(User).where(User.id == admin_id))).scalar_one()
    user.role = "admin"
    await db_session.commit()

    await client.post(
        "/api/v1/auth/login",
        json={"email": "eval_admin@example.com", "password": "password123"},
    )

    run_resp = await client.post("/api/v1/admin/evaluations/run")
    assert run_resp.status_code == 200
    run_data = run_resp.json()

    assert run_data["latest_run_id"] is not None
    assert run_data["total_cases"] >= 5
    assert run_data["passed_cases"] >= 5
    assert run_data["overall_pass_rate"] >= 80.0
    assert len(run_data["suite_summaries"]) >= 4
