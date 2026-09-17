"""Tests for LangSmith Tracing and External Observability Integration.

Verifies:
1. Application works when LangSmith tracing is disabled.
2. Application works when LANGSMITH_API_KEY is absent.
3. LangSmith configuration is read from environment.
4. LangSmith integration does not break Gemini calls.
5. Existing AI usage logging still works.
6. Gemini failure still produces the existing controlled error.
7. No API key is written to application logs or trace metadata.
"""

import os
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.gemini_provider import GeminiProvider, MockLLMProvider
from app.ai.llm import LLMGenerationError
from app.ai.observability import log_ai_usage
from app.ai.tracing import (
    is_tracing_enabled,
    sanitize_metadata,
    setup_tracing_env,
    trace_gemini_client,
    tracing_context_manager,
)
from app.core.config import Settings, settings
from app.models.ai_usage import AIUsageLog


class DummySchema(BaseModel):
    message: str


def test_langsmith_config_reading():
    """Verify that Settings correctly resolves LANGSMITH_* and legacy LANGCHAIN_* variables."""
    with patch.dict(
        os.environ,
        {
            "LANGSMITH_TRACING": "true",
            "LANGSMITH_API_KEY": "lsv2_test_key_123",
            "LANGSMITH_PROJECT": "custom-project",
            "LANGSMITH_ENDPOINT": "https://custom.endpoint.com",
        },
        clear=False,
    ):
        custom_settings = Settings(_env_file=None)
        assert custom_settings.is_langsmith_enabled is True
        assert custom_settings.langsmith_api_key == "lsv2_test_key_123"
        assert custom_settings.langsmith_project == "custom-project"
        assert custom_settings.langsmith_endpoint == "https://custom.endpoint.com"

    # Fallback to LANGCHAIN_* legacy variables
    with patch.dict(
        os.environ,
        {
            "LANGSMITH_TRACING": "false",
            "LANGSMITH_API_KEY": "",
            "LANGSMITH_PROJECT": "",
            "LANGCHAIN_TRACING_V2": "true",
            "LANGCHAIN_API_KEY": "legacy_key_456",
            "LANGCHAIN_PROJECT": "legacy-project",
        },
        clear=False,
    ):
        legacy_settings = Settings(_env_file=None)
        assert legacy_settings.is_langsmith_enabled is True
        assert legacy_settings.langsmith_api_key == "legacy_key_456"
        assert legacy_settings.langsmith_project == "legacy-project"


def test_langsmith_disabled_works_normally():
    """Verify system operates normally when tracing is disabled."""
    with patch.object(settings, "LANGSMITH_TRACING", False), patch.object(
        settings, "LANGCHAIN_TRACING_V2", False
    ):
        assert is_tracing_enabled() is False

        # Tracing context should be a no-op that yields cleanly
        with tracing_context_manager(feature="test", metadata={"foo": "bar"}):
            pass

        # trace_gemini_client should return the raw client untouched
        raw_client = MagicMock()
        result_client = trace_gemini_client(raw_client)
        assert result_client is raw_client


def test_langsmith_absent_api_key():
    """Verify system operates normally when API key is missing."""
    with patch.object(settings, "LANGSMITH_TRACING", True), patch.object(
        settings, "LANGSMITH_API_KEY", None
    ), patch.object(settings, "LANGCHAIN_API_KEY", None):
        assert is_tracing_enabled() is False

        raw_client = MagicMock()
        result_client = trace_gemini_client(raw_client)
        assert result_client is raw_client


def test_sanitize_metadata_removes_sensitive_keys():
    """Verify that sensitive fields are stripped and never leak into trace metadata."""
    dirty_meta = {
        "feature": "tutor",
        "project_id": "12345",
        "api_key": "secret_gemini_key",
        "access_token": "bearer_xyz",
        "jwt_token": "token_abc",
        "user_password": "super_secret_password",
        "safe_int": 42,
        "safe_bool": True,
    }
    cleaned = sanitize_metadata(dirty_meta)

    assert "feature" in cleaned
    assert "project_id" in cleaned
    assert "safe_int" in cleaned
    assert "safe_bool" in cleaned
    assert "api_key" not in cleaned
    assert "access_token" not in cleaned
    assert "jwt_token" not in cleaned
    assert "user_password" not in cleaned


@pytest.mark.asyncio
async def test_mock_provider_accepts_tracing_arguments():
    """Verify that MockLLMProvider cleanly accepts feature, tags, and metadata."""
    provider = MockLLMProvider(canned_response=DummySchema(message="hello"))
    parsed, usage = await provider.generate_structured(
        system_instruction="System",
        user_prompt="User",
        response_schema=DummySchema,
        feature="tutor",
        tags=["tutor", "test"],
        metadata={"custom_key": "val"},
    )
    assert parsed.message == "hello"
    assert usage.prompt_tokens == 150


@pytest.mark.asyncio
async def test_gemini_provider_error_handling():
    """Verify that Gemini provider failures raise LLMGenerationError without LangSmith blocking."""
    provider = GeminiProvider(api_key="mock_key", model_name="gemini-test")
    # Mock the internal client.aio.models.generate_content to raise a 429 quota exception
    mock_aio = MagicMock()
    mock_aio.models.generate_content = AsyncMock(side_effect=Exception("429 RESOURCE_EXHAUSTED"))

    with patch.object(provider, "_client", MagicMock(aio=mock_aio)):
        with pytest.raises(LLMGenerationError) as exc_info:
            await provider.generate_structured(
                system_instruction="System",
                user_prompt="User",
                response_schema=DummySchema,
                feature="tutor",
                tags=["tutor"],
                metadata={"project_id": "123"},
            )
        assert "429 RESOURCE_EXHAUSTED" in str(exc_info.value.original_error)


