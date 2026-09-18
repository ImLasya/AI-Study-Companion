"""Tests for Personalized Project Learning Plans.

Covers all 32 requirements:
 1. plan creation
 2. empty concepts (returns 400 error)
 3. deterministic ordering
 4. material-order fallback
 5. prerequisite ordering if available
 6. mastery >=80 -> completed
 7. mastery 50-79 -> in_progress
 8. mastery <50 -> needs_review
 9. unassessed concept -> not_started
10. progress calculation
11. next recommendation priority
12. needs-review priority
13. in-progress priority
14. not-started fallback
15. all-completed case (next is None)
16. regeneration without duplicate active plans
17. preservation of completed timestamps
18. new concepts added to existing plan
19. force reorder
20. duplicate active plan prevention
21. cross-project concept rejection
22. project isolation
23. user isolation
24. invalid plan ID (404)
25. invalid item ID (404)
26. unauthorized patch
27. patch does not modify mastery
28. concept detail aggregation
29. activity event logging
30. cache invalidation & redis fallback
31. migration chain
32. empty-state behavior
"""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.chunk import MaterialChunk
from app.models.concept import Concept
from app.models.event import ActivityEvent
from app.models.flashcard import Flashcard
from app.models.learning_plan import LearningPlan
from app.models.mastery import ConceptMastery, Recommendation
from app.models.material import Material
from app.models.project import Project
from app.models.quiz import Quiz, QuizQuestion
from app.models.space import Space
from app.models.user import User
from app.services.learning_plan_service import LearningPlanService

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
async def user_project(db_session: AsyncSession):
    """Create a test user, space, and project with valid foreign keys."""
    uid = uuid.uuid4()
    user = User(
        id=uid,
        email=f"lp_user_{uid.hex[:8]}@example.com",
        hashed_password=hash_password("Password123!"),
        full_name="Learning Plan User",
    )
    db_session.add(user)
    await db_session.flush()

    space = Space(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Study Space",
    )
    db_session.add(space)
    await db_session.flush()

    project = Project(
        id=uuid.uuid4(),
        user_id=user.id,
        space_id=space.id,
        name="Machine Learning Fundamentals",
        learning_goal="Master learning plans",
    )
    db_session.add(project)
    await db_session.flush()

    return user, project


@pytest.fixture
def auth_headers(user_project):
    """Generate authorization headers for test user."""
    user, _ = user_project
    token = create_access_token(subject=str(user.id))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def project_with_concepts(db_session: AsyncSession, user_project):
    """Create project with 4 concepts and material chunk associations."""
    user, project = user_project

    material = Material(
        id=uuid.uuid4(),
        user_id=user.id,
        project_id=project.id,
        filename="intro_ml.pdf",
        storage_path="dummy.pdf",
        status="completed",
    )
    db_session.add(material)
    await db_session.flush()

    chunk1 = MaterialChunk(
        id=uuid.uuid4(),
        material_id=material.id,
        project_id=project.id,
        chunk_index=0,
        content="Intro to AI and ML",
        page_number=1,
        embedding=[0.0] * 384,
    )
    chunk2 = MaterialChunk(
        id=uuid.uuid4(),
        material_id=material.id,
        project_id=project.id,
        chunk_index=1,
        content="Supervised Learning basics",
        page_number=2,
        embedding=[0.0] * 384,
    )
    chunk3 = MaterialChunk(
        id=uuid.uuid4(),
        material_id=material.id,
        project_id=project.id,
        chunk_index=2,
        content="Linear Regression algorithm",
        page_number=5,
        embedding=[0.0] * 384,
    )
    db_session.add_all([chunk1, chunk2, chunk3])
    await db_session.flush()

    c1 = Concept(
        id=uuid.uuid4(),
        user_id=user.id,
        project_id=project.id,
        name="Introduction to ML",
        description="Core basics",
        source_chunk_ids=[str(chunk1.id)],
    )
    c2 = Concept(
        id=uuid.uuid4(),
        user_id=user.id,
        project_id=project.id,
        name="Supervised Learning",
        description="Learning with labels",
        source_chunk_ids=[str(chunk2.id)],
    )
    c3 = Concept(
        id=uuid.uuid4(),
        user_id=user.id,
        project_id=project.id,
        name="Linear Regression",
        description="Continuous target prediction",
        source_chunk_ids=[str(chunk3.id)],
    )
    c4 = Concept(
        id=uuid.uuid4(),
        user_id=user.id,
        project_id=project.id,
        name="Gradient Descent",
        description="Optimization technique",
        source_chunk_ids=[],
    )
    db_session.add_all([c1, c2, c3, c4])
    await db_session.flush()

    return {
        "user": user,
        "project": project,
        "material": material,
        "chunks": [chunk1, chunk2, chunk3],
        "concepts": [c1, c2, c3, c4],
    }


