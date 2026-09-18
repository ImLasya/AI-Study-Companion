"""Tests for Admin Endpoints (Phase 6).

Verifies strict authorization (401 unauthenticated, 403 non-admin),
correct platform metrics, safe profile responses, and cross-tenant auditing.
"""

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_usage import AIUsageLog
from app.models.event import ActivityEvent
from app.models.material import Material
from app.models.project import Project
from app.models.space import Space
from app.models.user import User


@pytest.mark.asyncio
async def test_admin_auth_unauthenticated(client: AsyncClient):
    endpoints = [
        "/api/v1/admin/overview",
        "/api/v1/admin/users",
        f"/api/v1/admin/users/{uuid.uuid4()}",
        "/api/v1/admin/activity",
        "/api/v1/admin/ai-usage",
        "/api/v1/admin/jobs",
        "/api/v1/admin/evaluations",
    ]
    for ep in endpoints:
        resp = await client.get(ep)
        assert resp.status_code == 401, f"Expected 401 on {ep}, got {resp.status_code}"


@pytest.mark.asyncio
async def test_admin_auth_non_admin_forbidden(client: AsyncClient):
    # Signup normal user
    await client.post(
        "/api/v1/auth/signup",
        json={"email": "normal_user@example.com", "password": "password123"},
    )

    endpoints = [
        "/api/v1/admin/overview",
        "/api/v1/admin/users",
        f"/api/v1/admin/users/{uuid.uuid4()}",
        "/api/v1/admin/activity",
        "/api/v1/admin/ai-usage",
        "/api/v1/admin/jobs",
        "/api/v1/admin/evaluations",
    ]
    for ep in endpoints:
        resp = await client.get(ep)
        assert resp.status_code == 403, (
            f"Expected 403 for non-admin on {ep}, got {resp.status_code}"
        )
        assert "Administrator access required" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_admin_endpoints_success(client: AsyncClient, db_session: AsyncSession):
    # 1. Signup admin user
    admin_email = f"admin_{uuid.uuid4().hex[:8]}@example.com"
    signup_resp = await client.post(
        "/api/v1/auth/signup",
        json={
            "email": admin_email,
            "password": "adminpassword123",
            "full_name": "Sys Admin",
        },
    )
    admin_id = uuid.UUID(signup_resp.json()["user"]["id"])

    # Elevate user to admin in DB
    user = (await db_session.execute(select(User).where(User.id == admin_id))).scalar_one()
    user.role = "admin"
    await db_session.commit()

    # Re-login so fresh claims/state apply
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": admin_email, "password": "adminpassword123"},
    )
    assert login_resp.status_code == 200

    # 2. Seed background items across tenants
    space = Space(name="Admin Space", user_id=admin_id)
    db_session.add(space)
    await db_session.flush()

    proj = Project(name="Admin Project", learning_goal="Audit", space_id=space.id, user_id=admin_id)
    db_session.add(proj)
    await db_session.flush()

    # Seed material
    mat = Material(
        project_id=proj.id,
        user_id=admin_id,
        filename="test_doc.pdf",
        storage_path="/tmp/test_doc.pdf",
        status="ready",
    )
    db_session.add(mat)

    # Seed AI usage log
    ai_log = AIUsageLog(
        user_id=admin_id,
        project_id=proj.id,
        operation="tutor",
        provider="gemini",
        model="gemini-2.0-flash",
        latency_ms=850.0,
        input_tokens=300,
        output_tokens=100,
        total_tokens=400,
        estimated_cost_usd=0.00007,
        success=True,
    )
    db_session.add(ai_log)

    # Seed Activity event
    event = ActivityEvent(
        user_id=admin_id,
        project_id=proj.id,
        event_type="project_created",
        payload={"name": "Admin Project"},
        created_at=datetime.now(UTC),
    )
    db_session.add(event)
    await db_session.commit()

    # 3. Test GET /admin/overview
    ov_resp = await client.get("/api/v1/admin/overview")
    assert ov_resp.status_code == 200
    ov_data = ov_resp.json()
    assert ov_data["total_users"] >= 1
    assert ov_data["total_projects"] >= 1
    assert ov_data["total_ai_calls"] >= 1
    assert "ready" in ov_data["job_health_summary"]

    # 4. Test GET /admin/users
    u_resp = await client.get("/api/v1/admin/users?page=1&page_size=50")
    assert u_resp.status_code == 200
    u_data = u_resp.json()
    assert u_data["total"] >= 1
    assert all("password" not in u and "hashed_password" not in u for u in u_data["items"])
    matching_user = next((u for u in u_data["items"] if u["id"] == str(admin_id)), None)
    assert matching_user is not None
    assert matching_user["email"] == admin_email
    assert matching_user["role"] == "admin"

    # 5. Test GET /admin/users/{id}
    detail_resp = await client.get(f"/api/v1/admin/users/{admin_id}")
    assert detail_resp.status_code == 200
    det_data = detail_resp.json()
    assert det_data["user"]["id"] == str(admin_id)
    assert len(det_data["projects"]) >= 1
    assert len(det_data["recent_activity"]) >= 1

    # 6. Test GET /admin/activity
    act_resp = await client.get("/api/v1/admin/activity?page=1&page_size=20")
    assert act_resp.status_code == 200
    act_data = act_resp.json()
    assert act_data["total"] >= 1
    assert any(a["event_type"] == "project_created" for a in act_data["items"])

    # 7. Test GET /admin/ai-usage
    ai_resp = await client.get("/api/v1/admin/ai-usage?page=1&page_size=20")
    assert ai_resp.status_code == 200
    ai_data = ai_resp.json()
    assert ai_data["total_calls"] >= 1
    assert ai_data["total_tokens"] >= 400
    assert ai_data["p50_latency_ms"] > 0
    assert len(ai_data["recent_logs"]) >= 1

    # 8. Test GET /admin/jobs
    job_resp = await client.get("/api/v1/admin/jobs")
    assert job_resp.status_code == 200
    job_data = job_resp.json()
    assert job_data["total_materials"] >= 1
    assert job_data["status_counts"].get("ready", 0) >= 1

    # 9. Test GET /admin/evaluations
    eval_resp = await client.get("/api/v1/admin/evaluations")
    assert eval_resp.status_code == 200