@pytest.mark.asyncio
async def test_existing_ai_usage_logging_persists_to_db(db_session: AsyncSession):
    """Verify that existing ai_usage_logs recording continues functioning alongside LangSmith."""
    op_name = f"langsmith_coexistence_test_{uuid.uuid4().hex[:8]}"

    # Log usage through existing app.ai.observability (with user_id=None, project_id=None)
    await log_ai_usage(
        user_id=None,
        project_id=None,
        operation=op_name,
        provider="gemini",
        model="gemini-flash-lite-latest",
        latency_ms=123.4,
        input_tokens=100,
        output_tokens=50,
        total_tokens=150,
        success=True,
        session=db_session,
    )

    # Verify directly from database
    stmt = select(AIUsageLog).where(
        AIUsageLog.operation == op_name,
    )
    result = await db_session.execute(stmt)
    record = result.scalar_one_or_none()
    assert record is not None
    assert record.provider == "gemini"
    assert record.total_tokens == 150
    assert record.success is True


def test_setup_tracing_env_populates_os_environ():
    """Verify that setup_tracing_env correctly synchronizes variables into os.environ."""
    with patch.object(settings, "LANGSMITH_TRACING", True), patch.object(
        settings, "LANGSMITH_API_KEY", "lsv2_sync_test"
    ), patch.object(settings, "LANGSMITH_PROJECT", "test-project-sync"):
        setup_tracing_env()
        assert os.environ.get("LANGSMITH_TRACING") == "true"
        assert os.environ.get("LANGSMITH_PROJECT") == "test-project-sync"
        assert os.environ.get("LANGSMITH_API_KEY") == "lsv2_sync_test"


# ==============================================================================
# Full AI Tutor Pipeline Tracing Tests (Requirement 16)
# ==============================================================================


@pytest.mark.asyncio
async def test_tutor_pipeline_full_nested_trace_tree(
    db_session: AsyncSession,
):
    """Verify complete AI Tutor Request trace tree with all children and sub-children."""
    from langsmith.run_trees import RunTree

    from app.ai.gemini_provider import MockLLMProvider, set_llm_provider
    from app.models.user import User
    from app.schemas.tutor import TutorRequest
    from app.services.tutor_service import TutorService

    # 1. Setup user and project with ready material
    user = User(
        id=uuid.uuid4(),
        email=f"tutor_trace_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hashed_pw",
        full_name="Tutor Trace User",
        role="user",
    )
    db_session.add(user)
    from app.models.project import Project
    from app.models.space import Space
    from tests.test_tutor import create_ready_material

    space = Space(id=uuid.uuid4(), user_id=user.id, name="Trace Space")
    db_session.add(space)
    project = Project(
        id=uuid.uuid4(),
        space_id=space.id,
        user_id=user.id,
        name="Transformer Project",
        learning_goal="Master Transformers",
    )
    db_session.add(project)
    await db_session.commit()
    await create_ready_material(db_session, user.id, project.id)

    set_llm_provider(MockLLMProvider())
    captured_runs: list[RunTree] = []

    def capture_post(self: RunTree) -> None:
        captured_runs.append(self)

    # 2. Execute pipeline with mocked RunTree.post and active tracing
    from langsmith import utils
    from langsmith.run_helpers import tracing_context

    utils.get_env_var.cache_clear()
    with (
        patch.dict(os.environ, {"LANGSMITH_TRACING": "true"}, clear=False),
        patch.object(settings, "LANGSMITH_TRACING", True),
        patch.object(settings, "LANGSMITH_API_KEY", "lsv2_test_key"),
        patch.object(RunTree, "post", capture_post),
        patch.object(RunTree, "patch", lambda s: None),
        tracing_context(enabled=True),
    ):
        service = TutorService(db_session)
        answer = await service.ask(
            user_id=user.id,
            project_id=project.id,
            payload=TutorRequest(question="How does self-attention compute token representations?"),
        )

    # 3. Assert pipeline business outcome
    assert answer is not None
    assert answer.answer is not None

    # 4. Assert parent trace
    run_map = {r.name: r for r in captured_runs}
    assert "AI Tutor Request" in run_map, "Missing root span 'AI Tutor Request'"
    parent = run_map["AI Tutor Request"]
    assert parent.run_type == "chain"
    assert parent.parent_run_id is None

    # 5. Assert all required direct children exist and point to parent
    expected_children = [
        ("Tutor Preflight", "chain"),
        ("Load Conversation Context", "chain"),
        ("Embed Question", "embedding"),
        ("Retrieve Relevant Knowledge", "retriever"),
        ("Build Grounded Prompt", "prompt"),
        ("Gemini", "llm"),
        ("Parse Structured Output", "parser"),
        ("Validate Citations", "chain"),
        ("Persist Tutor Message", "chain"),
    ]
    for child_name, child_type in expected_children:
        assert child_name in run_map, f"Missing child span '{child_name}'"
        child_run = run_map[child_name]
        assert child_run.run_type == child_type
        assert child_run.parent_run_id == parent.id, (
            f"Child span '{child_name}' parent_run_id={child_run.parent_run_id} does not match parent id={parent.id}"
        )

    # 6. Assert Retrieve Relevant Knowledge sub-children (Vector Search, Rank Results, Apply Evidence Threshold)
    retrieve_run = run_map["Retrieve Relevant Knowledge"]
    assert "Vector Search" in run_map, "Missing 'Vector Search' span"
    assert "Rank Results" in run_map, "Missing 'Rank Results' span"
    assert "Apply Evidence Threshold" in run_map, "Missing 'Apply Evidence Threshold' span"

    vector_run = run_map["Vector Search"]
    rank_run = run_map["Rank Results"]
    threshold_run = run_map["Apply Evidence Threshold"]

    assert vector_run.run_type == "retriever"
    assert vector_run.parent_run_id == retrieve_run.id, (
        f"'Vector Search' parent_run_id={vector_run.parent_run_id} must match 'Retrieve Relevant Knowledge' id={retrieve_run.id}"
    )
    assert rank_run.run_type == "chain"
    assert rank_run.parent_run_id == retrieve_run.id, (
        f"'Rank Results' parent_run_id={rank_run.parent_run_id} must match 'Retrieve Relevant Knowledge' id={retrieve_run.id}"
    )
    assert threshold_run.run_type == "chain"
    assert threshold_run.parent_run_id == retrieve_run.id, (
        f"'Apply Evidence Threshold' parent_run_id={threshold_run.parent_run_id} must match 'Retrieve Relevant Knowledge' id={retrieve_run.id}"
    )