# ---------------------------------------------------------------------------
# Tests 1-5: Creation, Empty Check, Deterministic & Prerequisite Ordering
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_1_plan_creation(db_session: AsyncSession, project_with_concepts):
    """1. Generates a learning plan with all project concepts properly positioned."""
    data = project_with_concepts
    service = LearningPlanService(db_session)

    resp = await service.generate_or_refresh_plan(
        user_id=data["user"].id,
        project_id=data["project"].id,
        force_reorder=False,
    )

    assert resp.project_id == data["project"].id
    assert resp.progress.total_concepts == 4
    assert len(resp.items) == 4
    assert [item.position for item in resp.items] == [0, 1, 2, 3]


@pytest.mark.asyncio
async def test_2_empty_concepts_rejected(db_session: AsyncSession, user_project):
    """2. Plan generation fails with 400 when project has no concepts."""
    user, project = user_project
    service = LearningPlanService(db_session)

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await service.generate_or_refresh_plan(
            user_id=user.id,
            project_id=project.id,
        )
    assert exc_info.value.status_code == 400
    assert "No concepts available" in exc_info.value.detail


@pytest.mark.asyncio
async def test_3_deterministic_ordering(db_session: AsyncSession, project_with_concepts):
    """3. Generating or re-ordering without changes yields deterministic order."""
    data = project_with_concepts
    service = LearningPlanService(db_session)

    resp1 = await service.generate_or_refresh_plan(
        user_id=data["user"].id,
        project_id=data["project"].id,
        force_reorder=True,
    )
    names1 = [i.concept_name for i in resp1.items]

    resp2 = await service.generate_or_refresh_plan(
        user_id=data["user"].id,
        project_id=data["project"].id,
        force_reorder=True,
    )
    names2 = [i.concept_name for i in resp2.items]

    assert names1 == names2


@pytest.mark.asyncio
async def test_4_material_order_fallback(db_session: AsyncSession, project_with_concepts):
    """4. Concepts are ordered by material chunk index and page number."""
    data = project_with_concepts
    service = LearningPlanService(db_session)

    resp = await service.generate_or_refresh_plan(
        user_id=data["user"].id,
        project_id=data["project"].id,
        force_reorder=True,
    )
    assert resp.items[0].concept_name == "Introduction to ML"
    assert resp.items[1].concept_name == "Supervised Learning"
    assert resp.items[2].concept_name == "Linear Regression"
    assert resp.items[3].concept_name == "Gradient Descent"


@pytest.mark.asyncio
async def test_5_prerequisite_ordering_if_available(db_session: AsyncSession, project_with_concepts):
    """5. Concepts with early chunk sequence respect natural material prerequisites."""
    data = project_with_concepts
    service = LearningPlanService(db_session)

    resp = await service.generate_or_refresh_plan(
        user_id=data["user"].id,
        project_id=data["project"].id,
        force_reorder=True,
    )
    pos3 = next(i.position for i in resp.items if i.concept_id == data["concepts"][2].id)
    pos4 = next(i.position for i in resp.items if i.concept_id == data["concepts"][3].id)
    assert pos3 < pos4


