"""Tests verifying production deployment configurations for Vercel + Railway.

Covers:
1. DATABASE_URL normalization (postgres:// and postgresql:// -> postgresql+asyncpg:// and sync postgresql://)
2. Celery Redis aliasing to REDIS_URL and production validation against localhost
3. PDF storage in PostgreSQL file_data, worker hydration when absent on disk, and uncorrupted file_data on failure
4. 20MB upload limit enforcement
5. Vercel static rewrite order and SPA catch-all verification
6. End-to-end authentication flow with HttpOnly cookies via /api/v1 prefix
7. Backend endpoints /api/v1/health, /api/v1/health/ready, /docs, /openapi.json
"""

import json
import re
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pymupdf as fitz
import pytest
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import hash_password
from app.models.material import Material
from app.models.project import Project
from app.models.space import Space
from app.models.user import User
from app.services.material_service import MaterialService
from app.services.storage_service import storage_service
from app.workers.tasks import _process_material_async


def _generate_test_pdf_bytes(title: str = "Test Document", num_pages: int = 1) -> bytes:
    doc = fitz.open()
    for i in range(num_pages):
        page = doc.new_page(width=612, height=792)
        page.insert_text(
            (72, 72),
            f"{title} - Page {i+1}\nThis document contains valid educational content for machine learning concepts.",
            fontsize=12,
        )
    pdf_bytes = doc.write()
    doc.close()
    return bytes(pdf_bytes)


# ==============================================================================
# 1. DATABASE_URL & Redis Normalization Tests
# ==============================================================================


def test_database_url_normalization_from_postgres_scheme():
    """Railway standard postgres:// URL is normalized to postgresql+asyncpg:// for async and postgresql:// for sync."""
    raw_url = "postgres://postgres:mypassword@containers-us-west-1.railway.app:5432/railway"
    s = Settings(
        DATABASE_URL=raw_url,
        _env_file=None,
    )
    assert s.DATABASE_URL == "postgresql+asyncpg://postgres:mypassword@containers-us-west-1.railway.app:5432/railway"
    assert s.SYNC_DATABASE_URL == "postgresql://postgres:mypassword@containers-us-west-1.railway.app:5432/railway"


def test_database_url_normalization_from_postgresql_scheme():
    """Standard postgresql:// URL is normalized to postgresql+asyncpg:// for async and postgresql:// for sync."""
    raw_url = "postgresql://postgres:mypassword@containers-us-west-1.railway.app:5432/railway"
    s = Settings(
        DATABASE_URL=raw_url,
        _env_file=None,
    )
    assert s.DATABASE_URL == "postgresql+asyncpg://postgres:mypassword@containers-us-west-1.railway.app:5432/railway"
    assert s.SYNC_DATABASE_URL == "postgresql://postgres:mypassword@containers-us-west-1.railway.app:5432/railway"


def test_celery_redis_aliasing():
    """CELERY_BROKER_URL and CELERY_RESULT_BACKEND inherit REDIS_URL when set."""
    railway_redis = "redis://default:secret123@redis.railway.internal:6379"
    s = Settings(
        REDIS_URL=railway_redis,
        _env_file=None,
    )
    assert s.CELERY_BROKER_URL == railway_redis
    assert s.CELERY_RESULT_BACKEND == railway_redis


def test_production_environment_rejects_localhost_redis():
    """In production ENVIRONMENT, using localhost for REDIS raises a ValidationError."""
    with pytest.raises(ValidationError):
        Settings(
            ENVIRONMENT="production",
            REDIS_URL="redis://localhost:6379/0",
            CELERY_BROKER_URL="redis://localhost:6379/0",
            _env_file=None,
        )


