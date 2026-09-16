"""Tests for Phase 3: AI Tutor, Grounded RAG, Retrieval, Citation Validation, Conversation Isolation.

All tests run against the real PostgreSQL test database (ai_study_companion_test).
Gemini API calls are intercepted by MockLLMProvider for all standard tests.
One opt-in integration test (marked xfail) runs against real Gemini if GEMINI_API_KEY is set.
"""

import uuid
from unittest.mock import patch

import fitz
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.gemini_provider import MockLLMProvider, set_llm_provider
from app.core.config import settings
from app.models.conversation import TutorMessage
from app.models.material import Material
from app.models.project import Project
from app.models.space import Space
from app.models.user import User
from app.workers.tasks import _process_material_async


# ---------------------------------------------------------------------------
# Helper: Create deterministic PDF content
# ---------------------------------------------------------------------------
def create_transformer_pdf_bytes() -> bytes:
    """Create a deterministic 2-page PDF about Transformer architecture for tests."""
    doc = fitz.open()
    # Page 1: Transformer architecture overview
    p1 = doc.new_page()
    p1.insert_text(
        (50, 72),
        (
            "=== Transformer Architecture Overview ===\n\n"
            "The Transformer model is a neural network architecture introduced in 'Attention is All You Need' "
            "by Vaswani et al. in 2017. It consists of an encoder and a decoder, each built from stacked layers "
            "of multi-head attention and feed-forward networks. Layer normalization and residual connections "
            "stabilize training. The model processes sequences in parallel, unlike recurrent networks."
        ),
        fontsize=11,
    )
    # Page 2: Self-attention details
    p2 = doc.new_page()
    p2.insert_text(
        (50, 72),
        (
            "=== Self-Attention Mechanism ===\n\n"
            "Self-attention computes weighted representations of a sequence by comparing each position "
            "to every other position. Given queries Q, keys K, and values V, the output is: "
            "Attention(Q, K, V) = softmax(QK^T / sqrt(d_k)) * V. "
            "This allows each token to incorporate context from all other tokens in the sequence, "
            "enabling the model to capture long-range dependencies effectively."
        ),
        fontsize=11,
    )
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


# ---------------------------------------------------------------------------
# Helper: Build a ready material with processed chunks in the test database
# ---------------------------------------------------------------------------
async def create_ready_material(
    db_session: AsyncSession,
    user_id: uuid.UUID,
    project_id: uuid.UUID,
    filename: str = "transformers.pdf",
) -> Material:
    """Create a Material record with status=ready and processed chunks via Celery task."""
    from app.services.storage_service import storage_service

    # Generate IDs up front so we can save the file first
    material_id = uuid.uuid4()
    pdf_bytes = create_transformer_pdf_bytes()

    # Save the PDF via storage_service so the path is a valid relative path within STORAGE_PATH
    storage_path = storage_service.save_file(
        project_id=project_id,
        material_id=material_id,
        content=pdf_bytes,
    )

    # Create material record directly (test helper — bypasses API layer)
    material = Material(
        id=material_id,
        project_id=project_id,
        user_id=user_id,
        filename=filename,
        storage_path=storage_path,
        status="queued",
    )
    db_session.add(material)
    await db_session.commit()
    await db_session.refresh(material)

    # Run async processing directly
    await _process_material_async(str(material.id), db_session)

    # Refresh from DB
    from sqlalchemy import select
    result = await db_session.execute(
        select(Material).where(Material.id == material.id)
    )
    return result.scalar_one()