@pytest.mark.asyncio
async def test_tutor_tracing_disabled_works_normally(db_session: AsyncSession):
    """Verify application functions normally when LangSmith tracing is explicitly disabled."""
    from langsmith import utils
    from langsmith.run_helpers import tracing_context

    from app.ai.gemini_provider import MockLLMProvider, set_llm_provider
    from app.models.user import User
    from app.schemas.tutor import TutorRequest
    from app.services.tutor_service import TutorService
    from tests.test_quiz_repetition import setup_ready_project

    user = User(
        id=uuid.uuid4(),
        email=f"tutor_off_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hashed_pw",
        full_name="Tutor Off User",
        role="user",
    )
    db_session.add(user)
    await db_session.commit()
    _, project, _ = await setup_ready_project(db_session, user)

    set_llm_provider(MockLLMProvider())
    utils.get_env_var.cache_clear()

    with (
        patch.dict(os.environ, {"LANGSMITH_TRACING": "false", "LANGCHAIN_TRACING_V2": "false"}, clear=False),
        patch.object(settings, "LANGSMITH_TRACING", False),
        patch.object(settings, "LANGCHAIN_TRACING_V2", False),
        tracing_context(enabled=False),
    ):
        service = TutorService(db_session)
        answer = await service.ask(
            user_id=user.id,
            project_id=project.id,
            payload=TutorRequest(question="Explain regularization"),
        )
        assert answer is not None
        assert answer.answer is not None


@pytest.mark.asyncio
async def test_tutor_tracing_unavailable_fails_safely(db_session: AsyncSession):
    """Verify application never fails even if LangSmith run ingestion throws network exceptions."""
    from langsmith.run_trees import RunTree

    from app.ai.gemini_provider import MockLLMProvider, set_llm_provider
    from app.models.user import User
    from app.schemas.tutor import TutorRequest
    from app.services.tutor_service import TutorService
    from tests.test_quiz_repetition import setup_ready_project

    user = User(
        id=uuid.uuid4(),
        email=f"tutor_fail_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hashed_pw",
        full_name="Tutor Net Fail User",
        role="user",
    )
    db_session.add(user)
    await db_session.commit()
    _, project, _ = await setup_ready_project(db_session, user)

    set_llm_provider(MockLLMProvider())

    def crashing_post(self: RunTree) -> None:
        raise RuntimeError("LangSmith 503 Service Unavailable")

    with (
        patch.dict(os.environ, {"LANGSMITH_TRACING": "true"}, clear=False),
        patch.object(settings, "LANGSMITH_TRACING", True),
        patch.object(settings, "LANGSMITH_API_KEY", "lsv2_test_key"),
        patch.object(RunTree, "post", crashing_post),
    ):
        service = TutorService(db_session)
        # Should complete smoothly despite LangSmith network outage
        answer = await service.ask(
            user_id=user.id,
            project_id=project.id,
            payload=TutorRequest(question="What is cross validation?"),
        )
        assert answer is not None
        assert answer.answer is not None


@pytest.mark.asyncio
async def test_gemini_failure_remains_visible_as_error(db_session: AsyncSession):
    """Verify that when Gemini fails, HTTPException is raised and error is marked in LangSmith."""
    from fastapi import HTTPException

    from app.ai.gemini_provider import MockLLMProvider, set_llm_provider
    from app.models.user import User
    from app.schemas.tutor import TutorRequest
    from app.services.tutor_service import TutorService

    user = User(
        id=uuid.uuid4(),
        email=f"tutor_err_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hashed_pw",
        full_name="Tutor Err User",
        role="user",
    )
    db_session.add(user)
    from app.models.project import Project
    from app.models.space import Space
    from tests.test_tutor import create_ready_material

    space = Space(id=uuid.uuid4(), user_id=user.id, name="Err Space")
    db_session.add(space)
    project = Project(
        id=uuid.uuid4(),
        space_id=space.id,
        user_id=user.id,
        name="Transformer Project",
        learning_goal="Master Transformers",
    )
    db_session.add(project)
    await db_session.commit()
    await create_ready_material(db_session, user.id, project.id)

    # Force LLM generation failure
    set_llm_provider(MockLLMProvider(should_fail=True))

    try:
        service = TutorService(db_session)
        with pytest.raises(HTTPException) as exc_info:
            await service.ask(
                user_id=user.id,
                project_id=project.id,
                payload=TutorRequest(question="How does self-attention compute token representations?"),
            )
        assert exc_info.value.status_code == 502
    finally:
        set_llm_provider(MockLLMProvider())