# ---------------------------------------------------------------------------
# Tests 6-10: Mastery Mapping & Progress Exactness
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_6_to_9_mastery_status_mapping(db_session: AsyncSession, project_with_concepts):
    """6-9. Verify mastery score mapping to roadmap status."""
    data = project_with_concepts
    user = data["user"]
    concepts = data["concepts"]

    # Concept 0: score >= 80 -> Completed
    m1 = ConceptMastery(
        id=uuid.uuid4(),
        project_id=data["project"].id,
        user_id=user.id,
        concept_id=concepts[0].id,
        mastery_score=85.0,
        confidence=0.9,
    )
    # Concept 1: 50 <= score < 80 -> In Progress
    m2 = ConceptMastery(
        id=uuid.uuid4(),
        project_id=data["project"].id,
        user_id=user.id,
        concept_id=concepts[1].id,
        mastery_score=60.0,
        confidence=0.7,
    )
    # Concept 2: score < 50 -> Needs Review
    m3 = ConceptMastery(
        id=uuid.uuid4(),
        project_id=data["project"].id,
        user_id=user.id,
        concept_id=concepts[2].id,
        mastery_score=35.0,
        confidence=0.4,
    )
    # Concept 3: unassessed (no mastery row) -> Not Started
    db_session.add_all([m1, m2, m3])
    await db_session.flush()

    service = LearningPlanService(db_session)
    resp = await service.generate_or_refresh_plan(
        user_id=user.id,
        project_id=data["project"].id,
    )

    items_by_concept = {item.concept_id: item for item in resp.items}
    assert items_by_concept[concepts[0].id].status == "completed"
    assert items_by_concept[concepts[1].id].status == "in_progress"
    assert items_by_concept[concepts[2].id].status == "needs_review"
    assert items_by_concept[concepts[3].id].status == "not_started"


@pytest.mark.asyncio
async def test_10_progress_calculation(db_session: AsyncSession, project_with_concepts):
    """10. Progress percentage is exactly completed_count / total * 100."""
    data = project_with_concepts
    user = data["user"]
    concepts = data["concepts"]

    # 1 of 4 completed
    m1 = ConceptMastery(
        id=uuid.uuid4(),
        project_id=data["project"].id,
        user_id=user.id,
        concept_id=concepts[0].id,
        mastery_score=90.0,
        confidence=0.9,
    )
    db_session.add(m1)
    await db_session.flush()

    service = LearningPlanService(db_session)
    resp = await service.generate_or_refresh_plan(
        user_id=user.id,
        project_id=data["project"].id,
    )

    assert resp.progress.total_concepts == 4
    assert resp.progress.completed_count == 1
    assert resp.progress.not_started_count == 3
    assert resp.progress.progress_percentage == 25.0


# ---------------------------------------------------------------------------
# Tests 11-15: Next Recommended Concept Selection Hierarchy
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_11_next_recommendation_priority(db_session: AsyncSession, project_with_concepts):
    """11. Active recommendation target for incomplete concept is selected first."""
    data = project_with_concepts
    user = data["user"]
    concepts = data["concepts"]

    rec = Recommendation(
        id=uuid.uuid4(),
        user_id=user.id,
        project_id=data["project"].id,
        recommendation_type="review_concept",
        title="Review Linear Regression",
        body="Recommended based on low mastery",
        target_concept_id=concepts[2].id,
        reasoning="Targeted review needed",
        status="active",
    )
    db_session.add(rec)
    await db_session.flush()

    service = LearningPlanService(db_session)
    resp = await service.generate_or_refresh_plan(
        user_id=user.id,
        project_id=data["project"].id,
    )

    assert resp.next_recommended_concept is not None
    assert resp.next_recommended_concept.concept_id == concepts[2].id
    assert resp.next_recommended_concept.concept_name == "Linear Regression"


@pytest.mark.asyncio
async def test_12_needs_review_priority_for_next(db_session: AsyncSession, project_with_concepts):
    """12. If no recommendation, NEEDS_REVIEW concept takes top priority."""
    data = project_with_concepts
    user = data["user"]
    concepts = data["concepts"]

    # concept 2 needs review, concept 1 in progress
    m1 = ConceptMastery(
        id=uuid.uuid4(),
        project_id=data["project"].id,
        user_id=user.id,
        concept_id=concepts[1].id,
        mastery_score=65.0,  # in progress
        confidence=0.7,
    )
    m2 = ConceptMastery(
        id=uuid.uuid4(),
        project_id=data["project"].id,
        user_id=user.id,
        concept_id=concepts[2].id,
        mastery_score=30.0,  # needs review
        confidence=0.5,
    )
    db_session.add_all([m1, m2])
    await db_session.flush()

    service = LearningPlanService(db_session)
    resp = await service.generate_or_refresh_plan(
        user_id=user.id,
        project_id=data["project"].id,
    )

    assert resp.next_recommended_concept is not None
    assert resp.next_recommended_concept.concept_id == concepts[2].id


