"""Tests for Phase 2: Learning Materials, PyMuPDF extraction, SentenceTransformers embeddings,
pgvector Vector(384) similarity search, tenant isolation, and failure recovery.
"""

import uuid
from unittest.mock import patch

import fitz  # PyMuPDF
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embeddings import embed_text
from app.core.config import settings
from app.models.chunk import MaterialChunk
from app.models.material import Material
from app.models.project import Project
from app.models.space import Space
from app.models.user import User
from app.repositories.material_repository import MaterialRepository
from app.services.storage_service import storage_service
from app.workers.tasks import _process_material_async


def create_sample_pdf_bytes(title: str = "Machine Learning", pages: int = 2) -> bytes:
    """Generate a clean in-memory PDF document with PyMuPDF."""
    doc = fitz.open()
    for i in range(pages):
        page = doc.new_page()
        text = (
            f"=== {title} - Page {i + 1} ===\n\n"
            f"Artificial neural networks are computational models inspired by the biological brain. "
            f"Deep learning architectures such as convolutional neural networks and transformer models "
            f"have revolutionized computer vision and natural language processing.\n\n"
            f"Optimization algorithms like Stochastic Gradient Descent and Adam minimize the loss function "
            f"to improve predictive accuracy across validation benchmarks on page {i + 1}."
        )
        page.insert_text((50, 72), text, fontsize=12)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


@pytest.fixture
async def setup_tenant_projects(db_session: AsyncSession):
    """Create two users, each with a space and a project, for isolation testing."""
    # User A
    user_a = User(
        id=uuid.uuid4(),
        email="tenant_a@example.com",
        hashed_password="hashed_pw_test",
        full_name="Tenant A",
        role="user",
    )
    space_a = Space(id=uuid.uuid4(), user_id=user_a.id, name="Space A")
    proj_a = Project(
        id=uuid.uuid4(),
        space_id=space_a.id,
        user_id=user_a.id,
        name="Project A",
        learning_goal="Learn ML",
    )

    # User B
    user_b = User(
        id=uuid.uuid4(),
        email="tenant_b@example.com",
        hashed_password="hashed_pw_test",
        full_name="Tenant B",
        role="user",
    )
    space_b = Space(id=uuid.uuid4(), user_id=user_b.id, name="Space B")
    proj_b = Project(
        id=uuid.uuid4(),
        space_id=space_b.id,
        user_id=user_b.id,
        name="Project B",
        learning_goal="Learn Biology",
    )

    db_session.add_all([user_a, space_a, proj_a, user_b, space_b, proj_b])
    await db_session.commit()

    return {
        "user_a": user_a,
        "space_a": space_a,
        "proj_a": proj_a,
        "user_b": user_b,
        "space_b": space_b,
        "proj_b": proj_b,
    }


# -----------------------------------------------------------------------------
# A. Upload Tests
# -----------------------------------------------------------------------------
@pytest.mark.anyio
async def test_upload_material_success(
    client: AsyncClient,
    setup_tenant_projects: dict,
):
    """Verify POST /projects/{id}/materials synchronously saves file and returns 202 queued immediately."""
    user_a = setup_tenant_projects["user_a"]
    proj_a = setup_tenant_projects["proj_a"]

    # Authenticate as User A
    from app.core.security import create_access_token

    token = create_access_token(str(user_a.id))
    client.cookies.set("access_token", token)

    pdf_content = create_sample_pdf_bytes("Deep Learning Basics", pages=2)

    with patch("app.workers.tasks.process_material.delay") as mock_delay:
        response = await client.post(
            f"/api/v1/projects/{proj_a.id}/materials",
            files={"file": ("deep_learning.pdf", pdf_content, "application/pdf")},
        )

    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "queued"
    assert data["filename"] == "deep_learning.pdf"
    assert data["project_id"] == str(proj_a.id)
    assert data["failure_reason"] is None
    assert mock_delay.called


# -----------------------------------------------------------------------------
# B. Processing Success & PyMuPDF Extraction Test
# -----------------------------------------------------------------------------
@pytest.mark.anyio
async def test_process_material_success(
    db_session: AsyncSession,
    setup_tenant_projects: dict,
):
    """Verify synchronous processing extracts pages, generates 384-dim embeddings, and sets status ready."""
    user_a = setup_tenant_projects["user_a"]
    proj_a = setup_tenant_projects["proj_a"]

    # 1. Save sample PDF to storage
    material_id = uuid.uuid4()
    pdf_content = create_sample_pdf_bytes("Computer Vision Notes", pages=2)
    storage_path = storage_service.save_file(proj_a.id, material_id, pdf_content)

    # 2. Insert queued Material
    material = Material(
        id=material_id,
        project_id=proj_a.id,
        user_id=user_a.id,
        filename="vision_notes.pdf",
        storage_path=storage_path,
        status="queued",
    )
    db_session.add(material)
    await db_session.commit()

    # 3. Execute processing synchronously
    result = await _process_material_async(material_id, session=db_session)

    assert result["status"] == "ready"
    assert result["page_count"] == 2
    assert result["chunk_count"] > 0

    # 4. Verify DB state
    await db_session.refresh(material)
    assert material.status == "ready"
    assert material.page_count == 2
    assert material.failure_reason is None

    chunks_stmt = (
        select(MaterialChunk)
        .where(MaterialChunk.material_id == material_id)
        .order_by(MaterialChunk.chunk_index)
    )
    chunks = list((await db_session.execute(chunks_stmt)).scalars().all())

    assert len(chunks) == result["chunk_count"]
    for i, chunk in enumerate(chunks):
        assert chunk.chunk_index == i
        assert chunk.page_number in (1, 2)
        assert len(chunk.content) > 0
        # pgvector Vector(384) dimension check
        assert len(chunk.embedding) == 384