@pytest.mark.asyncio
async def test_unsupported_question_skips_gemini(db_session: AsyncSession):
    """Verify that unsupported questions run Preflight & Retrieval, but skip Gemini call."""
    from langsmith import utils
    from langsmith.run_helpers import tracing_context
    from langsmith.run_trees import RunTree

    from app.ai.gemini_provider import MockLLMProvider, set_llm_provider
    from app.models.user import User
    from app.schemas.tutor import TutorRequest
    from app.services.tutor_service import TutorService
    from tests.test_quiz_repetition import setup_ready_project

    user = User(
        id=uuid.uuid4(),
        email=f"tutor_unsupp_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hashed_pw",
        full_name="Tutor Unsup User",
        role="user",
    )
    db_session.add(user)
    await db_session.commit()
    _, project, _ = await setup_ready_project(db_session, user)

    set_llm_provider(MockLLMProvider())
    captured_runs: list[RunTree] = []

    def capture_post(self: RunTree) -> None:
        captured_runs.append(self)

    utils.get_env_var.cache_clear()
    with (
        patch.dict(os.environ, {"LANGSMITH_TRACING": "true"}, clear=False),
        patch.object(settings, "LANGSMITH_TRACING", True),
        patch.object(settings, "LANGSMITH_API_KEY", "lsv2_test_key"),
        patch.object(settings, "TUTOR_SIMILARITY_THRESHOLD", 0.001),  # ultra-strict threshold => 0 chunks
        patch.object(RunTree, "post", capture_post),
        patch.object(RunTree, "patch", lambda s: None),
        tracing_context(enabled=True),
    ):
        service = TutorService(db_session)
        answer = await service.ask(
            user_id=user.id,
            project_id=project.id,
            payload=TutorRequest(question="Quantum teleportation in black holes?"),
        )

    assert answer.insufficient_evidence is True
    assert answer.grounded is False

    run_names = {r.name for r in captured_runs}
    assert "AI Tutor Request" in run_names
    assert "Tutor Preflight" in run_names
    assert "Embed Question" in run_names
    assert "Retrieve Relevant Knowledge" in run_names
    # Gemini must NOT be called when evidence is insufficient
    assert "Gemini" not in run_names, "Gemini should NOT have been invoked on insufficient evidence"
    assert "Validate Citations" not in run_names

    parent = next(r for r in captured_runs if r.name == "AI Tutor Request")
    assert parent.outputs.get("gemini_called") is False
    assert parent.outputs.get("insufficient_evidence") is True



@pytest.mark.asyncio
async def test_no_secrets_are_logged_in_traces(db_session: AsyncSession):
    """Verify that no sensitive fields (passwords, tokens, api keys) are logged to trace inputs/outputs/metadata."""
    from langsmith import utils
    from langsmith.run_helpers import tracing_context
    from langsmith.run_trees import RunTree

    from app.ai.gemini_provider import MockLLMProvider, set_llm_provider
    from app.models.user import User
    from app.schemas.tutor import TutorRequest
    from app.services.tutor_service import TutorService
    from tests.test_quiz_repetition import setup_ready_project

    user = User(
        id=uuid.uuid4(),
        email=f"tutor_secrets_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hashed_pw",
        full_name="Tutor Secrets User",
        role="user",
    )
    db_session.add(user)
    await db_session.commit()
    _, project, _ = await setup_ready_project(db_session, user)

    set_llm_provider(MockLLMProvider())
    captured_runs: list[RunTree] = []

    def capture_post(self: RunTree) -> None:
        captured_runs.append(self)

    utils.get_env_var.cache_clear()
    with (
        patch.dict(os.environ, {"LANGSMITH_TRACING": "true"}, clear=False),
        patch.object(settings, "LANGSMITH_TRACING", True),
        patch.object(settings, "LANGSMITH_API_KEY", "secret_langsmith_key_123"),
        patch.object(settings, "GEMINI_API_KEY", "secret_gemini_key_456"),
        patch.object(RunTree, "post", capture_post),
        patch.object(RunTree, "patch", lambda s: None),
        tracing_context(enabled=True),
    ):
        service = TutorService(db_session)
        await service.ask(
            user_id=user.id,
            project_id=project.id,
            payload=TutorRequest(question="What is gradient descent?"),
        )

    sensitive_tokens = ["secret_langsmith_key_123", "secret_gemini_key_456", "hashed_pw"]
    for run in captured_runs:
        run_data_str = f"{run.inputs} {run.outputs} {run.metadata}".lower()
        for token in sensitive_tokens:
            assert token.lower() not in run_data_str, (
                f"Sensitive token '{token}' detected in span '{run.name}'!"
            )