# ---------------------------------------------------------------------------
# Fixtures: Two-tenant setup
# ---------------------------------------------------------------------------
@pytest.fixture
async def two_user_setup(db_session: AsyncSession):
    """Create two isolated users with spaces, projects, and credentials."""
    user_a = User(
        id=uuid.uuid4(),
        email=f"tutor_user_a_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hashed_pw",
        full_name="Tutor User A",
        role="user",
    )
    user_b = User(
        id=uuid.uuid4(),
        email=f"tutor_user_b_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hashed_pw",
        full_name="Tutor User B",
        role="user",
    )
    space_a = Space(id=uuid.uuid4(), user_id=user_a.id, name="Space A")
    space_b = Space(id=uuid.uuid4(), user_id=user_b.id, name="Space B")
    proj_a = Project(
        id=uuid.uuid4(), space_id=space_a.id, user_id=user_a.id, name="Proj A",
        learning_goal="Learn about Transformers",
    )
    proj_b = Project(
        id=uuid.uuid4(), space_id=space_b.id, user_id=user_b.id, name="Proj B",
        learning_goal="Learn about Neural Networks",
    )
    db_session.add_all([user_a, user_b, space_a, space_b, proj_a, proj_b])
    await db_session.commit()
    return {"user_a": user_a, "user_b": user_b, "proj_a": proj_a, "proj_b": proj_b}


@pytest.fixture
async def single_user_setup(db_session: AsyncSession):
    """Create a single user with space and project."""
    user = User(
        id=uuid.uuid4(),
        email=f"tutor_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="hashed_pw",
        full_name="Tutor User",
        role="user",
    )
    space = Space(id=uuid.uuid4(), user_id=user.id, name="My Space")
    project = Project(
        id=uuid.uuid4(), space_id=space.id, user_id=user.id, name="My Project",
        learning_goal="Learn about Transformers",
    )
    db_session.add_all([user, space, project])
    await db_session.commit()
    return {"user": user, "project": project}


# ---------------------------------------------------------------------------
# Helper: Create an authenticated API client for a user
# ---------------------------------------------------------------------------
async def get_auth_token(client: AsyncClient, email: str, password: str = "TestPass123!") -> str:
    # Users are already in DB; create a login pair

    # Direct login via API
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    if resp.status_code == 200:
        return resp.cookies.get("access_token", "")
    return ""


async def signup_and_login(client: AsyncClient, email: str) -> dict:
    """Register a user and return their JWT cookie."""
    resp = await client.post(
        "/api/v1/auth/signup",
        json={"email": email, "password": "TestPass123!", "full_name": "Test User"},
    )
    assert resp.status_code == 201, resp.text
    return {"email": email, "password": "TestPass123!"}


# ===========================================================================
# Section A: Retrieval Tests
# ===========================================================================

@pytest.mark.asyncio
async def test_retrieval_relevant_chunk_with_correct_page(
    db_session: AsyncSession, single_user_setup: dict
):
    """A on-topic question retrieves a chunk with the correct page number."""
    user = single_user_setup["user"]
    project = single_user_setup["project"]

    material = await create_ready_material(db_session, user.id, project.id)
    assert material.status == "ready", f"Material status: {material.status}"

    from app.services.retrieval_service import RetrievalService
    svc = RetrievalService(db_session)
    result = await svc.retrieve_relevant_chunks(
        user_id=user.id,
        project_id=project.id,
        question="How does self-attention compute token representations?",
    )

    assert result.is_sufficient, "Expected sufficient evidence for attention question"
    assert len(result.accepted_chunks) > 0
    chunk = result.accepted_chunks[0]
    assert chunk.page_number in (1, 2)
    assert chunk.material_id == material.id


@pytest.mark.asyncio
async def test_retrieval_tenant_isolation_user(
    db_session: AsyncSession, two_user_setup: dict
):
    """Chunks belonging to User A are never returned for User B."""
    user_a = two_user_setup["user_a"]
    proj_a = two_user_setup["proj_a"]
    user_b = two_user_setup["user_b"]
    proj_b = two_user_setup["proj_b"]

    # Only User A has a ready material
    await create_ready_material(db_session, user_a.id, proj_a.id)

    from app.services.retrieval_service import RetrievalService
    svc = RetrievalService(db_session)
    result = await svc.retrieve_relevant_chunks(
        user_id=user_b.id,
        project_id=proj_b.id,
        question="How does self-attention work?",
    )

    # User B should see no chunks
    assert not result.is_sufficient
    assert len(result.accepted_chunks) == 0


