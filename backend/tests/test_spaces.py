"""Regression and isolation tests for Learning Spaces.

Verifies:
1. Newly created space with no projects has 0 concepts, 0 projects, average_mastery is None.
2. Space with a project but no concepts has 1 project, 0 concepts, average_mastery is None.
3. Space with concepts but no quiz assessment has N concepts, assessed_concepts=0, average_mastery is None.
4. Space with assessed concepts computes average_mastery solely from those assessed concepts.
5. Independent spaces do not leak, inherit, or aggregate data across space boundaries.
6. Multi-tenant isolation prevents cross-user visibility or contamination.
7. Creating a new space returns an unassessed initial state (None, not 0 or hardcoded values).
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.concept import Concept
from app.models.mastery import ConceptMastery
from app.models.project import Project
from app.models.space import Space
from app.models.user import User


@pytest.fixture
async def test_user(db_session: AsyncSession) -> User:
    uid = uuid.uuid4()
    user = User(
        id=uid,
        email=f"space_test_{uid.hex[:8]}@example.com",
        hashed_password=hash_password("SecretPass123!"),
        full_name="Space Tester",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def other_user(db_session: AsyncSession) -> User:
    uid = uuid.uuid4()
    user = User(
        id=uid,
        email=f"space_other_{uid.hex[:8]}@example.com",
        hashed_password=hash_password("SecretPass123!"),
        full_name="Other Space Tester",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


def auth_header_for(user: User) -> dict[str, str]:
    token = create_access_token(subject=str(user.id))
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_new_space_empty_stats(client: AsyncClient, test_user: User):
    """Test Case 1: Create a completely new Space with no projects -> mastery is None, counts are 0."""
    headers = auth_header_for(test_user)
    create_res = await client.post(
        "/api/v1/spaces",
        json={"name": "Brand New Space", "description": "No projects yet"},
        headers=headers,
    )
    assert create_res.status_code == 201
    created = create_res.json()
    assert created["name"] == "Brand New Space"
    assert created["projects_count"] == 0
    assert created["concepts_count"] == 0
    assert created["assessed_concepts_count"] == 0
    assert created["average_mastery"] is None

    # Verify GET by ID
    get_res = await client.get(f"/api/v1/spaces/{created['id']}", headers=headers)
    assert get_res.status_code == 200
    detail = get_res.json()
    assert detail["projects_count"] == 0
    assert detail["concepts_count"] == 0
    assert detail["assessed_concepts_count"] == 0
    assert detail["average_mastery"] is None


@pytest.mark.asyncio
async def test_space_with_project_no_concepts(
    client: AsyncClient, test_user: User, db_session: AsyncSession
):
    """Test Case 2: Create a project inside that Space but do not extract any concepts -> mastery remains None."""
    headers = auth_header_for(test_user)
    space = Space(id=uuid.uuid4(), user_id=test_user.id, name="Project Space")
    db_session.add(space)
    await db_session.flush()

    project = Project(
        id=uuid.uuid4(),
        user_id=test_user.id,
        space_id=space.id,
        name="Empty Project",
        learning_goal="Learn foundational ideas",
    )
    db_session.add(project)
    await db_session.commit()

    get_res = await client.get(f"/api/v1/spaces/{space.id}", headers=headers)
    assert get_res.status_code == 200
    data = get_res.json()
    assert data["projects_count"] == 1
    assert data["concepts_count"] == 0
    assert data["assessed_concepts_count"] == 0
    assert data["average_mastery"] is None


@pytest.mark.asyncio
async def test_space_with_unassessed_concepts(
    client: AsyncClient, test_user: User, db_session: AsyncSession
):
    """Test Case 3: Process material and generate concepts but do not assess them -> mastery remains None."""
    headers = auth_header_for(test_user)
    space = Space(id=uuid.uuid4(), user_id=test_user.id, name="Unassessed Concepts Space")
    db_session.add(space)
    await db_session.flush()

    project = Project(
        id=uuid.uuid4(),
        user_id=test_user.id,
        space_id=space.id,
        name="Concept Project",
        learning_goal="Master algorithms",
    )
    db_session.add(project)
    await db_session.flush()

    # Add 3 concepts, but no assessed mastery
    c1 = Concept(
        id=uuid.uuid4(),
        user_id=test_user.id,
        project_id=project.id,
        name="Binary Trees",
        description="Tree data structure",
    )
    c2 = Concept(
        id=uuid.uuid4(),
        user_id=test_user.id,
        project_id=project.id,
        name="Graph Traversal",
        description="DFS and BFS",
    )
    c3 = Concept(
        id=uuid.uuid4(),
        user_id=test_user.id,
        project_id=project.id,
        name="Dynamic Programming",
        description="Memoization and tabulation",
    )
    db_session.add_all([c1, c2, c3])

    # Unassessed concept mastery record (score is None, evidence_count = 0)
    unassessed_m = ConceptMastery(
        id=uuid.uuid4(),
        user_id=test_user.id,
        project_id=project.id,
        concept_id=c1.id,
        mastery_score=None,
        confidence=0.0,
        evidence_count=0,
    )
    db_session.add(unassessed_m)
    await db_session.commit()

    get_res = await client.get(f"/api/v1/spaces/{space.id}", headers=headers)
    assert get_res.status_code == 200
    data = get_res.json()
    assert data["projects_count"] == 1
    assert data["concepts_count"] == 3
    assert data["assessed_concepts_count"] == 0
    assert data["average_mastery"] is None


@pytest.mark.asyncio
async def test_space_with_assessed_concepts_reflects_actual_mastery(
    client: AsyncClient, test_user: User, db_session: AsyncSession
):
    """Test Case 4: Complete a quiz that assesses concepts in Project A -> only the appropriate Space reflects mastery."""
    headers = auth_header_for(test_user)
    space = Space(id=uuid.uuid4(), user_id=test_user.id, name="Machine Learning Space")
    db_session.add(space)
    await db_session.flush()

    project = Project(
        id=uuid.uuid4(),
        user_id=test_user.id,
        space_id=space.id,
        name="Neural Networks",
        learning_goal="Master deep learning",
    )
    db_session.add(project)
    await db_session.flush()

    c1 = Concept(
        id=uuid.uuid4(),
        user_id=test_user.id,
        project_id=project.id,
        name="Backpropagation",
        description="Gradient descent algorithm",
    )
    c2 = Concept(
        id=uuid.uuid4(),
        user_id=test_user.id,
        project_id=project.id,
        name="Activation Functions",
        description="ReLU and Sigmoid",
    )
    c3 = Concept(
        id=uuid.uuid4(),
        user_id=test_user.id,
        project_id=project.id,
        name="Weight Initialization",
        description="Xavier and He initialization",
    )
    db_session.add_all([c1, c2, c3])
    await db_session.flush()

    # Assess c1 and c2 (80.0 and 90.0)
    m1 = ConceptMastery(
        id=uuid.uuid4(),
        user_id=test_user.id,
        project_id=project.id,
        concept_id=c1.id,
        mastery_score=80.0,
        confidence=0.8,
        evidence_count=2,
    )
    m2 = ConceptMastery(
        id=uuid.uuid4(),
        user_id=test_user.id,
        project_id=project.id,
        concept_id=c2.id,
        mastery_score=90.0,
        confidence=0.9,
        evidence_count=3,
    )
    db_session.add_all([m1, m2])
    await db_session.commit()

    get_res = await client.get(f"/api/v1/spaces/{space.id}", headers=headers)
    assert get_res.status_code == 200
    data = get_res.json()
    assert data["projects_count"] == 1
    assert data["concepts_count"] == 3
    assert data["assessed_concepts_count"] == 2
    # Average of 80.0 and 90.0 = 85.0
    assert data["average_mastery"] == 85.0


@pytest.mark.asyncio
async def test_multiple_spaces_mastery_isolation(
    client: AsyncClient, test_user: User, db_session: AsyncSession
):
    """Test Cases 5, 6, 8: Another Space with no assessed concepts must NOT inherit Project A's mastery.

    Verifies multiple Spaces independently.
    """
    headers = auth_header_for(test_user)

    # Space 1: Machine Learning (Assessed: 85%)
    space1 = Space(id=uuid.uuid4(), user_id=test_user.id, name="Space 1 - ML")
    db_session.add(space1)
    await db_session.flush()

    p1 = Project(
        id=uuid.uuid4(),
        user_id=test_user.id,
        space_id=space1.id,
        name="ML Basics",
        learning_goal="Learn ML",
    )
    db_session.add(p1)
    await db_session.flush()

    c1 = Concept(
        id=uuid.uuid4(),
        user_id=test_user.id,
        project_id=p1.id,
        name="Linear Regression",
        description="Line fitting",
    )
    db_session.add(c1)
    await db_session.flush()

    m1 = ConceptMastery(
        id=uuid.uuid4(),
        user_id=test_user.id,
        project_id=p1.id,
        concept_id=c1.id,
        mastery_score=85.0,
        confidence=0.85,
        evidence_count=2,
    )
    db_session.add(m1)

    # Space 2: General Knowledge (1 project with unassessed concepts)
    space2 = Space(id=uuid.uuid4(), user_id=test_user.id, name="Space 2 - General Knowledge")
    db_session.add(space2)
    await db_session.flush()

    p2 = Project(
        id=uuid.uuid4(),
        user_id=test_user.id,
        space_id=space2.id,
        name="World History",
        learning_goal="Learn history",
    )
    db_session.add(p2)
    await db_session.flush()

    c2 = Concept(
        id=uuid.uuid4(),
        user_id=test_user.id,
        project_id=p2.id,
        name="Ancient Rome",
        description="Roman empire",
    )
    db_session.add(c2)

    # Space 3: Deep Learning (Completely new, 0 projects)
    space3 = Space(id=uuid.uuid4(), user_id=test_user.id, name="Space 3 - Deep Learning")
    db_session.add(space3)
    await db_session.commit()

    # Query all spaces
    list_res = await client.get("/api/v1/spaces", headers=headers)
    assert list_res.status_code == 200
    spaces_map = {s["id"]: s for s in list_res.json()}

    # Check Space 1
    s1_data = spaces_map[str(space1.id)]
    assert s1_data["projects_count"] == 1
    assert s1_data["concepts_count"] == 1
    assert s1_data["assessed_concepts_count"] == 1
    assert s1_data["average_mastery"] == 85.0

    # Check Space 2 (Must NOT inherit Space 1's 85% mastery)
    s2_data = spaces_map[str(space2.id)]
    assert s2_data["projects_count"] == 1
    assert s2_data["concepts_count"] == 1
    assert s2_data["assessed_concepts_count"] == 0
    assert s2_data["average_mastery"] is None

    # Check Space 3 (Must be completely empty, NOT inherit 27% or 85%)
    s3_data = spaces_map[str(space3.id)]
    assert s3_data["projects_count"] == 0
    assert s3_data["concepts_count"] == 0
    assert s3_data["assessed_concepts_count"] == 0
    assert s3_data["average_mastery"] is None


@pytest.mark.asyncio
async def test_cross_tenant_space_isolation(
    client: AsyncClient, test_user: User, other_user: User, db_session: AsyncSession
):
    """Verify that User B cannot view, modify, or inherit User A's space progress."""
    headers_other = auth_header_for(other_user)

    # User A creates a space with mastery
    space = Space(id=uuid.uuid4(), user_id=test_user.id, name="User A Secret Space")
    db_session.add(space)
    await db_session.flush()

    p = Project(
        id=uuid.uuid4(),
        user_id=test_user.id,
        space_id=space.id,
        name="User A Secret Project",
        learning_goal="Secrets",
    )
    db_session.add(p)
    await db_session.flush()

    c = Concept(
        id=uuid.uuid4(),
        user_id=test_user.id,
        project_id=p.id,
        name="Secret Concept",
        description="Private",
    )
    db_session.add(c)
    await db_session.flush()

    m = ConceptMastery(
        id=uuid.uuid4(),
        user_id=test_user.id,
        project_id=p.id,
        concept_id=c.id,
        mastery_score=95.0,
        confidence=0.95,
        evidence_count=5,
    )
    db_session.add(m)
    await db_session.commit()

    # User B list spaces -> should NOT contain User A's space
    res_list = await client.get("/api/v1/spaces", headers=headers_other)
    assert res_list.status_code == 200
    user_b_space_ids = [s["id"] for s in res_list.json()]
    assert str(space.id) not in user_b_space_ids

    # User B get space by ID -> 404
    res_get = await client.get(f"/api/v1/spaces/{space.id}", headers=headers_other)
    assert res_get.status_code == 404