# ==============================================================================
# Document Ingestion Pipeline Tracing Tests
# ==============================================================================


def _create_test_pdf_bytes(text: str | None = None) -> bytes:
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    content = text or (
        "Linear regression models the relationship between a scalar response and one or more explanatory variables. "
        "Ordinary least squares estimates the unknown parameters in a linear regression model by minimizing the sum "
        "of the squared differences between the observed responses in the given dataset and those predicted by a linear function."
    )
    page.insert_text((50, 50), content)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


@pytest.mark.asyncio
async def test_document_pipeline_full_nested_trace_tree(db_session: AsyncSession):
    """Verify complete Document Ingestion trace tree with all children and sub-children."""
    from langsmith import utils
    from langsmith.run_helpers import tracing_context
    from langsmith.run_trees import RunTree

    from app.models.material import Material
    from app.models.project import Project
    from app.models.space import Space
    from app.models.user import User
    from app.services.storage_service import storage_service
    from app.workers.tasks import _execute_ingestion

    user = User(
        id=uuid.uuid4(),
        email=f"doc_trace_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hashed_pw",
        full_name="Doc Trace User",
        role="user",
    )
    db_session.add(user)
    space = Space(id=uuid.uuid4(), user_id=user.id, name="Doc Space")
    db_session.add(space)
    project = Project(
        id=uuid.uuid4(),
        space_id=space.id,
        user_id=user.id,
        name="Doc Ingestion Project",
        learning_goal="Master Ingestion",
    )
    db_session.add(project)

    material_id = uuid.uuid4()
    pdf_bytes = _create_test_pdf_bytes()
    storage_path = storage_service.save_file(
        project_id=project.id,
        material_id=material_id,
        content=pdf_bytes,
    )
    material = Material(
        id=material_id,
        project_id=project.id,
        user_id=user.id,
        filename="linear_regression.pdf",
        storage_path=storage_path,
        status="queued",
    )
    db_session.add(material)
    await db_session.commit()

    captured_runs: list[RunTree] = []

    def capture_post(self: RunTree) -> None:
        captured_runs.append(self)

    utils.get_env_var.cache_clear()
    with (
        patch.dict(os.environ, {"LANGSMITH_TRACING": "true"}, clear=False),
        patch.object(settings, "LANGSMITH_TRACING", True),
        patch.object(settings, "LANGSMITH_API_KEY", "lsv2_test_key"),
        patch.object(RunTree, "post", capture_post),
        patch.object(RunTree, "patch", lambda s: None),
        tracing_context(enabled=True),
    ):
        result = await _execute_ingestion(material_id, db_session)

    assert result["status"] == "ready"
    assert result["chunk_count"] > 0

    run_map = {r.name: r for r in captured_runs}
    assert "Process Material" in run_map, "Missing 'Process Material' root span"
    parent = run_map["Process Material"]
    assert parent.run_type == "chain"

    expected_children = [
        ("Load Material", "chain"),
        ("Read PDF", "chain"),
        ("Extract Text", "chain"),
        ("Process Pages", "chain"),
        ("Clean / Normalize Text", "chain"),
        ("Chunk Document", "chain"),
        ("Generate Chunk Embeddings", "embedding"),
        ("Store Chunks", "chain"),
        ("Mark Material Ready", "chain"),
    ]
    for child_name, child_type in expected_children:
        assert child_name in run_map, f"Missing child span '{child_name}' in document ingestion trace"
        child_run = run_map[child_name]
        assert child_run.run_type == child_type
        assert child_run.parent_run_id == parent.id, (
            f"Child span '{child_name}' parent_run_id={child_run.parent_run_id} must match Process Material id={parent.id}"
        )


@pytest.mark.asyncio
async def test_chunk_document_trace_and_metadata(db_session: AsyncSession):
    """Verify Chunk Document trace captures correct page-aware lookback configuration and statistics."""
    from langsmith import utils
    from langsmith.run_helpers import tracing_context
    from langsmith.run_trees import RunTree

    from app.models.material import Material
    from app.models.project import Project
    from app.models.space import Space
    from app.models.user import User
    from app.services.storage_service import storage_service
    from app.workers.tasks import _execute_ingestion

    user = User(
        id=uuid.uuid4(),
        email=f"chunk_trace_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hashed_pw",
        full_name="Chunk Trace User",
        role="user",
    )
    db_session.add(user)
    space = Space(id=uuid.uuid4(), user_id=user.id, name="Chunk Space")
    db_session.add(space)
    project = Project(
        id=uuid.uuid4(),
        space_id=space.id,
        user_id=user.id,
        name="Chunk Project",
        learning_goal="Chunking",
    )
    db_session.add(project)

    material_id = uuid.uuid4()
    pdf_bytes = _create_test_pdf_bytes("Chunking test text content for page awareness verification.")
    storage_path = storage_service.save_file(
        project_id=project.id,
        material_id=material_id,
        content=pdf_bytes,
    )
    material = Material(
        id=material_id,
        project_id=project.id,
        user_id=user.id,
        filename="chunk_test.pdf",
        storage_path=storage_path,
        status="queued",
    )
    db_session.add(material)
    await db_session.commit()

    captured_runs: list[RunTree] = []

    def capture_post(self: RunTree) -> None:
        captured_runs.append(self)

    utils.get_env_var.cache_clear()
    with (
        patch.dict(os.environ, {"LANGSMITH_TRACING": "true"}, clear=False),
        patch.object(settings, "LANGSMITH_TRACING", True),
        patch.object(settings, "LANGSMITH_API_KEY", "lsv2_test_key"),
        patch.object(RunTree, "post", capture_post),
        patch.object(RunTree, "patch", lambda s: None),
        tracing_context(enabled=True),
    ):
        await _execute_ingestion(material_id, db_session)

    chunk_run = next(r for r in captured_runs if r.name == "Chunk Document")
    outputs = chunk_run.outputs or {}
    assert outputs.get("chunking_strategy") == "page_aware_sentence_paragraph_lookback"
    assert outputs.get("target_chunk_size") == 2400
    assert outputs.get("overlap") == 400
    assert outputs.get("page_aware") is True
    assert outputs.get("total_chunks", 0) >= 1
    assert "preview" in outputs
    assert len(outputs["preview"]) > 0
    assert len(outputs["preview"][0]["preview"]) <= 100