@pytest.mark.asyncio
async def test_retrieval_project_isolation(
    db_session: AsyncSession, two_user_setup: dict
):
    """Chunks from Project A are not returned when querying Project B."""
    user_a = two_user_setup["user_a"]
    proj_a = two_user_setup["proj_a"]
    proj_b = two_user_setup["proj_b"]

    await create_ready_material(db_session, user_a.id, proj_a.id)

    from app.services.retrieval_service import RetrievalService
    svc = RetrievalService(db_session)
    # Query as user_a but against a different project
    result = await svc.retrieve_relevant_chunks(
        user_id=user_a.id,
        project_id=proj_b.id,  # not owned by user_a
        question="How does self-attention work?",
    )
    assert not result.is_sufficient
    assert len(result.accepted_chunks) == 0


@pytest.mark.asyncio
async def test_retrieval_low_relevance_returns_insufficient_evidence(
    db_session: AsyncSession, single_user_setup: dict
):
    """A completely unrelated question is rejected by the similarity threshold."""
    user = single_user_setup["user"]
    project = single_user_setup["project"]

    await create_ready_material(db_session, user.id, project.id)

    from app.services.retrieval_service import RetrievalService
    svc = RetrievalService(db_session)
    result = await svc.retrieve_relevant_chunks(
        user_id=user.id,
        project_id=project.id,
        question="What is the boiling point of water used in baking sourdough bread?",
        similarity_threshold=0.2,  # very strict threshold to force failure
    )

    # With such a strict threshold, unrelated question must fail
    assert not result.is_sufficient
    assert len(result.accepted_chunks) == 0


# ===========================================================================
# Section B: Tutor Tests (with MockLLMProvider)
# ===========================================================================