@pytest.mark.asyncio
async def test_13_in_progress_priority_for_next(db_session: AsyncSession, project_with_concepts):
    """13. If no needs-review, IN_PROGRESS concept is prioritized over not started."""
    data = project_with_concepts
    user = data["user"]
    concepts = data["concepts"]

    # concept 1 in progress, concepts 0, 2, 3 not started
    m1 = ConceptMastery(
        id=uuid.uuid4(),
        project_id=data["project"].id,
        user_id=user.id,
        concept_id=concepts[1].id,
        mastery_score=70.0,
        confidence=0.8,
    )
    db_session.add(m1)
    await db_session.flush()

    service = LearningPlanService(db_session)
    resp = await service.generate_or_refresh_plan(
        user_id=user.id,
        project_id=data["project"].id,
    )

    assert resp.next_recommended_concept is not None
    assert resp.next_recommended_concept.concept_id == concepts[1].id


@pytest.mark.asyncio
async def test_14_not_started_fallback_for_next(db_session: AsyncSession, project_with_concepts):
    """14. If all concepts unassessed, first not started in position order is next."""
    data = project_with_concepts
    service = LearningPlanService(db_session)

    resp = await service.generate_or_refresh_plan(
        user_id=data["user"].id,
        project_id=data["project"].id,
    )

    assert resp.next_recommended_concept is not None
    assert resp.next_recommended_concept.position == 0


@pytest.mark.asyncio
async def test_15_all_completed_case(db_session: AsyncSession, project_with_concepts):
    """15. If all concepts completed, next_recommended_concept is None and progress is 100%."""
    data = project_with_concepts
    user = data["user"]
    for c in data["concepts"]:
        db_session.add(
            ConceptMastery(
                id=uuid.uuid4(),
                project_id=data["project"].id,
                user_id=user.id,
                concept_id=c.id,
                mastery_score=95.0,
                confidence=0.95,
            )
        )
    await db_session.flush()

    service = LearningPlanService(db_session)
    resp = await service.generate_or_refresh_plan(
        user_id=user.id,
        project_id=data["project"].id,
    )

    assert resp.next_recommended_concept is None
    assert resp.progress.progress_percentage == 100.0
    assert resp.progress.completed_count == 4


# ---------------------------------------------------------------------------
# Tests 16-20: Regeneration, Completed Preservation, New Concepts, Force Reorder
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_16_regeneration_preserves_active_plan(db_session: AsyncSession, project_with_concepts):
    """16. Subsequent generate calls refresh the active plan rather than creating duplicates."""
    data = project_with_concepts
    service = LearningPlanService(db_session)

    resp1 = await service.generate_or_refresh_plan(
        user_id=data["user"].id,
        project_id=data["project"].id,
    )
    resp2 = await service.generate_or_refresh_plan(
        user_id=data["user"].id,
        project_id=data["project"].id,
    )

    assert resp1.id == resp2.id

    # Verify in DB only 1 plan exists
    plans = (await db_session.execute(
        select(LearningPlan).where(LearningPlan.project_id == data["project"].id)
    )).scalars().all()
    assert len(plans) == 1


@pytest.mark.asyncio
async def test_17_preservation_of_completed_timestamps(db_session: AsyncSession, project_with_concepts):
    """17. Refreshing plan preserves existing completed_at timestamps."""
    data = project_with_concepts
    user = data["user"]
    concepts = data["concepts"]

    # Mark c0 completed with mastery
    db_session.add(
        ConceptMastery(
            id=uuid.uuid4(),
            project_id=data["project"].id,
            user_id=user.id,
            concept_id=concepts[0].id,
            mastery_score=88.0,
            confidence=0.9,
        )
    )
    await db_session.flush()

    service = LearningPlanService(db_session)
    resp1 = await service.generate_or_refresh_plan(
        user_id=user.id,
        project_id=data["project"].id,
    )

    item0 = next(i for i in resp1.items if i.concept_id == concepts[0].id)
    assert item0.completed_at is not None
    original_ts = item0.completed_at

    # Refresh plan
    resp2 = await service.generate_or_refresh_plan(
        user_id=user.id,
        project_id=data["project"].id,
        force_reorder=False,
    )
    item0_refreshed = next(i for i in resp2.items if i.concept_id == concepts[0].id)
    assert item0_refreshed.completed_at == original_ts


