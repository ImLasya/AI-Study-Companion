import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_signup_success(client: AsyncClient):
    response = await client.post(
        "/api/v1/auth/signup",
        json={
            "email": "alice@example.com",
            "password": "securepassword123",
            "full_name": "Alice Smith",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "success"
    assert data["user"]["email"] == "alice@example.com"
    assert data["user"]["full_name"] == "Alice Smith"
    assert "access_token" in response.cookies
    assert "refresh_token" in response.cookies


@pytest.mark.asyncio
async def test_signup_duplicate_email(client: AsyncClient):
    payload = {"email": "duplicate@example.com", "password": "password123"}
    resp1 = await client.post("/api/v1/auth/signup", json=payload)
    assert resp1.status_code == 201

    resp2 = await client.post("/api/v1/auth/signup", json=payload)
    assert resp2.status_code == 400
    assert "already exists" in resp2.json()["detail"]


@pytest.mark.asyncio
async def test_login_success_and_cookies(client: AsyncClient):
    # 1. Signup
    await client.post(
        "/api/v1/auth/signup",
        json={"email": "bob@example.com", "password": "bobpassword123", "full_name": "Bob Jones"},
    )

    # 2. Login
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "bob@example.com", "password": "bobpassword123"},
    )
    assert login_resp.status_code == 200
    data = login_resp.json()
    assert data["user"]["email"] == "bob@example.com"
    assert "access_token" in login_resp.cookies
    assert "refresh_token" in login_resp.cookies


@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "nonexistent@example.com", "password": "wrongpassword"},
    )
    assert resp.status_code == 401
    assert "Invalid email or password" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_me_protected_route_without_token(client: AsyncClient):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_protected_route_with_cookie(client: AsyncClient):
    # Signup sets cookies on client
    await client.post(
        "/api/v1/auth/signup",
        json={"email": "carol@example.com", "password": "carolpassword123", "full_name": "Carol"},
    )

    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 200
    assert resp.json()["email"] == "carol@example.com"


@pytest.mark.asyncio
async def test_refresh_token_flow(client: AsyncClient):
    # Signup sets refresh_token cookie
    await client.post(
        "/api/v1/auth/signup",
        json={"email": "david@example.com", "password": "davidpassword123"},
    )

    refresh_resp = await client.post("/api/v1/auth/refresh")
    assert refresh_resp.status_code == 200
    assert "access_token" in refresh_resp.cookies


@pytest.mark.asyncio
async def test_logout_clears_cookies(client: AsyncClient):
    await client.post(
        "/api/v1/auth/signup",
        json={"email": "eve@example.com", "password": "evepassword123"},
    )

    logout_resp = await client.post("/api/v1/auth/logout")
    assert logout_resp.status_code == 200