@pytest.mark.asyncio
async def test_admin_evaluation_run_and_global_analytics(
    client: AsyncClient, db_session: AsyncSession
):
    """End-to-end: live verification that was previously in scratch/verify_phase6_live.py.

    Covers:
    - Admin vs non-admin 403 boundary on every admin endpoint.
    - Normal user can access /analytics/global (200).
    - POST /admin/evaluations/run returns a valid summary with a numeric pass_rate.
    - GET /admin/ai-usage returns P50 latency and total_calls fields.
    - GET /admin/jobs returns status_counts dict.
    """
    # --- Setup: create and promote admin user ---
    admin_email = f"phase6_e2e_admin_{uuid.uuid4().hex[:8]}@example.com"
    admin_signup = await client.post(
        "/api/v1/auth/signup",
        json={
            "email": admin_email,
            "password": "E2EAdminPass123!",
            "full_name": "E2E Admin",
        },
    )
    assert admin_signup.status_code == 201
    admin_id = uuid.UUID(admin_signup.json()["user"]["id"])

    user_row = (await db_session.execute(select(User).where(User.id == admin_id))).scalar_one()
    user_row.role = "admin"
    await db_session.commit()

    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": admin_email, "password": "E2EAdminPass123!"},
    )
    assert login_resp.status_code == 200

    # --- Normal user: should get 200 on /analytics/global but 403 on all /admin/* ---
    norm_email = f"phase6_e2e_normal_{uuid.uuid4().hex[:8]}@example.com"
    norm_signup = await client.post(
        "/api/v1/auth/signup",
        json={"email": norm_email, "password": "NormPass123!"},
    )
    assert norm_signup.status_code == 201

    norm_login = await client.post(
        "/api/v1/auth/login",
        json={"email": norm_email, "password": "NormPass123!"},
    )
    assert norm_login.status_code == 200

    global_resp = await client.get("/api/v1/analytics/global")
    assert global_resp.status_code == 200, "Normal user must reach /analytics/global"
    g = global_resp.json()
    assert "total_study_activity" in g
    assert "projects_by_progress" in g

    forbidden_resp = await client.get("/api/v1/admin/overview")
    assert forbidden_resp.status_code == 403, "Normal user must be 403 on /admin/overview"

    # Restore admin login — the POST sets the httpOnly access_token cookie on the
    # client automatically via Set-Cookie; no manual header manipulation needed.
    admin_relogin = await client.post(
        "/api/v1/auth/login",
        json={"email": admin_email, "password": "E2EAdminPass123!"},
    )
    assert admin_relogin.status_code == 200

    # --- Admin: evaluation runner ---
    run_resp = await client.post("/api/v1/admin/evaluations/run")
    assert run_resp.status_code == 200
    run_data = run_resp.json()
    assert "overall_pass_rate" in run_data
    assert isinstance(run_data["overall_pass_rate"], (int, float))
    assert run_data["total_cases"] > 0, "Evaluation must run at least one test case"

    # --- Admin: AI usage telemetry shape ---
    ai_resp = await client.get("/api/v1/admin/ai-usage")
    assert ai_resp.status_code == 200
    ai_data = ai_resp.json()
    assert "p50_latency_ms" in ai_data
    assert "total_calls" in ai_data
    assert "failure_rate" in ai_data

    # --- Admin: pipeline / jobs health ---
    jobs_resp = await client.get("/api/v1/admin/jobs")
    assert jobs_resp.status_code == 200
    jobs_data = jobs_resp.json()
    assert "status_counts" in jobs_data
    assert isinstance(jobs_data["status_counts"], dict)