@pytest.mark.asyncio
async def test_space_multiple_projects_aggregation(
    client: AsyncClient, test_user: User, db_session: AsyncSession
):
    """Verify that multiple projects in the same space have their concepts and masteries accurately aggregated."""
    headers = auth_header_for(test_user)

    space = Space(id=uuid.uuid4(), user_id=test_user.id, name="Multi Project Space")
    db_session.add(space)
    await db_session.flush()

    # Project 1 with 2 assessed concepts (70.0 and 90.0)
    p1 = Project(
        id=uuid.uuid4(),
        user_id=test_user.id,
        space_id=space.id,
        name="Project 1",
        learning_goal="Goal 1",
    )
    db_session.add(p1)
    await db_session.flush()

    c1 = Concept(id=uuid.uuid4(), user_id=test_user.id, project_id=p1.id, name="C1", description="D1")
    c2 = Concept(id=uuid.uuid4(), user_id=test_user.id, project_id=p1.id, name="C2", description="D2")
    db_session.add_all([c1, c2])
    await db_session.flush()

    m1 = ConceptMastery(
        id=uuid.uuid4(), user_id=test_user.id, project_id=p1.id, concept_id=c1.id, mastery_score=70.0, evidence_count=1
    )
    m2 = ConceptMastery(
        id=uuid.uuid4(), user_id=test_user.id, project_id=p1.id, concept_id=c2.id, mastery_score=90.0, evidence_count=1
    )
    db_session.add_all([m1, m2])

    # Project 2 with 1 assessed concept (80.0) and 1 unassessed concept
    p2 = Project(
        id=uuid.uuid4(),
        user_id=test_user.id,
        space_id=space.id,
        name="Project 2",
        learning_goal="Goal 2",
    )
    db_session.add(p2)
    await db_session.flush()

    c3 = Concept(id=uuid.uuid4(), user_id=test_user.id, project_id=p2.id, name="C3", description="D3")
    c4 = Concept(id=uuid.uuid4(), user_id=test_user.id, project_id=p2.id, name="C4", description="D4")
    db_session.add_all([c3, c4])
    await db_session.flush()

    m3 = ConceptMastery(
        id=uuid.uuid4(), user_id=test_user.id, project_id=p2.id, concept_id=c3.id, mastery_score=80.0, evidence_count=1
    )
    db_session.add(m3)
    await db_session.commit()

    # Average of assessed concepts: (70 + 90 + 80) / 3 = 80.0
    res = await client.get(f"/api/v1/spaces/{space.id}", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["projects_count"] == 2
    assert data["concepts_count"] == 4
    assert data["assessed_concepts_count"] == 3
    assert data["average_mastery"] == 80.0


@pytest.mark.asyncio
async def test_update_space_maintains_stats(
    client: AsyncClient, test_user: User, db_session: AsyncSession
):
    """Verify that updating space name/description preserves genuine project/concept/mastery stats."""
    headers = auth_header_for(test_user)

    space = Space(id=uuid.uuid4(), user_id=test_user.id, name="Original Name")
    db_session.add(space)
    await db_session.flush()

    p = Project(
        id=uuid.uuid4(),
        user_id=test_user.id,
        space_id=space.id,
        name="P1",
        learning_goal="G1",
    )
    db_session.add(p)
    await db_session.flush()

    c = Concept(id=uuid.uuid4(), user_id=test_user.id, project_id=p.id, name="C1", description="D1")
    db_session.add(c)
    await db_session.flush()

    m = ConceptMastery(
        id=uuid.uuid4(), user_id=test_user.id, project_id=p.id, concept_id=c.id, mastery_score=75.0, evidence_count=1
    )
    db_session.add(m)
    await db_session.commit()

    # PUT update space name
    res = await client.put(
        f"/api/v1/spaces/{space.id}",
        json={"name": "Renamed Space"},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Renamed Space"
    assert data["projects_count"] == 1
    assert data["concepts_count"] == 1
    assert data["assessed_concepts_count"] == 1
    assert data["average_mastery"] == 75.0