# -----------------------------------------------------------------------------
# C. Dedicated pgvector Cosine Similarity Search Test
# -----------------------------------------------------------------------------
@pytest.mark.anyio
async def test_material_chunk_vector_search(
    db_session: AsyncSession,
    setup_tenant_projects: dict,
):
    """Verify native pgvector cosine similarity search (<=>) works against PostgreSQL Vector(384)."""
    user_a = setup_tenant_projects["user_a"]
    proj_a = setup_tenant_projects["proj_a"]

    repo = MaterialRepository(db_session)
    material_id = uuid.uuid4()
    material = Material(
        id=material_id,
        project_id=proj_a.id,
        user_id=user_a.id,
        filename="science.pdf",
        storage_path="dummy/path",
        status="ready",
    )
    db_session.add(material)
    await db_session.commit()

    # Create two chunks with distinct semantic topics
    chunk_1_text = "Photosynthesis is the biological process by which plants use sunlight to synthesize nutrients."
    chunk_2_text = (
        "Sir Isaac Newton formulated the three classical laws of motion and universal gravitation."
    )

    emb_1 = embed_text(chunk_1_text)
    emb_2 = embed_text(chunk_2_text)

    chunks_data = [
        {"content": chunk_1_text, "page_number": 1, "chunk_index": 0, "embedding": emb_1},
        {"content": chunk_2_text, "page_number": 2, "chunk_index": 1, "embedding": emb_2},
    ]
    await repo.replace_chunks(material_id, proj_a.id, chunks_data)

    # Query for photosynthesis concept
    query_text = "How do green plants absorb solar energy and produce food?"
    query_emb = embed_text(query_text)

    # Perform pgvector cosine similarity search
    matches = await repo.search_chunks_by_vector(proj_a.id, query_emb, limit=2)

    assert len(matches) == 2
    top_chunk, top_dist = matches[0]
    second_chunk, second_dist = matches[1]

    # The photosynthesis chunk must rank higher (lower cosine distance) than Newton's laws
    assert "Photosynthesis" in top_chunk.content
    assert top_dist < second_dist


# -----------------------------------------------------------------------------
# D. Idempotency & Retry Test
# -----------------------------------------------------------------------------
@pytest.mark.anyio
async def test_process_material_idempotency(
    db_session: AsyncSession,
    setup_tenant_projects: dict,
):
    """Verify that processing the same material multiple times does NOT duplicate chunks."""
    user_a = setup_tenant_projects["user_a"]
    proj_a = setup_tenant_projects["proj_a"]

    material_id = uuid.uuid4()
    pdf_content = create_sample_pdf_bytes("Idempotent Subject", pages=1)
    storage_path = storage_service.save_file(proj_a.id, material_id, pdf_content)

    material = Material(
        id=material_id,
        project_id=proj_a.id,
        user_id=user_a.id,
        filename="idempotent.pdf",
        storage_path=storage_path,
        status="queued",
    )
    db_session.add(material)
    await db_session.commit()

    # First run
    await _process_material_async(material_id, session=db_session)
    chunks_stmt = select(MaterialChunk).where(MaterialChunk.material_id == material_id)
    first_run_chunks = list((await db_session.execute(chunks_stmt)).scalars().all())
    chunk_count_1 = len(first_run_chunks)
    assert chunk_count_1 > 0

    # Reset status to queued and re-run (simulating a retry)
    material.status = "queued"
    await db_session.commit()

    await _process_material_async(material_id, session=db_session)
    second_run_chunks = list((await db_session.execute(chunks_stmt)).scalars().all())
    chunk_count_2 = len(second_run_chunks)

    # Chunks count must be identical, not doubled
    assert chunk_count_2 == chunk_count_1