# ==============================================================================
# 2. PDF Storage & Worker Hydration Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_uploaded_pdf_persists_in_materials_file_data(db_session: AsyncSession):
    """Uploaded PDF bytes are stored in materials.file_data in PostgreSQL."""
    user = User(
        id=uuid.uuid4(),
        email=f"uploader_{uuid.uuid4().hex[:6]}@example.com",
        full_name="Uploader",
        hashed_password=hash_password("Password123!"),
    )
    db_session.add(user)
    space = Space(id=uuid.uuid4(), user_id=user.id, name="Test Space")
    db_session.add(space)
    project = Project(
        id=uuid.uuid4(),
        user_id=user.id,
        space_id=space.id,
        name="Test Project",
        learning_goal="Learn Machine Learning",
    )
    db_session.add(project)
    await db_session.commit()

    pdf_bytes = _generate_test_pdf_bytes("Upload Persistence Test")

    # Mock UploadFile
    class DummyUploadFile:
        filename = "lecture.pdf"
        async def read(self):
            return pdf_bytes

    service = MaterialService(db_session)
    with patch("app.services.material_service.process_material.delay"):
        material = await service.upload_material(user.id, project.id, DummyUploadFile())

    assert material.file_data == pdf_bytes
    assert material.filename == "lecture.pdf"
    assert material.status == "queued"

    # Query directly from database to verify persistence in PostgreSQL
    result = await db_session.execute(select(Material).where(Material.id == material.id))
    db_material = result.scalar_one()
    assert db_material.file_data == pdf_bytes


@pytest.mark.asyncio
async def test_worker_hydrates_absent_pdf_from_file_data_and_succeeds(db_session: AsyncSession):
    """When the local file is absent from disk, worker hydrates from file_data and processes successfully."""
    user = User(
        id=uuid.uuid4(),
        email=f"worker_user_{uuid.uuid4().hex[:6]}@example.com",
        full_name="Worker User",
        hashed_password=hash_password("Password123!"),
    )
    db_session.add(user)
    space = Space(id=uuid.uuid4(), user_id=user.id, name="Test Space")
    db_session.add(space)
    project = Project(
        id=uuid.uuid4(),
        user_id=user.id,
        space_id=space.id,
        name="Test Project",
        learning_goal="Learn Machine Learning",
    )
    db_session.add(project)
    await db_session.commit()

    pdf_bytes = _generate_test_pdf_bytes("Hydration Test", num_pages=2)
    material_id = uuid.uuid4()
    rel_path = f"materials/{project.id}/{material_id}/original.pdf"

    # Ensure local file does NOT exist
    abs_path = storage_service.get_absolute_path(rel_path)
    if abs_path.exists():
        abs_path.unlink()

    material = Material(
        id=material_id,
        project_id=project.id,
        user_id=user.id,
        filename="hydration_doc.pdf",
        storage_path=rel_path,
        file_data=pdf_bytes,
        status="queued",
    )
    db_session.add(material)
    await db_session.commit()

    # Worker processes the material
    with patch("app.services.quiz_service.QuizService.extract_material_concepts_incremental", return_value=[]):
        res = await _process_material_async(material_id, db_session)

    assert res["status"] == "ready"
    # Verify file was hydrated onto local disk cache
    assert abs_path.exists()
    assert abs_path.read_bytes() == pdf_bytes

    # Clean up local test file
    storage_service.delete_material_storage(project.id, material_id)


@pytest.mark.asyncio
async def test_worker_succeeds_when_local_file_already_exists(db_session: AsyncSession):
    """When the local file already exists, worker proceeds normally without re-hydrating."""
    user = User(
        id=uuid.uuid4(),
        email=f"local_user_{uuid.uuid4().hex[:6]}@example.com",
        full_name="Local User",
        hashed_password=hash_password("Password123!"),
    )
    db_session.add(user)
    space = Space(id=uuid.uuid4(), user_id=user.id, name="Test Space")
    db_session.add(space)
    project = Project(
        id=uuid.uuid4(),
        user_id=user.id,
        space_id=space.id,
        name="Test Project",
        learning_goal="Learn Machine Learning",
    )
    db_session.add(project)
    await db_session.commit()

    pdf_bytes = _generate_test_pdf_bytes("Existing File Test")
    material_id = uuid.uuid4()
    storage_path = storage_service.save_file(project.id, material_id, pdf_bytes)

    material = Material(
        id=material_id,
        project_id=project.id,
        user_id=user.id,
        filename="existing_doc.pdf",
        storage_path=storage_path,
        file_data=pdf_bytes,
        status="queued",
    )
    db_session.add(material)
    await db_session.commit()

    with patch("app.services.quiz_service.QuizService.extract_material_concepts_incremental", return_value=[]):
        res = await _process_material_async(material_id, db_session)

    assert res["status"] == "ready"
    storage_service.delete_material_storage(project.id, material_id)