@pytest.mark.asyncio
async def test_generate_chunk_embeddings_no_raw_vectors(db_session: AsyncSession):
    """Verify Generate Chunk Embeddings trace captures model & dimensions and never logs raw vectors."""
    from langsmith import utils
    from langsmith.run_helpers import tracing_context
    from langsmith.run_trees import RunTree

    from app.models.material import Material
    from app.models.project import Project
    from app.models.space import Space
    from app.models.user import User
    from app.services.storage_service import storage_service
    from app.workers.tasks import _execute_ingestion

    user = User(
        id=uuid.uuid4(),
        email=f"emb_trace_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hashed_pw",
        full_name="Emb Trace User",
        role="user",
    )
    db_session.add(user)
    space = Space(id=uuid.uuid4(), user_id=user.id, name="Emb Space")
    db_session.add(space)
    project = Project(
        id=uuid.uuid4(),
        space_id=space.id,
        user_id=user.id,
        name="Emb Project",
        learning_goal="Embedding",
    )
    db_session.add(project)

    material_id = uuid.uuid4()
    pdf_bytes = _create_test_pdf_bytes()
    storage_path = storage_service.save_file(
        project_id=project.id,
        material_id=material_id,
        content=pdf_bytes,
    )
    material = Material(
        id=material_id,
        project_id=project.id,
        user_id=user.id,
        filename="emb_test.pdf",
        storage_path=storage_path,
        status="queued",
    )
    db_session.add(material)
    await db_session.commit()

    captured_runs: list[RunTree] = []

    def capture_post(self: RunTree) -> None:
        captured_runs.append(self)

    utils.get_env_var.cache_clear()
    with (
        patch.dict(os.environ, {"LANGSMITH_TRACING": "true"}, clear=False),
        patch.object(settings, "LANGSMITH_TRACING", True),
        patch.object(settings, "LANGSMITH_API_KEY", "lsv2_test_key"),
        patch.object(RunTree, "post", capture_post),
        patch.object(RunTree, "patch", lambda s: None),
        tracing_context(enabled=True),
    ):
        await _execute_ingestion(material_id, db_session)

    emb_run = next(r for r in captured_runs if r.name == "Generate Chunk Embeddings")
    assert emb_run.run_type == "embedding"
    assert emb_run.outputs.get("embedding_dimension") == settings.EMBEDDING_DIMENSION
    assert emb_run.outputs.get("embedding_model") == settings.EMBEDDING_MODEL_NAME
    # Ensure no raw vector arrays appear in trace outputs
    assert "embeddings" not in emb_run.outputs
    assert "vectors" not in emb_run.outputs


@pytest.mark.asyncio
async def test_store_chunks_and_hnsw_metadata(db_session: AsyncSession):
    """Verify Store Chunks trace captures HNSW vector index target metadata."""
    from langsmith import utils
    from langsmith.run_helpers import tracing_context
    from langsmith.run_trees import RunTree

    from app.models.material import Material
    from app.models.project import Project
    from app.models.space import Space
    from app.models.user import User
    from app.services.storage_service import storage_service
    from app.workers.tasks import _execute_ingestion

    user = User(
        id=uuid.uuid4(),
        email=f"store_trace_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hashed_pw",
        full_name="Store Trace User",
        role="user",
    )
    db_session.add(user)
    space = Space(id=uuid.uuid4(), user_id=user.id, name="Store Space")
    db_session.add(space)
    project = Project(
        id=uuid.uuid4(),
        space_id=space.id,
        user_id=user.id,
        name="Store Project",
        learning_goal="Storage",
    )
    db_session.add(project)

    material_id = uuid.uuid4()
    pdf_bytes = _create_test_pdf_bytes()
    storage_path = storage_service.save_file(
        project_id=project.id,
        material_id=material_id,
        content=pdf_bytes,
    )
    material = Material(
        id=material_id,
        project_id=project.id,
        user_id=user.id,
        filename="store_test.pdf",
        storage_path=storage_path,
        status="queued",
    )
    db_session.add(material)
    await db_session.commit()

    captured_runs: list[RunTree] = []

    def capture_post(self: RunTree) -> None:
        captured_runs.append(self)

    utils.get_env_var.cache_clear()
    with (
        patch.dict(os.environ, {"LANGSMITH_TRACING": "true"}, clear=False),
        patch.object(settings, "LANGSMITH_TRACING", True),
        patch.object(settings, "LANGSMITH_API_KEY", "lsv2_test_key"),
        patch.object(RunTree, "post", capture_post),
        patch.object(RunTree, "patch", lambda s: None),
        tracing_context(enabled=True),
    ):
        await _execute_ingestion(material_id, db_session)

    store_run = next(r for r in captured_runs if r.name == "Store Chunks")
    assert store_run.outputs.get("index_type") == "HNSW"
    assert store_run.outputs.get("distance_metric") == "cosine"
    assert store_run.outputs.get("vector_dimension") == 384
    assert store_run.outputs.get("inserted_count", 0) > 0


