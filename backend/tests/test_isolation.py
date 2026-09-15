import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.main import app


@pytest.mark.asyncio
async def test_tenant_data_isolation(db_session: AsyncSession):
    """
    Verifies strict per-user data isolation:
    1. User A creates Space A and Project A.
    2. User B creates Space B and Project B.
    3. User B cannot fetch Space A or Project A (returns 404 Not Found, never 403).
    4. User B listing /spaces returns ONLY Space B.
    5. User B listing /spaces/{space_a_id}/projects returns 404.
    6. User B cannot create a project inside Space A (returns 404).
    """

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client_a:
        async with AsyncClient(transport=transport, base_url="http://test") as client_b:
            # 1. Register User A
            resp_a = await client_a.post(
                "/api/v1/auth/signup",
                json={
                    "email": "user_a@example.com",
                    "password": "passwordA123",
                    "full_name": "User A",
                },
            )
            assert resp_a.status_code == 201

            # 2. Register User B
            resp_b = await client_b.post(
                "/api/v1/auth/signup",
                json={
                    "email": "user_b@example.com",
                    "password": "passwordB123",
                    "full_name": "User B",
                },
            )
            assert resp_b.status_code == 201

            # 3. User A creates Space A
            space_a_resp = await client_a.post(
                "/api/v1/spaces",
                json={"name": "Machine Learning", "description": "User A Space"},
            )
            assert space_a_resp.status_code == 201
            space_a_id = space_a_resp.json()["id"]

            # 4. User A creates Project A inside Space A
            proj_a_resp = await client_a.post(
                f"/api/v1/spaces/{space_a_id}/projects",
                json={
                    "name": "Deep Learning Fundamentals",
                    "learning_goal": "Master neural networks and backprop",
                },
            )
            assert proj_a_resp.status_code == 201
            proj_a_id = proj_a_resp.json()["id"]

            # 5. User B creates Space B
            space_b_resp = await client_b.post(
                "/api/v1/spaces",
                json={"name": "Web Development", "description": "User B Space"},
            )
            assert space_b_resp.status_code == 201
            space_b_id = space_b_resp.json()["id"]

            # 6. User B creates Project B inside Space B
            proj_b_resp = await client_b.post(
                f"/api/v1/spaces/{space_b_id}/projects",
                json={
                    "name": "FastAPI Masterclass",
                    "learning_goal": "Build scalable APIs",
                },
            )
            assert proj_b_resp.status_code == 201
            proj_b_id = proj_b_resp.json()["id"]
            assert proj_b_id is not None

            # ==========================================
            # ISOLATION ASSERTIONS FOR USER B
            # ==========================================

            # A. User B lists spaces -> MUST only see Space B
            list_b_resp = await client_b.get("/api/v1/spaces")
            assert list_b_resp.status_code == 200
            user_b_spaces = list_b_resp.json()
            assert len(user_b_spaces) == 1
            assert user_b_spaces[0]["id"] == space_b_id
            assert user_b_spaces[0]["name"] == "Web Development"

            # B. User B attempts to access Space A directly -> MUST return 404 (not 403)
            get_space_a_from_b = await client_b.get(f"/api/v1/spaces/{space_a_id}")
            assert get_space_a_from_b.status_code == 404
            assert get_space_a_from_b.json()["detail"] == "Space not found"

            # C. User B attempts to access Project A directly -> MUST return 404 (not 403)
            get_proj_a_from_b = await client_b.get(f"/api/v1/projects/{proj_a_id}")
            assert get_proj_a_from_b.status_code == 404
            assert get_proj_a_from_b.json()["detail"] == "Project not found"

            # D. User B attempts to list projects in Space A -> MUST return 404
            list_proj_a_from_b = await client_b.get(f"/api/v1/spaces/{space_a_id}/projects")
            assert list_proj_a_from_b.status_code == 404

            # E. User B attempts to create a project in Space A -> MUST return 404
            create_in_a_from_b = await client_b.post(
                f"/api/v1/spaces/{space_a_id}/projects",
                json={"name": "Intruder Project", "learning_goal": "Attempt breach"},
            )
            assert create_in_a_from_b.status_code == 404

            # F. User B attempts to update or delete Project A -> MUST return 404
            update_a_from_b = await client_b.put(
                f"/api/v1/projects/{proj_a_id}",
                json={"name": "Hacked Name"},
            )
            assert update_a_from_b.status_code == 404

            delete_a_from_b = await client_b.delete(f"/api/v1/projects/{proj_a_id}")
            assert delete_a_from_b.status_code == 404

            # G. User A can still access their Space A and Project A without disruption
            get_space_a_from_a = await client_a.get(f"/api/v1/spaces/{space_a_id}")
            assert get_space_a_from_a.status_code == 200
            assert get_space_a_from_a.json()["id"] == space_a_id

            get_proj_a_from_a = await client_a.get(f"/api/v1/projects/{proj_a_id}")
            assert get_proj_a_from_a.status_code == 200
            assert get_proj_a_from_a.json()["id"] == proj_a_id

    app.dependency_overrides.clear()
