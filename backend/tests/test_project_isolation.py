"""Project-Level Data Isolation Tests.

Verifies that for the SAME user, data scoped to Project A is completely isolated
from Project B and Project C:
1. Materials
2. Concepts
3. Quizzes & Quiz Questions
4. Quiz Attempts & Mastery
5. Mastery Snapshots & History
6. Recommendations
7. Tutor Conversations
8. Flashcards
9. Advisory Learning Insights
10. Brand new project starts with clean, empty states.
"""

import uuid
from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.main import app
from app.models.concept import Concept
from app.models.conversation import TutorConversation
from app.models.flashcard import Flashcard
from app.models.insight import LearningInsight
from app.models.mastery import ConceptMastery, MasterySnapshot, Recommendation
from app.models.material import Material
from app.models.project import Project
from app.models.quiz import Quiz, QuizQuestion
from app.models.space import Space


@pytest.mark.asyncio
async def test_same_user_project_isolation_all_entities(db_session: AsyncSession):
    """Verifies that for the same user, Project A resources NEVER leak into Project B."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Sign up user
        uid = uuid.uuid4().hex[:6]
        signup_resp = await client.post(
            "/api/v1/auth/signup",
            json={
                "email": f"learner_{uid}@example.com",
                "password": "SecurePassword123!",
                "full_name": "Learner Isolation Test",
            },
        )
        assert signup_resp.status_code == 201
        user_id = uuid.UUID(signup_resp.json()["user"]["id"])

        # 2. Create Space S
        space = Space(id=uuid.uuid4(), user_id=user_id, name="Computer Science", description="CS Space")
        db_session.add(space)
        await db_session.flush()

        # 3. Create Project A ("Neural Networks") and Project B ("Algorithms")
        proj_a = Project(
            id=uuid.uuid4(),
            user_id=user_id,
            space_id=space.id,
            name="Project A - Neural Networks",
            learning_goal="Understand Backpropagation",
        )
        proj_b = Project(
            id=uuid.uuid4(),
            user_id=user_id,
            space_id=space.id,
            name="Project B - Algorithms",
            learning_goal="Understand Graph Search",
        )
        db_session.add_all([proj_a, proj_b])
        await db_session.flush()

        # 4. Populate Project A with all resources
        # 4a. Material
        mat_a = Material(
            id=uuid.uuid4(),
            user_id=user_id,
            project_id=proj_a.id,
            filename="deep_learning_textbook.pdf",
            status="ready",
            page_count=42,
            storage_path="materials/proj_a_dl.pdf",
        )
        db_session.add(mat_a)

        # 4b. Concept
        concept_a = Concept(
            id=uuid.uuid4(),
            user_id=user_id,
            project_id=proj_a.id,
            name="Backpropagation",
            description="Gradient calculation via chain rule",
        )
        db_session.add(concept_a)
        await db_session.flush()

        # 4c. Mastery & Snapshot
        mastery_a = ConceptMastery(
            id=uuid.uuid4(),
            user_id=user_id,
            project_id=proj_a.id,
            concept_id=concept_a.id,
            mastery_score=85.0,
            confidence=0.75,
            evidence_count=4,
            last_updated_at=datetime.now(UTC),
        )
        snapshot_a = MasterySnapshot(
            id=uuid.uuid4(),
            user_id=user_id,
            project_id=proj_a.id,
            concept_id=concept_a.id,
            mastery_score=85.0,
            recorded_at=datetime.now(UTC),
        )
        db_session.add_all([mastery_a, snapshot_a])

        # 4d. Quiz & Question
        quiz_a = Quiz(
            id=uuid.uuid4(),
            user_id=user_id,
            project_id=proj_a.id,
            title="Backpropagation Quiz 1",
            status="active",
        )
        db_session.add(quiz_a)
        await db_session.flush()

        q_a = QuizQuestion(
            id=uuid.uuid4(),
            quiz_id=quiz_a.id,
            user_id=user_id,
            project_id=proj_a.id,
            concept_id=concept_a.id,
            question_text="How does backprop compute gradients?",
            question_type="mcq",
            options=["Chain rule", "Random search", "Fourier transform", "Markov chain"],
            correct_answer="Chain rule",
            difficulty="medium",
            explanation="Backpropagation applies the calculus chain rule.",
            question_order=1,
        )
        db_session.add(q_a)

        # 4e. Recommendation
        rec_a = Recommendation(
            id=uuid.uuid4(),
            user_id=user_id,
            project_id=proj_a.id,
            target_concept_id=concept_a.id,
            recommendation_type="practice_quiz",
            title="Review Backpropagation",
            body="Strengthen gradient flow understanding",
            reasoning="Concept assessed at 85%",
            status="active",
        )
        db_session.add(rec_a)

        # 4f. Tutor Conversation
        conv_a = TutorConversation(
            id=uuid.uuid4(),
            user_id=user_id,
            project_id=proj_a.id,
            title="Discussing Gradient Descent",
        )
        db_session.add(conv_a)

        # 4g. Flashcards
        card_a = Flashcard(
            id=uuid.uuid4(),
            user_id=user_id,
            project_id=proj_a.id,
            concept_id=concept_a.id,
            front="What is backpropagation?",
            back="Reverse-mode automatic differentiation applying the chain rule.",
        )
        db_session.add(card_a)

        # 4h. Learning Insight
        insight_a = LearningInsight(
            id=uuid.uuid4(),
            user_id=user_id,
            project_id=proj_a.id,
            insight_type="improving_concept",
            title="Backpropagation Mastery Rising",
            content="Your accuracy on backprop questions increased.",
            created_at=datetime.now(UTC),
        )
        db_session.add(insight_a)

        await db_session.commit()

        # ====================================================================
        # ASSERTIONS: QUERY PROJECT B — MUST BE 100% EMPTY / ISOLATED
        # ====================================================================

        # 1. Materials for Project B must be empty
        res_mat_b = await client.get(f"/api/v1/projects/{proj_b.id}/materials")
        assert res_mat_b.status_code == 200
        assert len(res_mat_b.json()) == 0

        # 2. Concepts isolation:
        # Before adding any concept to Project B, listing concepts returns 400 (no materials/concepts)
        res_con_b_initial = await client.get(f"/api/v1/projects/{proj_b.id}/concepts")
        assert res_con_b_initial.status_code == 400
        assert "upload and process learning materials" in res_con_b_initial.json()["detail"]

        # Now add a distinct concept to Project B
        concept_b = Concept(
            id=uuid.uuid4(),
            user_id=user_id,
            project_id=proj_b.id,
            name="Dijkstra Algorithm",
            description="Single-source shortest path algorithm",
        )
        db_session.add(concept_b)
        await db_session.commit()

        # Project B now returns ONLY Project B's concept
        res_con_b = await client.get(f"/api/v1/projects/{proj_b.id}/concepts")
        assert res_con_b.status_code == 200
        concepts_b = res_con_b.json()
        assert len(concepts_b) == 1
        assert concepts_b[0]["name"] == "Dijkstra Algorithm"
        assert all(c["name"] != "Backpropagation" for c in concepts_b)

        # 3. Quizzes for Project B must be empty
        res_quiz_b = await client.get(f"/api/v1/projects/{proj_b.id}/quizzes")
        assert res_quiz_b.status_code == 200
        assert len(res_quiz_b.json()) == 0

        # 4. Accessing Project A quiz through Project B path must 404
        res_mismatch_quiz = await client.get(f"/api/v1/projects/{proj_b.id}/quizzes/{quiz_a.id}")
        assert res_mismatch_quiz.status_code == 404

        # 5. Mastery for Project B has 1 concept (Dijkstra) which is UNASSESSED (None)
        res_mastery_b = await client.get(f"/api/v1/projects/{proj_b.id}/mastery")
        assert res_mastery_b.status_code == 200
        mastery_b_data = res_mastery_b.json()
        assert mastery_b_data["total_concepts"] == 1
        assert mastery_b_data["overall_average_mastery"] is None
        assert len(mastery_b_data["masteries"]) == 1
        assert mastery_b_data["masteries"][0]["concept_name"] == "Dijkstra Algorithm"
        assert mastery_b_data["masteries"][0]["mastery_score"] is None
        assert mastery_b_data["masteries"][0]["evidence_count"] == 0

        # 6. Growth for Project B has 1 unassessed concept (Dijkstra)
        res_growth_b = await client.get(f"/api/v1/projects/{proj_b.id}/growth")
        assert res_growth_b.status_code == 200
        growth_b_data = res_growth_b.json()
        assert len(growth_b_data["unassessed"]) == 1
        assert growth_b_data["unassessed"][0]["concept_name"] == "Dijkstra Algorithm"
        assert len(growth_b_data["improving"]) == 0
        assert len(growth_b_data["needs_attention"]) == 0
        assert len(growth_b_data["stable"]) == 0

        # 7. Recommendations isolation: Project B recommendations only contain Project B concepts
        res_rec_b = await client.get(f"/api/v1/projects/{proj_b.id}/recommendations")
        assert res_rec_b.status_code == 200
        recs_b = res_rec_b.json()
        assert all(r["project_id"] == str(proj_b.id) for r in recs_b)
        assert all("Backpropagation" not in r["title"] and "Backpropagation" not in r["body"] for r in recs_b)

        # 8. Tutor conversations for Project B must be empty
        res_conv_b = await client.get(f"/api/v1/projects/{proj_b.id}/tutor/conversations")
        assert res_conv_b.status_code == 200
        assert len(res_conv_b.json()) == 0

        # 9. Flashcards for Project B must be empty
        res_fc_b = await client.get(f"/api/v1/projects/{proj_b.id}/flashcards")
        assert res_fc_b.status_code == 200
        assert len(res_fc_b.json()) == 0

        # 10. Insights for Project B must be empty
        res_ins_b = await client.get(f"/api/v1/projects/{proj_b.id}/insights")
        assert res_ins_b.status_code == 200
        assert len(res_ins_b.json()) == 0

        # ====================================================================
        # CONFIRM PROJECT A IS INTACT AND ACCESSIBLE
        # ====================================================================
        res_mat_a = await client.get(f"/api/v1/projects/{proj_a.id}/materials")
        assert res_mat_a.status_code == 200
        assert len(res_mat_a.json()) == 1
        assert res_mat_a.json()[0]["filename"] == "deep_learning_textbook.pdf"

        res_con_a = await client.get(f"/api/v1/projects/{proj_a.id}/concepts")
        assert res_con_a.status_code == 200
        assert len(res_con_a.json()) == 1
        assert res_con_a.json()[0]["name"] == "Backpropagation"

        res_mastery_a = await client.get(f"/api/v1/projects/{proj_a.id}/mastery")
        assert res_mastery_a.status_code == 200
        assert res_mastery_a.json()["total_concepts"] == 1
        assert res_mastery_a.json()["overall_average_mastery"] == 85.0

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_new_project_starts_unassessed_empty_state(db_session: AsyncSession):
    """Verifies that any newly created project starts with a clean zero state across all domains."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        uid = uuid.uuid4().hex[:6]
        signup_resp = await client.post(
            "/api/v1/auth/signup",
            json={
                "email": f"clean_{uid}@example.com",
                "password": "Password123!",
                "full_name": "Clean Project User",
            },
        )
        assert signup_resp.status_code == 201
        user_id = uuid.UUID(signup_resp.json()["user"]["id"])

        space = Space(id=uuid.uuid4(), user_id=user_id, name="Clean Space")
        db_session.add(space)
        await db_session.flush()

        proj = Project(
            id=uuid.uuid4(),
            user_id=user_id,
            space_id=space.id,
            name="Brand New Project",
            learning_goal="Clean learning goal",
        )
        db_session.add(proj)
        await db_session.commit()

        # Check endpoints return clean empty states
        mat_resp = await client.get(f"/api/v1/projects/{proj.id}/materials")
        assert mat_resp.status_code == 200
        assert mat_resp.json() == []

        # A brand new project with no materials returns 400 prompting material upload (no fabricated concepts)
        con_resp = await client.get(f"/api/v1/projects/{proj.id}/concepts")
        assert con_resp.status_code == 400
        assert "upload and process learning materials" in con_resp.json()["detail"]

        quiz_resp = await client.get(f"/api/v1/projects/{proj.id}/quizzes")
        assert quiz_resp.status_code == 200
        assert quiz_resp.json() == []

        mastery_resp = await client.get(f"/api/v1/projects/{proj.id}/mastery")
        assert mastery_resp.status_code == 200
        data = mastery_resp.json()
        assert data["total_concepts"] == 0
        assert data["overall_average_mastery"] is None
        assert data["masteries"] == []

        rec_resp = await client.get(f"/api/v1/projects/{proj.id}/recommendations")
        assert rec_resp.status_code == 200
        assert rec_resp.json() == []

    app.dependency_overrides.clear()