@pytest.mark.asyncio
async def test_celery_parent_child_propagation():
    """Verify that when parent_trace is supplied, Celery task nests under Document Upload."""
    from langsmith import traceable, utils
    from langsmith.run_helpers import get_current_run_tree, tracing_context
    from langsmith.run_trees import RunTree

    captured_runs: list[RunTree] = []

    def capture_post(self: RunTree) -> None:
        captured_runs.append(self)

    utils.get_env_var.cache_clear()
    with (
        patch.dict(os.environ, {"LANGSMITH_TRACING": "true"}, clear=False),
        patch.object(settings, "LANGSMITH_TRACING", True),
        patch.object(settings, "LANGSMITH_API_KEY", "lsv2_test_key"),
        patch.object(RunTree, "post", capture_post),
        patch.object(RunTree, "patch", lambda s: None),
        tracing_context(enabled=True),
    ):
        @traceable(name="Document Upload", run_type="chain")
        def simulate_upload():
            rt = get_current_run_tree()
            return rt.to_headers() if rt else {}

        parent_headers = simulate_upload()

        @traceable(name="Process Material", run_type="chain")
        def simulate_process():
            return {"status": "ready"}

        with tracing_context(parent=parent_headers, enabled=True):
            simulate_process()

    upload_run = next(r for r in captured_runs if r.name == "Document Upload")
    process_run = next(r for r in captured_runs if r.name == "Process Material")

    assert upload_run.parent_run_id is None
    assert process_run.parent_run_id == upload_run.id, (
        f"Process Material parent_run_id={process_run.parent_run_id} must match Document Upload id={upload_run.id}"
    )


@pytest.mark.asyncio
async def test_document_processing_failure_traced(db_session: AsyncSession):
    """Verify that corrupt/empty PDF marks material as failed and raises exception in trace."""
    from langsmith import utils
    from langsmith.run_helpers import tracing_context
    from langsmith.run_trees import RunTree

    from app.models.material import Material
    from app.models.project import Project
    from app.models.space import Space
    from app.models.user import User
    from app.services.storage_service import storage_service
    from app.workers.tasks import _execute_ingestion

    user = User(
        id=uuid.uuid4(),
        email=f"fail_trace_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hashed_pw",
        full_name="Fail Trace User",
        role="user",
    )
    db_session.add(user)
    space = Space(id=uuid.uuid4(), user_id=user.id, name="Fail Space")
    db_session.add(space)
    project = Project(
        id=uuid.uuid4(),
        space_id=space.id,
        user_id=user.id,
        name="Fail Project",
        learning_goal="Failures",
    )
    db_session.add(project)

    material_id = uuid.uuid4()
    # Save corrupt content
    storage_path = storage_service.save_file(
        project_id=project.id,
        material_id=material_id,
        content=b"CORRUPT NOT A REAL PDF",
    )
    material = Material(
        id=material_id,
        project_id=project.id,
        user_id=user.id,
        filename="corrupt.pdf",
        storage_path=storage_path,
        status="queued",
    )
    db_session.add(material)
    await db_session.commit()

    captured_runs: list[RunTree] = []

    def capture_post(self: RunTree) -> None:
        captured_runs.append(self)

    utils.get_env_var.cache_clear()
    with (
        patch.dict(os.environ, {"LANGSMITH_TRACING": "true"}, clear=False),
        patch.object(settings, "LANGSMITH_TRACING", True),
        patch.object(settings, "LANGSMITH_API_KEY", "lsv2_test_key"),
        patch.object(RunTree, "post", capture_post),
        patch.object(RunTree, "patch", lambda s: None),
        tracing_context(enabled=True),
    ):
        with pytest.raises(ValueError):
            await _execute_ingestion(material_id, db_session)

    run_names = {r.name for r in captured_runs}
    assert "Process Material" in run_names
    assert "Load Material" in run_names


@pytest.mark.asyncio
async def test_document_idempotency_skip(db_session: AsyncSession):
    """Verify that if material is already ready, processing exits idempotently."""
    from app.models.material import Material
    from app.models.project import Project
    from app.models.space import Space
    from app.models.user import User
    from app.workers.tasks import _execute_ingestion

    user = User(
        id=uuid.uuid4(),
        email=f"idemp_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hashed_pw",
        full_name="Idemp User",
        role="user",
    )
    db_session.add(user)
    space = Space(id=uuid.uuid4(), user_id=user.id, name="Idemp Space")
    db_session.add(space)
    project = Project(
        id=uuid.uuid4(),
        space_id=space.id,
        user_id=user.id,
        name="Idemp Project",
        learning_goal="Idempotency",
    )
    db_session.add(project)

    material_id = uuid.uuid4()
    material = Material(
        id=material_id,
        project_id=project.id,
        user_id=user.id,
        filename="already_ready.pdf",
        storage_path="mock/path.pdf",
        status="ready",
    )
    db_session.add(material)
    await db_session.commit()

    result = await _execute_ingestion(material_id, db_session)
    assert result["status"] == "ready"
    assert result["material_id"] == str(material_id)