@pytest.mark.asyncio
async def test_failed_processing_does_not_corrupt_file_data(db_session: AsyncSession):
    """If processing fails, material status is marked 'failed' but file_data in DB is not corrupted or lost."""
    user = User(
        id=uuid.uuid4(),
        email=f"fail_user_{uuid.uuid4().hex[:6]}@example.com",
        full_name="Fail User",
        hashed_password=hash_password("Password123!"),
    )
    db_session.add(user)
    space = Space(id=uuid.uuid4(), user_id=user.id, name="Test Space")
    db_session.add(space)
    project = Project(
        id=uuid.uuid4(),
        user_id=user.id,
        space_id=space.id,
        name="Test Project",
        learning_goal="Learn Machine Learning",
    )
    db_session.add(project)
    await db_session.commit()

    corrupt_bytes = b"%PDF-1.4 this is a completely invalid corrupt PDF file"
    material_id = uuid.uuid4()
    rel_path = f"materials/{project.id}/{material_id}/original.pdf"

    material = Material(
        id=material_id,
        project_id=project.id,
        user_id=user.id,
        filename="corrupt.pdf",
        storage_path=rel_path,
        file_data=corrupt_bytes,
        status="queued",
    )
    db_session.add(material)
    await db_session.commit()

    with pytest.raises(Exception):
        await _process_material_async(material_id, db_session)

    # Verify file_data remains intact in database
    await db_session.refresh(material)
    assert material.status == "failed"
    assert material.file_data == corrupt_bytes
    assert material.failure_reason is not None

    storage_service.delete_material_storage(project.id, material_id)


@pytest.mark.asyncio
async def test_upload_file_size_exceeding_20mb_rejected(db_session: AsyncSession):
    """Uploading a file exceeding 20 MB raises HTTP 413 CONTENT_TOO_LARGE."""
    from fastapi import HTTPException

    user = User(
        id=uuid.uuid4(),
        email=f"oversize_{uuid.uuid4().hex[:6]}@example.com",
        full_name="Oversize User",
        hashed_password=hash_password("Password123!"),
    )
    db_session.add(user)
    space = Space(id=uuid.uuid4(), user_id=user.id, name="Test Space")
    db_session.add(space)
    project = Project(
        id=uuid.uuid4(),
        user_id=user.id,
        space_id=space.id,
        name="Test Project",
        learning_goal="Learn Machine Learning",
    )
    db_session.add(project)
    await db_session.commit()

    oversize_bytes = b"x" * (20 * 1024 * 1024 + 1024)

    class OversizeUploadFile:
        filename = "huge.pdf"
        async def read(self):
            return oversize_bytes

    service = MaterialService(db_session)
    with pytest.raises(HTTPException) as exc_info:
        await service.upload_material(user.id, project.id, OversizeUploadFile())

    assert exc_info.value.status_code == 413
    assert "File exceeds maximum allowed size" in exc_info.value.detail


# ==============================================================================
# 3. Vercel Rewrites Static Configuration & Routing Order Tests
# ==============================================================================


def test_vercel_json_static_rewrite_order():
    """Verify frontend/vercel.json is valid JSON with API routes prioritized before SPA fallback."""
    vercel_path = Path(__file__).resolve().parent.parent.parent / "frontend" / "vercel.json"
    assert vercel_path.exists(), "frontend/vercel.json must exist"

    with open(vercel_path, encoding="utf-8") as f:
        config = json.load(f)

    rewrites = config.get("rewrites", [])
    assert len(rewrites) >= 4, "Must contain /api/v1, /docs, /openapi.json, and SPA fallback"

    # Verify sources in order
    sources = [r["source"] for r in rewrites]
    assert sources[0] == "/api/v1/:path*"
    assert sources[1] == "/docs"
    assert sources[2] == "/openapi.json"
    assert sources[-1] == "/(.*)", "SPA fallback must be the last rewrite"

    # Verify API destinations point to railway backend URL
    assert "railway.app" in rewrites[0]["destination"]
    assert "railway.app" in rewrites[1]["destination"]
    assert "railway.app" in rewrites[2]["destination"]
    assert rewrites[-1]["destination"] == "/index.html"