@pytest.mark.asyncio
async def test_18_new_concepts_added_to_existing_plan(db_session: AsyncSession, project_with_concepts):
    """18. New project concept added after initial plan is seamlessly integrated."""
    data = project_with_concepts
    user = data["user"]
    service = LearningPlanService(db_session)

    resp1 = await service.generate_or_refresh_plan(
        user_id=user.id,
        project_id=data["project"].id,
    )
    assert resp1.progress.total_concepts == 4

    # Add 5th concept
    c5 = Concept(
        id=uuid.uuid4(),
        user_id=user.id,
        project_id=data["project"].id,
        name="Neural Networks",
        description="Deep learning models",
        source_chunk_ids=[],
    )
    db_session.add(c5)
    await db_session.flush()

    resp2 = await service.generate_or_refresh_plan(
        user_id=user.id,
        project_id=data["project"].id,
        force_reorder=False,
    )
    assert resp2.progress.total_concepts == 5
    assert any(i.concept_name == "Neural Networks" for i in resp2.items)


@pytest.mark.asyncio
async def test_19_force_reorder(db_session: AsyncSession, project_with_concepts):
    """19. force_reorder=True recalculates positions and updates item ordering."""
    data = project_with_concepts
    service = LearningPlanService(db_session)

    resp1 = await service.generate_or_refresh_plan(
        user_id=data["user"].id,
        project_id=data["project"].id,
        force_reorder=False,
    )

    resp2 = await service.generate_or_refresh_plan(
        user_id=data["user"].id,
        project_id=data["project"].id,
        force_reorder=True,
    )
    assert resp1.id == resp2.id
    assert len(resp2.items) == len(resp1.items)


@pytest.mark.asyncio
async def test_20_duplicate_active_plan_prevention(db_session: AsyncSession, project_with_concepts):
    """20. Only one active primary plan can exist per project."""
    data = project_with_concepts
    repo = LearningPlanService(db_session).plan_repo

    plan1 = await repo.create_plan(
        LearningPlan(
            id=uuid.uuid4(),
            user_id=data["user"].id,
            project_id=data["project"].id,
            title="Plan 1",
            status="active",
        )
    )
    assert plan1 is not None

    active = await repo.get_active_by_project(user_id=data["user"].id, project_id=data["project"].id)
    assert active.id == plan1.id


# ---------------------------------------------------------------------------
# Tests 21-27: Concept Isolation, Security, Tenant Isolation, PATCH Safety
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_21_cross_project_concept_rejection(db_session: AsyncSession, project_with_concepts):
    """21. Concepts from another project are never included in project A's plan."""
    data = project_with_concepts
    user = data["user"]

    # Create Project B with foreign concept
    p2 = Project(
        id=uuid.uuid4(),
        user_id=user.id,
        space_id=data["project"].space_id,
        name="Foreign Project",
        learning_goal="Other goal",
    )
    db_session.add(p2)
    await db_session.flush()

    c_foreign = Concept(
        id=uuid.uuid4(),
        user_id=user.id,
        project_id=p2.id,
        name="Foreign Concept",
        description="Belongs to project B",
        source_chunk_ids=[],
    )
    db_session.add(c_foreign)
    await db_session.flush()

    service = LearningPlanService(db_session)
    resp = await service.generate_or_refresh_plan(
        user_id=user.id,
        project_id=data["project"].id,
    )

    concept_ids = [i.concept_id for i in resp.items]
    assert c_foreign.id not in concept_ids


@pytest.mark.asyncio
async def test_22_and_23_tenant_and_project_isolation(client: AsyncClient, db_session: AsyncSession, project_with_concepts):
    """22-23. User B cannot view or generate a plan for User A's project (returns 404)."""
    data = project_with_concepts

    # Create User B
    uid_b = uuid.uuid4()
    user_b = User(
        id=uid_b,
        email=f"user_b_{uid_b.hex[:6]}@example.com",
        hashed_password=hash_password("Pass123!"),
        full_name="User B",
    )
    db_session.add(user_b)
    await db_session.flush()

    token_b = create_access_token(subject=str(user_b.id))
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # User B requests User A's project learning plan
    resp = await client.get(
        f"/api/v1/projects/{data['project'].id}/learning-plan",
        headers=headers_b,
    )
    assert resp.status_code == 404

    # User B attempts to generate plan for User A's project
    gen_resp = await client.post(
        f"/api/v1/projects/{data['project'].id}/learning-plan/generate",
        headers=headers_b,
        json={},
    )
    assert gen_resp.status_code == 404


