"""Live Integration Tests for Admin & Analytics (Phase 6).

Moved from scratch/verify_phase6_live.py to run in pytest and CI.
Validates end-to-end admin promotion, 403 isolation boundary,
global analytics access, live evaluation runner, AI telemetry, and pipeline health.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


@pytest.mark.asyncio
async def test_admin_live_e2e_flow(client: AsyncClient, db_session: AsyncSession):
    # 1. Health check
    res = await client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"

    # 2. Register & Promote Admin
    admin_email = f"admin_live_{uuid.uuid4().hex[:8]}@example.com"
    password = "AdminPassword123!"

    reg_res = await client.post(
        "/api/v1/auth/signup",
        json={
            "email": admin_email,
            "password": password,
            "full_name": "Phase 6 Admin Live",
        },
    )
    assert reg_res.status_code == 201
    admin_id = uuid.UUID(reg_res.json()["user"]["id"])

    # Promote user to admin in DB directly
    stmt = update(User).where(User.id == admin_id).values(role="admin")
    await db_session.execute(stmt)
    await db_session.commit()

    # Login admin
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"email": admin_email, "password": password},
    )
    assert login_res.status_code == 200
    admin_cookies = login_res.cookies

    # 3. Test Admin Overview with Admin User
    client.cookies.clear()
    for k, v in admin_cookies.items():
        client.cookies.set(k, v)

    overview_res = await client.get("/api/v1/admin/overview")
    assert overview_res.status_code == 200
    overview_data = overview_res.json()
    assert "total_users" in overview_data
    assert "total_spaces" in overview_data
    assert "total_ai_calls" in overview_data

    # 4. Register Normal User and verify 403 Forbidden on Admin endpoint
    norm_email = f"norm_live_{uuid.uuid4().hex[:8]}@example.com"
    norm_reg = await client.post(
        "/api/v1/auth/signup",
        json={
            "email": norm_email,
            "password": password,
            "full_name": "Normal Learner Live",
        },
    )
    assert norm_reg.status_code == 201

    norm_login = await client.post(
        "/api/v1/auth/login",
        json={"email": norm_email, "password": password},
    )
    assert norm_login.status_code == 200
    norm_cookies = norm_login.cookies

    client.cookies.clear()
    for k, v in norm_cookies.items():
        client.cookies.set(k, v)

    forbidden_res = await client.get("/api/v1/admin/overview")
    assert forbidden_res.status_code == 403
    assert "Administrator access required" in forbidden_res.json()["detail"]

    # 5. Global Analytics for Normal User
    global_res = await client.get("/api/v1/analytics/global")
    assert global_res.status_code == 200
    global_data = global_res.json()
    assert "total_study_activity" in global_data
    assert "projects_by_progress" in global_data

    # Restore Admin Cookies
    client.cookies.clear()
    for k, v in admin_cookies.items():
        client.cookies.set(k, v)

    # 6. Run AI Evaluation via Admin API
    eval_run_res = await client.post("/api/v1/admin/evaluations/run")
    assert eval_run_res.status_code == 200
    eval_data = eval_run_res.json()
    assert "overall_pass_rate" in eval_data
    assert eval_data["total_cases"] > 0
    assert "cases" in eval_data

    # 7. AI Telemetry Query
    telemetry_res = await client.get("/api/v1/admin/ai-usage")
    assert telemetry_res.status_code == 200
    telemetry_data = telemetry_res.json()
    assert "p50_latency_ms" in telemetry_data
    assert "total_calls" in telemetry_data
    assert "recent_logs" in telemetry_data

    # 8. Admin Job Health Query
    jobs_res = await client.get("/api/v1/admin/jobs")
    assert jobs_res.status_code == 200
    jobs_data = jobs_res.json()
    assert "status_counts" in jobs_data
    assert "recent_failures" in jobs_data

    # 9. Admin Users List & Journey Detail Query
    users_res = await client.get("/api/v1/admin/users?page=1&page_size=10")
    assert users_res.status_code == 200
    users_data = users_res.json()
    assert users_data["total"] >= 1
    assert len(users_data["items"]) >= 1

    detail_res = await client.get(f"/api/v1/admin/users/{admin_id}")
    assert detail_res.status_code == 200
    detail_data = detail_res.json()
    assert detail_data["user"]["email"] == admin_email
    assert "spaces_count" in detail_data

    # 10. Admin Activity Feed Query
    activity_res = await client.get("/api/v1/admin/activity?page=1&page_size=10")
    assert activity_res.status_code == 200
    activity_data = activity_res.json()
    assert "items" in activity_data