# -----------------------------------------------------------------------------
# E. Corrupt PDF Failure Handling
# -----------------------------------------------------------------------------
@pytest.mark.anyio
async def test_process_material_corrupt_pdf(
    db_session: AsyncSession,
    setup_tenant_projects: dict,
):
    """Verify that a corrupt PDF file transitions to 'failed' with failure_reason recorded."""
    user_a = setup_tenant_projects["user_a"]
    proj_a = setup_tenant_projects["proj_a"]

    material_id = uuid.uuid4()
    corrupt_bytes = b"NOT_A_VALID_PDF_HEADER_1234567890"
    storage_path = storage_service.save_file(proj_a.id, material_id, corrupt_bytes)

    material = Material(
        id=material_id,
        project_id=proj_a.id,
        user_id=user_a.id,
        filename="broken.pdf",
        storage_path=storage_path,
        status="queued",
    )
    db_session.add(material)
    await db_session.commit()

    with pytest.raises(Exception):
        await _process_material_async(material_id, session=db_session)

    await db_session.refresh(material)
    assert material.status == "failed"
    assert material.failure_reason is not None
    assert len(material.failure_reason) > 0


# -----------------------------------------------------------------------------
# F. Cross-Tenant Data Isolation Tests
# -----------------------------------------------------------------------------
@pytest.mark.anyio
async def test_material_tenant_isolation(
    client: AsyncClient,
    db_session: AsyncSession,
    setup_tenant_projects: dict,
):
    """Verify strict tenant isolation: User B receives 404 when probing User A's materials or project."""
    user_a = setup_tenant_projects["user_a"]
    proj_a = setup_tenant_projects["proj_a"]
    user_b = setup_tenant_projects["user_b"]

    # Create Material owned by User A
    material_id = uuid.uuid4()
    storage_path = storage_service.save_file(proj_a.id, material_id, b"dummy")
    material_a = Material(
        id=material_id,
        project_id=proj_a.id,
        user_id=user_a.id,
        filename="secret_a.pdf",
        storage_path=storage_path,
        status="failed",
        failure_reason="Simulated error",
    )
    db_session.add(material_a)
    await db_session.commit()

    # Authenticate as User B
    from app.core.security import create_access_token

    token_b = create_access_token(str(user_b.id))
    client.cookies.set("access_token", token_b)

    # 1. User B lists User A's project materials -> 404
    res_list = await client.get(f"/api/v1/projects/{proj_a.id}/materials")
    assert res_list.status_code == 404

    # 2. User B gets User A's material directly -> 404
    res_get = await client.get(f"/api/v1/materials/{material_id}")
    assert res_get.status_code == 404

    # 3. User B uploads to User A's project -> 404
    pdf_bytes = create_sample_pdf_bytes()
    res_upload = await client.post(
        f"/api/v1/projects/{proj_a.id}/materials",
        files={"file": ("hacked.pdf", pdf_bytes, "application/pdf")},
    )
    assert res_upload.status_code == 404

    # 4. User B attempts to retry User A's failed material -> 404
    res_retry = await client.post(f"/api/v1/materials/{material_id}/retry")
    assert res_retry.status_code == 404


# -----------------------------------------------------------------------------
# G. Upload File Validation Tests
# -----------------------------------------------------------------------------
@pytest.mark.anyio
async def test_upload_validation_non_pdf(
    client: AsyncClient,
    setup_tenant_projects: dict,
):
    """Verify non-PDF file upload is rejected with HTTP 400."""
    user_a = setup_tenant_projects["user_a"]
    proj_a = setup_tenant_projects["proj_a"]

    from app.core.security import create_access_token

    token = create_access_token(str(user_a.id))
    client.cookies.set("access_token", token)

    response = await client.post(
        f"/api/v1/projects/{proj_a.id}/materials",
        files={"file": ("notes.txt", b"plain text content", "text/plain")},
    )
    assert response.status_code == 400
    assert "Only PDF documents" in response.json()["detail"]


@pytest.mark.anyio
async def test_upload_validation_oversized(
    client: AsyncClient,
    setup_tenant_projects: dict,
    monkeypatch: pytest.MonkeyPatch,
):
    """Verify file exceeding MAX_UPLOAD_SIZE_BYTES is rejected with HTTP 413."""
    user_a = setup_tenant_projects["user_a"]
    proj_a = setup_tenant_projects["proj_a"]

    from app.core.security import create_access_token

    token = create_access_token(str(user_a.id))
    client.cookies.set("access_token", token)

    # Set tiny max limit for test
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_BYTES", 50)

    pdf_bytes = create_sample_pdf_bytes("Large Document", pages=1)
    response = await client.post(
        f"/api/v1/projects/{proj_a.id}/materials",
        files={"file": ("large.pdf", pdf_bytes, "application/pdf")},
    )
    assert response.status_code == 413


# -----------------------------------------------------------------------------
# H. Unauthenticated Access Tests
# -----------------------------------------------------------------------------
@pytest.mark.anyio
async def test_material_unauthenticated(
    client: AsyncClient,
    setup_tenant_projects: dict,
):
    """Verify all material endpoints reject unauthenticated access with HTTP 401."""
    client.cookies.clear()
    fake_id = uuid.uuid4()

    assert (await client.get(f"/api/v1/projects/{fake_id}/materials")).status_code == 401
    assert (await client.get(f"/api/v1/materials/{fake_id}")).status_code == 401
    assert (await client.post(f"/api/v1/materials/{fake_id}/retry")).status_code == 401