def test_vercel_rewrite_routing_simulation():
    """Test regex matching behavior to prove API routes match before SPA catch-all."""
    patterns = [
        (r"^/api/v1/(.*)$", "railway_api"),
        (r"^/docs$", "railway_docs"),
        (r"^/openapi\.json$", "railway_openapi"),
        (r"^/.*$", "spa_fallback"),
    ]

    def route(path: str) -> str:
        for pattern, dest in patterns:
            if re.match(pattern, path):
                return str(dest)
        return "not_found"

    assert route("/api/v1/health") == "railway_api"
    assert route("/api/v1/health/ready") == "railway_api"
    assert route("/api/v1/auth/login") == "railway_api"
    assert route("/docs") == "railway_docs"
    assert route("/openapi.json") == "railway_openapi"
    assert route("/dashboard") == "spa_fallback"
    assert route("/projects/123") == "spa_fallback"


# ==============================================================================
# 4. Production Authentication End-to-End Tests via /api/v1 Prefix
# ==============================================================================


@pytest.mark.asyncio
async def test_production_auth_e2e_flow_with_httponly_cookies(client: AsyncClient):
    """Verify complete authentication lifecycle through /api/v1 prefix with HttpOnly cookies."""
    test_email = f"prod_auth_{uuid.uuid4().hex[:6]}@example.com"
    test_password = "Password123!"

    # 1. Signup
    signup_resp = await client.post(
        "/api/v1/auth/signup",
        json={"email": test_email, "full_name": "Production User", "password": test_password},
    )
    assert signup_resp.status_code == 201
    assert "access_token" in signup_resp.cookies
    assert "refresh_token" in signup_resp.cookies

    # 2. Login
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": test_email, "password": test_password},
    )
    assert login_resp.status_code == 200
    assert "access_token" in login_resp.cookies

    # 3. /auth/me succeeds with cookie
    me_resp = await client.get("/api/v1/auth/me")
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == test_email

    # 4. Protected endpoint succeeds
    spaces_resp = await client.get("/api/v1/spaces")
    assert spaces_resp.status_code == 200

    # 5. Simulated page refresh (new request with preserved cookie)
    refresh_resp = await client.get("/api/v1/auth/me")
    assert refresh_resp.status_code == 200
    assert refresh_resp.json()["email"] == test_email

    # 6. Logout clears cookie
    logout_resp = await client.post("/api/v1/auth/logout")
    assert logout_resp.status_code == 200

    # Verify access_token cookie is deleted / expired
    set_cookie_header = logout_resp.headers.get("set-cookie", "")
    assert 'access_token=""' in set_cookie_header or "Max-Age=0" in set_cookie_header


# ==============================================================================
# 5. Production Health, Ready, Docs, and OpenAPI Endpoint Checks
# ==============================================================================


@pytest.mark.asyncio
async def test_health_and_documentation_endpoints(client: AsyncClient):
    """Verify /api/v1/health, /api/v1/health/ready, /docs, and /openapi.json return 200."""
    health_resp = await client.get("/api/v1/health")
    assert health_resp.status_code == 200
    assert health_resp.json()["status"] == "healthy"

    # Mock database and redis readiness checks
    with patch("app.api.v1.endpoints.health.check_db_health", new_callable=AsyncMock) as mock_db:
        mock_db.return_value = (True, True, None)
        with patch("redis.asyncio.from_url") as mock_redis_cls:
            mock_redis_instance = AsyncMock()
            mock_redis_instance.ping.return_value = True
            mock_redis_instance.aclose = AsyncMock()
            mock_redis_cls.return_value = mock_redis_instance

            ready_resp = await client.get("/api/v1/health/ready")
            assert ready_resp.status_code == 200
            assert ready_resp.json()["status"] == "ready"

    docs_resp = await client.get("/docs")
    assert docs_resp.status_code == 200
    assert "Swagger UI" in docs_resp.text or "html" in docs_resp.headers.get("content-type", "")

    openapi_resp = await client.get("/openapi.json")
    assert openapi_resp.status_code == 200
    openapi_data = openapi_resp.json()
    assert "paths" in openapi_data