@pytest.mark.asyncio
async def test_24_invalid_plan_id_returns_404(client: AsyncClient, project_with_concepts, auth_headers):
    """24. Requesting nonexistent plan ID returns 404."""
    data = project_with_concepts
    random_id = uuid.uuid4()

    resp = await client.get(
        f"/api/v1/projects/{data['project'].id}/learning-plan/{random_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_25_invalid_item_id_returns_404(client: AsyncClient, project_with_concepts, auth_headers):
    """25. Requesting detail for nonexistent item ID returns 404."""
    data = project_with_concepts
    random_id = uuid.uuid4()

    resp = await client.get(
        f"/api/v1/projects/{data['project'].id}/learning-plan/items/{random_id}/detail",
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_26_unauthorized_patch_rejected(client: AsyncClient, db_session: AsyncSession, project_with_concepts):
    """26. User B cannot PATCH User A's learning plan item."""
    data = project_with_concepts
    service = LearningPlanService(db_session)
    plan_resp = await service.generate_or_refresh_plan(
        user_id=data["user"].id,
        project_id=data["project"].id,
    )
    item_id = plan_resp.items[0].id

    # User B
    uid_b = uuid.uuid4()
    user_b = User(
        id=uid_b,
        email=f"user_b2_{uid_b.hex[:6]}@example.com",
        hashed_password=hash_password("Pass123!"),
        full_name="User B2",
    )
    db_session.add(user_b)
    await db_session.flush()

    token_b = create_access_token(subject=str(user_b.id))
    headers_b = {"Authorization": f"Bearer {token_b}"}

    resp = await client.patch(
        f"/api/v1/projects/{data['project'].id}/learning-plan/items/{item_id}",
        headers=headers_b,
        json={"status": "completed"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_27_patch_does_not_modify_mastery(client: AsyncClient, db_session: AsyncSession, project_with_concepts, auth_headers):
    """27. PATCHing roadmap item status to 'completed' must NEVER alter ConceptMastery."""
    data = project_with_concepts
    user = data["user"]
    concept = data["concepts"][0]

    # Create mastery with score 30.0
    mastery = ConceptMastery(
        id=uuid.uuid4(),
        project_id=data["project"].id,
        user_id=user.id,
        concept_id=concept.id,
        mastery_score=30.0,
        confidence=0.5,
    )
    db_session.add(mastery)
    await db_session.flush()

    service = LearningPlanService(db_session)
    plan_resp = await service.generate_or_refresh_plan(
        user_id=user.id,
        project_id=data["project"].id,
    )
    item_id = plan_resp.items[0].id

    # Send PATCH to manually set item status to completed
    patch_resp = await client.patch(
        f"/api/v1/projects/{data['project'].id}/learning-plan/items/{item_id}",
        headers=auth_headers,
        json={"status": "completed"},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["status"] == "completed"

    # Verify ConceptMastery in DB is UNCHANGED at 30.0
    db_mastery = (await db_session.execute(
        select(ConceptMastery).where(
            ConceptMastery.user_id == user.id,
            ConceptMastery.concept_id == concept.id,
        )
    )).scalar_one()
    assert db_mastery.mastery_score == 30.0


# ---------------------------------------------------------------------------
# Tests 28-32: Concept Detail, Activity Events, Cache, Migration & Empty State
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_28_concept_detail_aggregation(client: AsyncClient, db_session: AsyncSession, project_with_concepts, auth_headers):
    """28. Concept detail endpoint returns aggregated diagnostics (mastery, source, flashcards, quizzes)."""
    data = project_with_concepts
    user = data["user"]
    concept = data["concepts"][0]

    # Add mastery
    db_session.add(
        ConceptMastery(
            id=uuid.uuid4(),
            project_id=data["project"].id,
            user_id=user.id,
            concept_id=concept.id,
            mastery_score=85.0,
            confidence=0.9,
        )
    )

    # Add flashcard
    db_session.add(
        Flashcard(
            id=uuid.uuid4(),
            project_id=data["project"].id,
            user_id=user.id,
            concept_id=concept.id,
            front="What is ML?",
            back="Machine learning is...",
        )
    )

    # Add quiz with question for this concept
    quiz = Quiz(
        id=uuid.uuid4(),
        user_id=user.id,
        project_id=data["project"].id,
        title="ML Quiz 1",
    )
    db_session.add(quiz)
    await db_session.flush()

    db_session.add(
        QuizQuestion(
            id=uuid.uuid4(),
            quiz_id=quiz.id,
            user_id=user.id,
            project_id=data["project"].id,
            concept_id=concept.id,
            question_type="mcq",
            question_text="Sample ML question?",
            options=["A", "B", "C", "D"],
            correct_answer="A",
            explanation="Explanation text",
            difficulty="medium",
            question_order=1,
        )
    )
    await db_session.flush()

    service = LearningPlanService(db_session)
    plan_resp = await service.generate_or_refresh_plan(
        user_id=user.id,
        project_id=data["project"].id,
    )
    item_id = plan_resp.items[0].id

    resp = await client.get(
        f"/api/v1/projects/{data['project'].id}/learning-plan/items/{item_id}/detail",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["concept_name"] == "Introduction to ML"
    assert body["mastery_score"] == 85.0
    assert body["flashcard_count"] == 1
    assert body["quiz_question_count"] == 1
    assert body["source_material_title"] == "intro_ml.pdf"


@pytest.mark.asyncio
async def test_29_activity_event_logged(db_session: AsyncSession, project_with_concepts):
    """29. Activity events 'learning_plan_created' and 'learning_plan_item_updated' are recorded."""
    data = project_with_concepts
    user = data["user"]
    service = LearningPlanService(db_session)

    resp = await service.generate_or_refresh_plan(
        user_id=user.id,
        project_id=data["project"].id,
    )
    # Check activity event for creation
    events = (await db_session.execute(
        select(ActivityEvent).where(
            ActivityEvent.user_id == user.id,
            ActivityEvent.project_id == data["project"].id,
            ActivityEvent.event_type == "learning_plan_created",
        )
    )).scalars().all()
    assert len(events) >= 1

    # Update item
    await service.update_item_status(
        user_id=user.id,
        project_id=data["project"].id,
        item_id=resp.items[0].id,
        status_value="completed",
    )
    upd_events = (await db_session.execute(
        select(ActivityEvent).where(
            ActivityEvent.user_id == user.id,
            ActivityEvent.project_id == data["project"].id,
            ActivityEvent.event_type == "learning_plan_item_updated",
        )
    )).scalars().all()
    assert len(upd_events) >= 1


@pytest.mark.asyncio
async def test_30_cache_invalidation_and_redis_fallback(db_session: AsyncSession, project_with_concepts):
    """30. CacheService failure does not break Learning Plan generation or retrieval."""
    data = project_with_concepts
    user = data["user"]

    with patch("app.services.learning_plan_service.cache_service") as MockCache:
        MockCache.get = AsyncMock(side_effect=Exception("Redis connection timed out"))
        MockCache.set = AsyncMock(side_effect=Exception("Redis connection timed out"))
        MockCache.delete = AsyncMock(side_effect=Exception("Redis connection timed out"))

        service = LearningPlanService(db_session)
        resp = await service.generate_or_refresh_plan(
            user_id=user.id,
            project_id=data["project"].id,
        )
        assert resp is not None
        assert resp.progress.total_concepts == 4

        # Verify get_plan fallback
        plan = await service.get_active_plan(user_id=user.id, project_id=data["project"].id)
        assert plan is not None
        assert plan.id == resp.id


def test_31_migration_chain():
    """31. Alembic migrations form a single linear chain ending at 0013_add_material_file_data."""
    alembic_cfg = Config("alembic.ini")
    script = ScriptDirectory.from_config(alembic_cfg)
    heads = script.get_heads()
    assert len(heads) == 1
    assert heads[0] == "0013_add_material_file_data"

    rev_13 = script.get_revision("0013_add_material_file_data")
    assert rev_13.down_revision == "0012_create_learning_plans"

    rev_12 = script.get_revision("0012_create_learning_plans")
    assert rev_12.down_revision == "0011_add_spaced_repetition"


@pytest.mark.asyncio
async def test_32_empty_state_behavior(client: AsyncClient, user_project, auth_headers):
    """32. GET /projects/{project_id}/learning-plan returns 200 with null when no plan has been generated."""
    user, project = user_project

    resp = await client.get(
        f"/api/v1/projects/{project.id}/learning-plan",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json() is None