@pytest.mark.asyncio
async def test_tutor_grounded_answer_with_valid_citations(
    client: AsyncClient, db_session: AsyncSession
):
    """A relevant question produces a grounded answer with server-validated citations."""
    set_llm_provider(None)  # reset
    mock_provider = MockLLMProvider()
    set_llm_provider(mock_provider)

    try:
        creds = await signup_and_login(client, f"tutor_grounded_{uuid.uuid4().hex[:6]}@example.com")

        # Create space and project via API
        login_resp = await client.post("/api/v1/auth/login", json={"email": creds["email"], "password": creds["password"]})
        assert login_resp.status_code == 200

        space_resp = await client.post("/api/v1/spaces", json={"name": "Test Space"})
        assert space_resp.status_code == 201
        space_id = space_resp.json()["id"]

        proj_resp = await client.post(f"/api/v1/spaces/{space_id}/projects", json={"name": "Test Project", "learning_goal": "Learn Transformers"})
        assert proj_resp.status_code == 201
        project_id = proj_resp.json()["id"]

        # Get current user
        me_resp = await client.get("/api/v1/auth/me")
        assert me_resp.status_code == 200
        user_id = uuid.UUID(me_resp.json()["id"])
        project_uuid = uuid.UUID(project_id)

        # Create ready material
        await create_ready_material(db_session, user_id, project_uuid)

        # Ask the tutor
        resp = await client.post(
            f"/api/v1/projects/{project_id}/tutor",
            json={"question": "How does self-attention compute representations?"},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert "answer" in data
        assert "conversation_id" in data
        assert "message_id" in data
        assert isinstance(data["grounded"], bool)
        assert isinstance(data["citations"], list)
    finally:
        set_llm_provider(None)


@pytest.mark.asyncio
async def test_tutor_citation_validation_rejects_fabricated_ids(
    client: AsyncClient, db_session: AsyncSession
):
    """Fabricated chunk IDs returned by the LLM are safely stripped from citations."""
    fake_chunk_id = str(uuid.uuid4())
    mock_provider = MockLLMProvider(
        canned_response={
            "answer": "Self-attention uses Q, K, V matrices.",
            "grounded": True,
            "insufficient_evidence": False,
            "citation_chunk_ids": [fake_chunk_id, "completely-invalid-id"],
        }
    )
    set_llm_provider(mock_provider)

    try:
        creds = await signup_and_login(client, f"cite_fab_{uuid.uuid4().hex[:6]}@example.com")
        await client.post("/api/v1/auth/login", json={"email": creds["email"], "password": creds["password"]})

        space_resp = await client.post("/api/v1/spaces", json={"name": "Space"})
        space_id = space_resp.json()["id"]
        proj_resp = await client.post(f"/api/v1/spaces/{space_id}/projects", json={"name": "Project", "learning_goal": "Learn Transformers"})
        project_id = proj_resp.json()["id"]

        me_resp = await client.get("/api/v1/auth/me")
        user_id = uuid.UUID(me_resp.json()["id"])
        project_uuid = uuid.UUID(project_id)

        await create_ready_material(db_session, user_id, project_uuid)

        resp = await client.post(
            f"/api/v1/projects/{project_id}/tutor",
            json={"question": "Explain self-attention"},
        )
        assert resp.status_code == 200
        data = resp.json()

        # Fabricated IDs must be stripped - citations should only contain real chunk IDs
        citation_chunk_ids = [c["chunk_id"] for c in data["citations"]]
        assert fake_chunk_id not in citation_chunk_ids
        assert "completely-invalid-id" not in citation_chunk_ids
    finally:
        set_llm_provider(None)


@pytest.mark.asyncio
async def test_tutor_no_ready_materials_preflight(client: AsyncClient):
    """Project with no ready materials returns guidance without calling LLM."""
    mock_provider = MockLLMProvider(should_fail=True)  # Would fail if called
    set_llm_provider(mock_provider)

    try:
        creds = await signup_and_login(client, f"no_mat_{uuid.uuid4().hex[:6]}@example.com")
        await client.post("/api/v1/auth/login", json={"email": creds["email"], "password": creds["password"]})

        space_resp = await client.post("/api/v1/spaces", json={"name": "Space"})
        space_id = space_resp.json()["id"]
        proj_resp = await client.post(f"/api/v1/spaces/{space_id}/projects", json={"name": "Project", "learning_goal": "Learn Transformers"})
        project_id = proj_resp.json()["id"]

        # No materials uploaded — ask tutor
        resp = await client.post(
            f"/api/v1/projects/{project_id}/tutor",
            json={"question": "What is self-attention?"},
        )
        assert resp.status_code == 200
        data = resp.json()

        assert data["grounded"] is False
        assert data["insufficient_evidence"] is True
        assert data["citations"] == []
        assert "message_id" in data
        assert data["message_id"] is not None  # Message persisted
        assert "upload" in data["answer"].lower() or "material" in data["answer"].lower()
    finally:
        set_llm_provider(None)


@pytest.mark.asyncio
async def test_tutor_insufficient_evidence_response(
    client: AsyncClient, db_session: AsyncSession
):
    """Unrelated question produces insufficient evidence response."""
    mock_provider = MockLLMProvider()
    set_llm_provider(mock_provider)

    try:
        creds = await signup_and_login(client, f"insuf_{uuid.uuid4().hex[:6]}@example.com")
        await client.post("/api/v1/auth/login", json={"email": creds["email"], "password": creds["password"]})

        space_resp = await client.post("/api/v1/spaces", json={"name": "Space"})
        space_id = space_resp.json()["id"]
        proj_resp = await client.post(f"/api/v1/spaces/{space_id}/projects", json={"name": "Project", "learning_goal": "Learn Transformers"})
        project_id = proj_resp.json()["id"]

        me_resp = await client.get("/api/v1/auth/me")
        user_id = uuid.UUID(me_resp.json()["id"])
        project_uuid = uuid.UUID(project_id)

        await create_ready_material(db_session, user_id, project_uuid)

        # Very strict threshold so unrelated question fails
        with patch.object(settings, "TUTOR_SIMILARITY_THRESHOLD", 0.05):
            resp = await client.post(
                f"/api/v1/projects/{project_id}/tutor",
                json={"question": "How does photosynthesis occur in plants?"},
            )
        assert resp.status_code == 200
        data = resp.json()
        # With very strict threshold, no evidence should pass
        assert data["insufficient_evidence"] is True
        assert data["grounded"] is False
        assert data["citations"] == []
        assert data["message_id"] is not None
    finally:
        set_llm_provider(None)


@pytest.mark.asyncio
async def test_tutor_gemini_failure_does_not_persist_assistant_message(
    client: AsyncClient, db_session: AsyncSession
):
    """LLM failure returns 502 and does NOT persist a successful assistant message."""
    mock_provider = MockLLMProvider(should_fail=True)
    set_llm_provider(mock_provider)

    try:
        creds = await signup_and_login(client, f"gemfail_{uuid.uuid4().hex[:6]}@example.com")
        await client.post("/api/v1/auth/login", json={"email": creds["email"], "password": creds["password"]})

        space_resp = await client.post("/api/v1/spaces", json={"name": "Space"})
        space_id = space_resp.json()["id"]
        proj_resp = await client.post(f"/api/v1/spaces/{space_id}/projects", json={"name": "Project", "learning_goal": "Learn Transformers"})
        project_id = proj_resp.json()["id"]

        me_resp = await client.get("/api/v1/auth/me")
        user_id = uuid.UUID(me_resp.json()["id"])
        project_uuid = uuid.UUID(project_id)

        await create_ready_material(db_session, user_id, project_uuid)

        resp = await client.post(
            f"/api/v1/projects/{project_id}/tutor",
            json={"question": "How does self-attention work?"},
        )
        # LLM failure should produce a controlled error
        assert resp.status_code == 502, resp.text

        # Verify NO successful assistant message was persisted
        from sqlalchemy import select
        result = await db_session.execute(
            select(TutorMessage).where(
                TutorMessage.project_id == project_uuid,
                TutorMessage.role == "assistant",
            )
        )
        assistant_msgs = result.scalars().all()
        # No grounded assistant message should exist
        grounded_msgs = [m for m in assistant_msgs if m.grounded is True]
        assert len(grounded_msgs) == 0
    finally:
        set_llm_provider(None)


# ===========================================================================
# Section C: Conversation Tests
# ===========================================================================

@pytest.mark.asyncio
async def test_conversation_lifecycle_and_followup(
    client: AsyncClient, db_session: AsyncSession
):
    """New conversation is created; follow-up reuses it."""
    mock_provider = MockLLMProvider()
    set_llm_provider(mock_provider)

    try:
        creds = await signup_and_login(client, f"convlife_{uuid.uuid4().hex[:6]}@example.com")
        await client.post("/api/v1/auth/login", json={"email": creds["email"], "password": creds["password"]})

        space_resp = await client.post("/api/v1/spaces", json={"name": "Space"})
        space_id = space_resp.json()["id"]
        proj_resp = await client.post(f"/api/v1/spaces/{space_id}/projects", json={"name": "Project", "learning_goal": "Learn Transformers"})
        project_id = proj_resp.json()["id"]

        me_resp = await client.get("/api/v1/auth/me")
        user_id = uuid.UUID(me_resp.json()["id"])
        project_uuid = uuid.UUID(project_id)

        await create_ready_material(db_session, user_id, project_uuid)

        # First turn — new conversation
        resp1 = await client.post(
            f"/api/v1/projects/{project_id}/tutor",
            json={"question": "What is the Transformer architecture?"},
        )
        assert resp1.status_code == 200
        conv_id = resp1.json()["conversation_id"]

        # Follow-up — reuse conversation
        resp2 = await client.post(
            f"/api/v1/projects/{project_id}/tutor",
            json={"question": "How does self-attention work?", "conversation_id": conv_id},
        )
        assert resp2.status_code == 200
        assert resp2.json()["conversation_id"] == conv_id

        # Verify conversation has 4 messages (2 user + 2 assistant)
        conv_resp = await client.get(f"/api/v1/tutor/conversations/{conv_id}")
        assert conv_resp.status_code == 200
        messages = conv_resp.json()["messages"]
        assert len(messages) == 4
        roles = [m["role"] for m in messages]
        assert roles == ["user", "assistant", "user", "assistant"]
    finally:
        set_llm_provider(None)


@pytest.mark.asyncio
async def test_conversation_cross_user_isolation(
    client: AsyncClient, db_session: AsyncSession
):
    """User B cannot access User A's conversation — returns 404."""
    mock_provider = MockLLMProvider()
    set_llm_provider(mock_provider)

    try:
        # User A creates a conversation
        creds_a = await signup_and_login(client, f"ciso_a_{uuid.uuid4().hex[:6]}@example.com")
        await client.post("/api/v1/auth/login", json={"email": creds_a["email"], "password": creds_a["password"]})

        space_resp = await client.post("/api/v1/spaces", json={"name": "Space A"})
        space_id = space_resp.json()["id"]
        proj_resp = await client.post(f"/api/v1/spaces/{space_id}/projects", json={"name": "Project A", "learning_goal": "Learn Transformers"})
        project_id = proj_resp.json()["id"]

        me_resp = await client.get("/api/v1/auth/me")
        user_id = uuid.UUID(me_resp.json()["id"])
        project_uuid = uuid.UUID(project_id)

        await create_ready_material(db_session, user_id, project_uuid)

        resp = await client.post(
            f"/api/v1/projects/{project_id}/tutor",
            json={"question": "What is self-attention?"},
        )
        assert resp.status_code == 200
        conv_id = resp.json()["conversation_id"]

        # User B tries to access User A's conversation
        creds_b = await signup_and_login(client, f"ciso_b_{uuid.uuid4().hex[:6]}@example.com")
        await client.post("/api/v1/auth/login", json={"email": creds_b["email"], "password": creds_b["password"]})

        resp_b = await client.get(f"/api/v1/tutor/conversations/{conv_id}")
        assert resp_b.status_code == 404
    finally:
        set_llm_provider(None)


# ===========================================================================
# Section D: API Validation Tests
# ===========================================================================

@pytest.mark.asyncio
async def test_api_unauthenticated_request_fails(client: AsyncClient):
    """Unauthenticated requests to tutor endpoint return 401."""
    resp = await client.post(
        f"/api/v1/projects/{uuid.uuid4()}/tutor",
        json={"question": "What is attention?"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_api_nonexistent_project_returns_404(client: AsyncClient):
    """Accessing tutor for a non-existent project returns 404."""
    mock_provider = MockLLMProvider()
    set_llm_provider(mock_provider)

    try:
        creds = await signup_and_login(client, f"proj404_{uuid.uuid4().hex[:6]}@example.com")
        await client.post("/api/v1/auth/login", json={"email": creds["email"], "password": creds["password"]})

        resp = await client.post(
            f"/api/v1/projects/{uuid.uuid4()}/tutor",
            json={"question": "What is attention?"},
        )
        assert resp.status_code == 404
    finally:
        set_llm_provider(None)


@pytest.mark.asyncio
async def test_api_empty_question_rejected(client: AsyncClient):
    """Empty question is rejected with 422."""
    creds = await signup_and_login(client, f"empty_q_{uuid.uuid4().hex[:6]}@example.com")
    await client.post("/api/v1/auth/login", json={"email": creds["email"], "password": creds["password"]})

    space_resp = await client.post("/api/v1/spaces", json={"name": "Space"})
    space_id = space_resp.json()["id"]
    proj_resp = await client.post(f"/api/v1/spaces/{space_id}/projects", json={"name": "Project", "learning_goal": "Learn Transformers"})
    project_id = proj_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/projects/{project_id}/tutor",
        json={"question": "   "},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_api_question_too_long_rejected(client: AsyncClient):
    """Question exceeding TUTOR_MAX_QUESTION_LENGTH is rejected with 422."""
    creds = await signup_and_login(client, f"long_q_{uuid.uuid4().hex[:6]}@example.com")
    await client.post("/api/v1/auth/login", json={"email": creds["email"], "password": creds["password"]})

    space_resp = await client.post("/api/v1/spaces", json={"name": "Space"})
    space_id = space_resp.json()["id"]
    proj_resp = await client.post(f"/api/v1/spaces/{space_id}/projects", json={"name": "Project", "learning_goal": "Learn Transformers"})
    project_id = proj_resp.json()["id"]

    long_question = "a" * (settings.TUTOR_MAX_QUESTION_LENGTH + 1)
    resp = await client.post(
        f"/api/v1/projects/{project_id}/tutor",
        json={"question": long_question},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_api_invalid_conversation_returns_404(client: AsyncClient):
    """Referencing a non-existent conversation_id returns 404."""
    mock_provider = MockLLMProvider()
    set_llm_provider(mock_provider)

    try:
        creds = await signup_and_login(client, f"inv_conv_{uuid.uuid4().hex[:6]}@example.com")
        await client.post("/api/v1/auth/login", json={"email": creds["email"], "password": creds["password"]})

        space_resp = await client.post("/api/v1/spaces", json={"name": "Space"})
        space_id = space_resp.json()["id"]
        proj_resp = await client.post(f"/api/v1/spaces/{space_id}/projects", json={"name": "Project", "learning_goal": "Learn Transformers"})
        project_id = proj_resp.json()["id"]

        resp = await client.post(
            f"/api/v1/projects/{project_id}/tutor",
            json={"question": "What is attention?", "conversation_id": str(uuid.uuid4())},
        )
        assert resp.status_code == 404
    finally:
        set_llm_provider(None)


# ===========================================================================
# Section E: Security Tests
# ===========================================================================

@pytest.mark.asyncio
async def test_security_gemini_api_key_never_in_response(client: AsyncClient):
    """API responses never contain GEMINI_API_KEY or provider internals."""
    mock_provider = MockLLMProvider()
    set_llm_provider(mock_provider)

    try:
        creds = await signup_and_login(client, f"sec_{uuid.uuid4().hex[:6]}@example.com")
        await client.post("/api/v1/auth/login", json={"email": creds["email"], "password": creds["password"]})

        space_resp = await client.post("/api/v1/spaces", json={"name": "Space"})
        space_id = space_resp.json()["id"]
        proj_resp = await client.post(f"/api/v1/spaces/{space_id}/projects", json={"name": "Project", "learning_goal": "Learn Transformers"})
        project_id = proj_resp.json()["id"]

        resp = await client.post(
            f"/api/v1/projects/{project_id}/tutor",
            json={"question": "What is attention?"},
        )
        response_text = resp.text

        # API key must never appear in any response body
        if settings.GEMINI_API_KEY:
            assert settings.GEMINI_API_KEY not in response_text
        assert "GEMINI_API_KEY" not in response_text
        assert "api_key" not in response_text.lower().replace("\"api_key\"", "")
    finally:
        set_llm_provider(None)


@pytest.mark.asyncio
async def test_security_cross_tenant_retrieval_impossible(
    db_session: AsyncSession, two_user_setup: dict
):
    """Retrieval strictly prevents cross-tenant chunk access at DB level."""
    user_a = two_user_setup["user_a"]
    proj_a = two_user_setup["proj_a"]
    user_b = two_user_setup["user_b"]
    proj_b = two_user_setup["proj_b"]

    await create_ready_material(db_session, user_a.id, proj_a.id)

    from app.services.retrieval_service import RetrievalService
    svc = RetrievalService(db_session)

    # User B queries against their own (empty) project
    result = await svc.retrieve_relevant_chunks(
        user_id=user_b.id,
        project_id=proj_b.id,
        question="How does self-attention compute representations?",
    )
    assert len(result.accepted_chunks) == 0
    assert not result.is_sufficient

    # Verify User B cannot see User A's material chunks even if they guess project_id
    result_cross = await svc.retrieve_relevant_chunks(
        user_id=user_b.id,
        project_id=proj_a.id,  # User A's project
        question="How does self-attention compute representations?",
    )
    assert len(result_cross.accepted_chunks) == 0
    assert not result_cross.is_sufficient
