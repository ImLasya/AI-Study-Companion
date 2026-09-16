"""Tests for Project and Global Analytics (Phase 6).

Verifies SQL-level analytical aggregations, tenant isolation, and empty state handling.
"""

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_usage import AIUsageLog
from app.models.concept import Concept
from app.models.event import ActivityEvent
from app.models.mastery import ConceptMastery
from app.models.project import Project
from app.models.quiz import Quiz, QuizAttempt
from app.models.space import Space


@pytest.mark.asyncio
async def test_project_analytics_aggregation(client: AsyncClient, db_session: AsyncSession):
    # 1. Create User, Space, Project
    signup_resp = await client.post(
        "/api/v1/auth/signup",
        json={
            "email": "analytics_user@example.com",
            "password": "password123",
            "full_name": "Analytics Learner",
        },
    )
    assert signup_resp.status_code == 201
    user_id = uuid.UUID(signup_resp.json()["user"]["id"])

    space = Space(name="Data Science", user_id=user_id)
    db_session.add(space)
    await db_session.flush()

    project = Project(
        name="Machine Learning",
        learning_goal="Understand foundational ML algorithms",
        space_id=space.id,
        user_id=user_id,
    )
    db_session.add(project)
    await db_session.flush()

    # 2. Seed Concepts and Concept Mastery
    c1 = Concept(
        name="Linear Regression",
        description="Modeling scalar response",
        project_id=project.id,
        user_id=user_id,
    )
    c2 = Concept(
        name="Gradient Descent",
        description="First-order iterative optimization",
        project_id=project.id,
        user_id=user_id,
    )
    c3 = Concept(
        name="Overfitting",
        description="Fitting too closely to training data",
        project_id=project.id,
        user_id=user_id,
    )
    db_session.add_all([c1, c2, c3])
    await db_session.flush()

    # c1 = 80% (mastered), c2 = 40% (needs_attention), c3 = unassessed
    cm1 = ConceptMastery(
        project_id=project.id,
        user_id=user_id,
        concept_id=c1.id,
        mastery_score=80.0,
        confidence=0.85,
        evidence_count=5,
        last_updated_at=datetime.now(UTC),
    )
    cm2 = ConceptMastery(
        project_id=project.id,
        user_id=user_id,
        concept_id=c2.id,
        mastery_score=40.0,
        confidence=0.60,
        evidence_count=3,
        last_updated_at=datetime.now(UTC),
    )
    db_session.add_all([cm1, cm2])

    # 3. Seed Quiz and Quiz Attempt
    quiz = Quiz(project_id=project.id, user_id=user_id, title="ML Diagnostic")
    db_session.add(quiz)
    await db_session.flush()

    attempt = QuizAttempt(
        quiz_id=quiz.id,
        user_id=user_id,
        project_id=project.id,
        status="completed",
        score=75.0,
        total_questions=10,
        correct_answers=8,
        completed_at=datetime.now(UTC),
    )
    db_session.add(attempt)

    # 4. Seed Activity Events
    now = datetime.now(UTC)
    e1 = ActivityEvent(
        user_id=user_id,
        project_id=project.id,
        event_type="quiz_completed",
        payload={},
        created_at=now,
    )
    e2 = ActivityEvent(
        user_id=user_id,
        project_id=project.id,
        event_type="material_uploaded",
        payload={},
        created_at=now,
    )
    db_session.add_all([e1, e2])

    # 5. Seed AI Usage Logs
    ai_log = AIUsageLog(
        user_id=user_id,
        project_id=project.id,
        operation="tutor_response",
        provider="gemini",
        model="gemini-2.0-flash",
        latency_ms=1150.0,
        input_tokens=400,
        output_tokens=150,
        total_tokens=550,
        estimated_cost_usd=0.000100,
        success=True,
    )
    db_session.add(ai_log)
    await db_session.commit()

    # 6. Query Project Analytics Endpoint
    resp = await client.get(f"/api/v1/projects/{project.id}/analytics")
    assert resp.status_code == 200
    data = resp.json()

    assert data["project_id"] == str(project.id)

    # Verify Activity Buckets
    assert len(data["learning_activity"]) >= 1
    today_bucket = data["learning_activity"][0]
    assert today_bucket["event_count"] >= 2
    assert "quiz_completed" in today_bucket["event_breakdown"]

    # Verify Quiz Performance
    assert len(data["quiz_performance_trend"]) == 1
    assert data["quiz_performance_trend"][0]["score_percentage"] == 75.0
    assert data["quiz_performance_trend"][0]["passed"] is True

    # Verify Mastery Distribution (1 mastered, 1 needs attention, 1 unassessed)
    dist = data["current_mastery_distribution"]
    assert dist["mastered"] == 1
    assert dist["needs_attention"] == 1
    assert dist["unassessed"] == 1
    assert dist["overall_average"] == 60.0  # (80 + 40) / 2

    # Verify AI Activity
    assert data["ai_activity"]["total_calls"] == 1
    assert data["ai_activity"]["total_tokens"] == 550
    assert "tutor_response" in data["ai_activity"]["calls_by_operation"]