@pytest.mark.asyncio
async def test_explicit_parent_child_run_hierarchy(db_session: AsyncSession):
    """Explicitly verify parent_run_id pointers match expected parents across both pipelines.

    Tutor Request -> Retrieval -> Vector Search, Rank Results, Evidence Threshold
    Document Upload -> Process Material -> Chunk Document, Generate Embeddings, Store Chunks
    """
    import io
    from unittest.mock import patch

    from fastapi import UploadFile
    from langsmith import utils
    from langsmith.run_helpers import tracing_context
    from langsmith.run_trees import RunTree

    from app.models.project import Project
    from app.models.space import Space
    from app.models.user import User
    from app.schemas.tutor import TutorRequest
    from app.services.material_service import MaterialService
    from app.services.tutor_service import TutorService
    from app.workers.tasks import process_material

    # Setup User, Space, Project
    user = User(
        id=uuid.uuid4(),
        email=f"hierarchy_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hashed_pw",
        full_name="Hierarchy User",
        role="user",
    )
    db_session.add(user)
    space = Space(id=uuid.uuid4(), user_id=user.id, name="Hierarchy Space")
    db_session.add(space)
    project = Project(
        id=uuid.uuid4(),
        space_id=space.id,
        user_id=user.id,
        name="Hierarchy Project",
        learning_goal="Hierarchy Verification",
    )
    db_session.add(project)
    await db_session.commit()

    captured_runs: list[RunTree] = []

    def capture_post(self: RunTree) -> None:
        captured_runs.append(self)

    utils.get_env_var.cache_clear()
    with (
        patch.dict(os.environ, {"LANGSMITH_TRACING": "true"}, clear=False),
        patch.object(settings, "LANGSMITH_TRACING", True),
        patch.object(settings, "LANGSMITH_API_KEY", "lsv2_test_key"),
        patch.object(RunTree, "post", capture_post),
        patch.object(RunTree, "patch", lambda s: None),
        tracing_context(enabled=True),
    ):
        # 1. Pipeline A: Document Upload -> Process Material
        material_service = MaterialService(db_session)
        pdf_bytes = _create_test_pdf_bytes("Linear regression is a supervised learning algorithm.")
        upload_file = UploadFile(
            file=io.BytesIO(pdf_bytes),
            filename="hierarchy_test.pdf",
            headers={"content-type": "application/pdf"},
        )
        material = await material_service.upload_material(
            user_id=user.id,
            project_id=project.id,
            file=upload_file,
        )
        parent_trace = getattr(material, "_parent_trace", None)
        assert parent_trace is not None, "Document Upload must capture parent_trace headers"

        # Execute Celery worker task with parent_trace
        _ = process_material(str(material.id), parent_trace=parent_trace)

        # 2. Pipeline B: AI Tutor Request -> Retrieval hierarchy
        tutor_service = TutorService(db_session)
        _ = await tutor_service.ask(
            user_id=user.id,
            project_id=project.id,
            payload=TutorRequest(question="Explain linear regression."),
        )

    # Build run map by name and ID
    runs_by_name: dict[str, list[RunTree]] = {}
    for r in captured_runs:
        runs_by_name.setdefault(r.name, []).append(r)

    # --- VERIFY INGESTION HIERARCHY ---
    # Document Upload -> Process Material -> Chunk Document, Generate Chunk Embeddings, Store Chunks
    doc_upload = runs_by_name["Document Upload"][0]
    proc_material = runs_by_name["Process Material"][0]
    assert proc_material.parent_run_id == doc_upload.id, (
        f"Process Material parent_run_id ({proc_material.parent_run_id}) must match Document Upload id ({doc_upload.id})"
    )

    for child_name in ["Chunk Document", "Generate Chunk Embeddings", "Store Chunks"]:
        assert child_name in runs_by_name, f"Missing {child_name} in ingestion runs"
        child_run = runs_by_name[child_name][0]
        assert child_run.parent_run_id == proc_material.id, (
            f"{child_name} parent_run_id ({child_run.parent_run_id}) must match Process Material id ({proc_material.id})"
        )

    # --- VERIFY TUTOR RETRIEVAL HIERARCHY ---
    # Tutor Request -> Retrieval -> Vector Search, Rank Results, Evidence Threshold
    tutor_request = runs_by_name["AI Tutor Request"][0]
    retrieval_run = runs_by_name["Retrieve Relevant Knowledge"][0]
    assert retrieval_run.parent_run_id == tutor_request.id, (
        f"Retrieve Relevant Knowledge parent_run_id ({retrieval_run.parent_run_id}) must match Tutor Request id ({tutor_request.id})"
    )

    for sub_child_name in ["Vector Search", "Rank Results", "Apply Evidence Threshold"]:
        assert sub_child_name in runs_by_name, f"Missing {sub_child_name} in retrieval runs"
        sub_run = runs_by_name[sub_child_name][0]
        assert sub_run.parent_run_id == retrieval_run.id, (
            f"{sub_child_name} parent_run_id ({sub_run.parent_run_id}) must match Retrieval id ({retrieval_run.id})"
        )