@pytest.mark.asyncio
async def test_global_analytics_tenant_isolation(client: AsyncClient, db_session: AsyncSession):
    # User A
    resp_a = await client.post(
        "/api/v1/auth/signup",
        json={"email": "user_a@example.com", "password": "password123"},
    )
    user_a_id = uuid.UUID(resp_a.json()["user"]["id"])

    # User B
    resp_b = await client.post(
        "/api/v1/auth/signup",
        json={"email": "user_b@example.com", "password": "password123"},
    )
    user_b_id = uuid.UUID(resp_b.json()["user"]["id"])

    # Space & Project for User B
    space_b = Space(name="Secret Space B", user_id=user_b_id)
    db_session.add(space_b)
    await db_session.flush()

    proj_b = Project(
        name="Secret Project B",
        learning_goal="Confidential",
        space_id=space_b.id,
        user_id=user_b_id,
    )
    db_session.add(proj_b)
    await db_session.flush()

    concept_b = Concept(
        name="Secret Concept B",
        description="Secret description",
        project_id=proj_b.id,
        user_id=user_b_id,
    )
    db_session.add(concept_b)
    await db_session.flush()

    cm_b = ConceptMastery(
        project_id=proj_b.id,
        user_id=user_b_id,
        concept_id=concept_b.id,
        mastery_score=25.0,  # Weak area for B
        confidence=0.9,
        evidence_count=4,
        last_updated_at=datetime.now(UTC),
    )
    db_session.add(cm_b)
    await db_session.commit()

    # Log in as User A
    await client.post(
        "/api/v1/auth/login", json={"email": "user_a@example.com", "password": "password123"}
    )

    # 1. Global Analytics as User A should NOT contain User B's weak areas or projects
    resp_global = await client.get("/api/v1/analytics/global")
    assert resp_global.status_code == 200
    g_data = resp_global.json()

    assert g_data["user_id"] == str(user_a_id)
    assert len(g_data["projects_by_progress"]) == 0
    assert len(g_data["weakest_areas"]) == 0

    # 2. User A cannot access User B's project analytics -> 404
    resp_leak = await client.get(f"/api/v1/projects/{proj_b.id}/analytics")
    assert resp_leak.status_code == 404
    assert "Project not found" in resp_leak.json()["detail"]


@pytest.mark.asyncio
async def test_analytics_empty_project(client: AsyncClient, db_session: AsyncSession):
    # Empty project without quizzes, mastery, materials, or AI usage
    signup = await client.post(
        "/api/v1/auth/signup",
        json={"email": "empty_proj_user@example.com", "password": "password123"},
    )
    user_id = uuid.UUID(signup.json()["user"]["id"])

    space = Space(name="Empty Space", user_id=user_id)
    db_session.add(space)
    await db_session.flush()

    proj = Project(
        name="Empty Project", learning_goal="Nothing yet", space_id=space.id, user_id=user_id
    )
    db_session.add(proj)
    await db_session.commit()

    resp = await client.get(f"/api/v1/projects/{proj.id}/analytics")
    assert resp.status_code == 200
    data = resp.json()

    assert data["project_id"] == str(proj.id)
    assert len(data["learning_activity"]) == 0
    assert len(data["quiz_performance_trend"]) == 0
    assert data["current_mastery_distribution"]["overall_average"] is None
    assert data["ai_activity"]["total_calls"] == 0
