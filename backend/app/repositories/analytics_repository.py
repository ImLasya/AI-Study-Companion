"""Analytics Repository (Phase 6).

Executes high-performance SQL-level aggregations (date_trunc, GROUP BY, aggregations)
over activity_events, quiz_attempts, concept_mastery, and ai_usage_logs.
Strictly tenant-scoped to preserve data isolation.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import case, distinct, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_usage import AIUsageLog
from app.models.concept import Concept
from app.models.conversation import TutorConversation, TutorMessage
from app.models.event import ActivityEvent
from app.models.mastery import ConceptMastery
from app.models.project import Project
from app.models.quiz import Quiz, QuizAttempt
from app.models.space import Space
from app.schemas.analytics import (
    AIActivitySummary,
    ConceptTrendItem,
    DailyActivityBucket,
    GlobalAnalyticsResponse,
    GlobalRecommendationItem,
    GlobalStudyActivity,
    MasteryDistribution,
    ProjectAnalyticsResponse,
    ProjectProgressItem,
    QuizPerformanceTrendItem,
    RecentActivityItem,
    TutorInteractionSummary,
    WeakAreaItem,
)
from app.services.concept_validator import is_valid_academic_concept


class AnalyticsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ------------------------------------------------------------------------
    # Project-Level Analytics
    # ------------------------------------------------------------------------
    async def get_project_analytics(
        self, user_id: uuid.UUID, project_id: uuid.UUID
    ) -> ProjectAnalyticsResponse:
        """Fetch full SQL-aggregated project analytics."""
        # 1. Learning Activity Buckets (Past 30 Days)
        since_date = datetime.now(UTC) - timedelta(days=30)
        stmt_activity = (
            select(
                func.date_trunc("day", ActivityEvent.created_at).label("bucket_day"),
                ActivityEvent.event_type,
                func.count(ActivityEvent.id).label("count"),
            )
            .where(
                ActivityEvent.project_id == project_id,
                ActivityEvent.created_at >= since_date,
            )
            .group_by(text("bucket_day"), ActivityEvent.event_type)
            .order_by(text("bucket_day ASC"))
        )
        res_act = await self.session.execute(stmt_activity)
        daily_map: dict[str, dict[str, Any]] = {}
        for row in res_act.fetchall():
            day_str = row.bucket_day.strftime("%Y-%m-%d")
            if day_str not in daily_map:
                daily_map[day_str] = {"date": day_str, "event_count": 0, "event_breakdown": {}}
            daily_map[day_str]["event_count"] += row.count
            daily_map[day_str]["event_breakdown"][row.event_type] = row.count

        activity_buckets = [
            DailyActivityBucket(
                date=v["date"],
                event_count=v["event_count"],
                event_breakdown=v["event_breakdown"],
            )
            for v in daily_map.values()
        ]

        # 2. Quiz Performance Trend
        stmt_quiz = (
            select(
                QuizAttempt.id,
                QuizAttempt.completed_at,
                QuizAttempt.score,
                QuizAttempt.total_questions,
            )
            .where(
                QuizAttempt.project_id == project_id,
                QuizAttempt.status == "completed",
            )
            .order_by(QuizAttempt.completed_at.asc())
        )
        res_quiz = await self.session.execute(stmt_quiz)
        quiz_trends = [
            QuizPerformanceTrendItem(
                attempt_id=r.id,
                completed_at=r.completed_at,
                score_percentage=round(r.score or 0.0, 1),
                passed=(r.score or 0.0) >= 70.0,
                total_questions=r.total_questions or 0,
            )
            for r in res_quiz.fetchall()
        ]

        # 3. Concept Mastery Distribution
        stmt_mastery = (
            select(
                Concept.id,
                Concept.name,
                Concept.description,
                ConceptMastery.mastery_score,
                ConceptMastery.confidence,
            )
            .outerjoin(
                ConceptMastery,
                (Concept.id == ConceptMastery.concept_id) & (ConceptMastery.user_id == user_id),
            )
            .where(Concept.project_id == project_id)
            .order_by(Concept.name.asc())
        )
        res_mastery = await self.session.execute(stmt_mastery)
        concepts = res_mastery.fetchall()

        dist = MasteryDistribution()
        total_score = 0.0
        assessed_count = 0
        concept_trends: list[ConceptTrendItem] = []

        for c in concepts:
            if not is_valid_academic_concept(c.name, c.description):
                continue
            score = c.mastery_score
            conf = c.confidence or 0.0
            if score is None:
                dist.unassessed += 1
                status = "unassessed"
            elif score < 50.0:
                dist.needs_attention += 1
                status = "needs_attention"
                total_score += score
                assessed_count += 1
            elif score < 70.0:
                dist.stable += 1
                status = "stable"
                total_score += score
                assessed_count += 1
            else:
                dist.mastered += 1
                status = "mastered"
                total_score += score
                assessed_count += 1

            concept_trends.append(
                ConceptTrendItem(
                    concept_id=c.id,
                    concept_name=c.name,
                    latest_score=round(score, 1) if score is not None else None,
                    confidence=round(conf, 2),
                    status=status,
                )
            )

        if assessed_count > 0:
            dist.overall_average = round(total_score / assessed_count, 1)

        # 4. Tutor Interaction Counts
        stmt_tutor = (
            select(
                func.count(distinct(TutorConversation.id)).label("convs"),
                func.count(TutorMessage.id).label("total_msgs"),
                func.count(case((TutorMessage.role == "assistant", 1))).label("assistant_msgs"),
            )
            .select_from(TutorConversation)
            .outerjoin(TutorMessage, TutorConversation.id == TutorMessage.conversation_id)
            .where(TutorConversation.project_id == project_id)
        )
        res_tutor = (await self.session.execute(stmt_tutor)).fetchone()
        tutor_counts = TutorInteractionSummary(
            total_conversations=res_tutor.convs if res_tutor else 0,
            total_messages=res_tutor.total_msgs if res_tutor else 0,
            assistant_messages=res_tutor.assistant_msgs if res_tutor else 0,
        )

        # 5. AI Telemetry Activity for Project
        stmt_ai = (
            select(
                func.count(AIUsageLog.id).label("total_calls"),
                func.coalesce(func.sum(AIUsageLog.input_tokens), 0).label("in_tokens"),
                func.coalesce(func.sum(AIUsageLog.output_tokens), 0).label("out_tokens"),
                func.coalesce(func.sum(AIUsageLog.total_tokens), 0).label("tot_tokens"),
                func.coalesce(func.sum(AIUsageLog.estimated_cost_usd), 0.0).label("tot_cost"),
                func.coalesce(func.avg(AIUsageLog.latency_ms), 0.0).label("avg_lat"),
                AIUsageLog.operation,
            )
            .where(AIUsageLog.project_id == project_id)
            .group_by(AIUsageLog.operation)
        )
        res_ai = await self.session.execute(stmt_ai)
        ai_summary = AIActivitySummary()
        for r in res_ai.fetchall():
            ai_summary.total_calls += r.total_calls
            ai_summary.total_input_tokens += int(r.in_tokens)
            ai_summary.total_output_tokens += int(r.out_tokens)
            ai_summary.total_tokens += int(r.tot_tokens)
            ai_summary.total_estimated_cost_usd += float(r.tot_cost)
            ai_summary.calls_by_operation[r.operation] = r.total_calls

        # Calculate weighted average latency
        if ai_summary.total_calls > 0:
            stmt_avg_lat = select(func.coalesce(func.avg(AIUsageLog.latency_ms), 0.0)).where(
                AIUsageLog.project_id == project_id
            )
            ai_summary.avg_latency_ms = round(
                float((await self.session.execute(stmt_avg_lat)).scalar() or 0.0), 1
            )
        # 7. Material Coverage Percentage and Streak / Consistency
        tot_concepts_p = dist.unassessed + dist.needs_attention + dist.stable + dist.mastered
        assessed_concepts_p = dist.needs_attention + dist.stable + dist.mastered
        coverage_pct = round((assessed_concepts_p / tot_concepts_p) * 100.0, 1) if tot_concepts_p > 0 else 0.0

        today_date = datetime.now(UTC).date()
        current_streak = 0
        check_date = today_date
        if check_date.strftime("%Y-%m-%d") not in daily_map:
            check_date = check_date - timedelta(days=1)
        while check_date.strftime("%Y-%m-%d") in daily_map:
            current_streak += 1
            check_date = check_date - timedelta(days=1)

        active_days_count = len(daily_map)
        consistency_score = min(100.0, round((active_days_count / 30.0) * 100.0 * 1.5, 1))

        return ProjectAnalyticsResponse(
            project_id=project_id,
            learning_activity=activity_buckets,
            quiz_performance_trend=quiz_trends,
            current_mastery_distribution=dist,
            concept_trends=concept_trends,
            tutor_interaction_counts=tutor_counts,
            ai_activity=ai_summary,
            material_coverage_percentage=coverage_pct,
            learning_consistency_score=consistency_score,
            current_streak_days=current_streak,
            active_days_past_30=active_days_count,
        )

    # ------------------------------------------------------------------------
    # User-Scoped Global Analytics
    # ------------------------------------------------------------------------
    async def get_global_analytics(self, user_id: uuid.UUID) -> GlobalAnalyticsResponse:
        """Fetch cross-project global analytics for a single user (tenant-isolated)."""
        # 1. Total Study Activity
        stmt_tot = select(
            func.count(ActivityEvent.id).label("tot_events"),
            func.count(distinct(func.date_trunc("day", ActivityEvent.created_at))).label(
                "active_days"
            ),
        ).where(ActivityEvent.user_id == user_id)
        r_tot = (await self.session.execute(stmt_tot)).fetchone()
        tot_events = r_tot.tot_events if r_tot else 0
        active_days = r_tot.active_days if r_tot else 0

        # Quizzes completed by user
        stmt_q = select(func.count(QuizAttempt.id)).where(
            QuizAttempt.user_id == user_id, QuizAttempt.status == "completed"
        )
        tot_quizzes = (await self.session.execute(stmt_q)).scalar() or 0

        # Total quiz attempts started by user
        stmt_q_attempts = select(func.count(QuizAttempt.id)).where(QuizAttempt.user_id == user_id)
        tot_attempts = (await self.session.execute(stmt_q_attempts)).scalar() or 0

        # Total quiz definitions available to user
        stmt_q_defs = select(func.count(Quiz.id)).where(Quiz.user_id == user_id)
        tot_defs = (await self.session.execute(stmt_q_defs)).scalar() or 0

        # Total concepts across all user projects
        stmt_concepts = (
            select(func.count(distinct(Concept.id)))
            .join(Project, Concept.project_id == Project.id)
            .where(Project.user_id == user_id)
        )
        tot_concepts = (await self.session.execute(stmt_concepts)).scalar() or 0

        # Mastered concepts across all projects (score >= 70.0)
        stmt_mastered = (
            select(func.count(distinct(Concept.id)))
            .join(Project, Concept.project_id == Project.id)
            .join(
                ConceptMastery,
                (Concept.id == ConceptMastery.concept_id) & (ConceptMastery.user_id == user_id),
            )
            .where(Project.user_id == user_id, ConceptMastery.mastery_score >= 70.0)
        )
        tot_mastered = (await self.session.execute(stmt_mastered)).scalar() or 0

        # Weak concepts across all projects (score < 60.0 and assessed)
        stmt_weak_cnt = (
            select(func.count(distinct(Concept.id)))
            .join(Project, Concept.project_id == Project.id)
            .join(
                ConceptMastery,
                (Concept.id == ConceptMastery.concept_id) & (ConceptMastery.user_id == user_id),
            )
            .where(
                Project.user_id == user_id,
                ConceptMastery.mastery_score.is_not(None),
                ConceptMastery.mastery_score < 60.0,
            )
        )
        tot_weak = (await self.session.execute(stmt_weak_cnt)).scalar() or 0

        # Tutor conversations
        stmt_tc = select(func.count(TutorConversation.id)).where(
            TutorConversation.user_id == user_id
        )
        tot_convs = (await self.session.execute(stmt_tc)).scalar() or 0

        # Global daily activity for streaks and consistency
        stmt_global_days = (
            select(func.date_trunc("day", ActivityEvent.created_at).label("d"))
            .where(ActivityEvent.user_id == user_id)
            .distinct()
            .order_by(text("d DESC"))
        )
        res_g_days = await self.session.execute(stmt_global_days)
        g_day_set = {row[0].strftime("%Y-%m-%d") for row in res_g_days.fetchall() if row[0]}
        g_check = datetime.now(UTC).date()
        if g_check.strftime("%Y-%m-%d") not in g_day_set:
            g_check = g_check - timedelta(days=1)
        g_streak = 0
        while g_check.strftime("%Y-%m-%d") in g_day_set:
            g_streak += 1
            g_check = g_check - timedelta(days=1)

        g_consistency = min(100.0, round((len(g_day_set) / 30.0) * 100.0 * 1.5, 1))

        study_act = GlobalStudyActivity(
            total_events=tot_events,
            total_quizzes_completed=tot_quizzes,
            total_quiz_attempts=tot_attempts,
            total_quiz_definitions=tot_defs,
            total_concepts=tot_concepts,
            mastered_concepts=tot_mastered,
            weak_concepts_count=tot_weak,
            total_tutor_conversations=tot_convs,
            active_study_days=active_days,
            review_streak_days=g_streak,
            consistency_score=g_consistency,
        )

        # 2. Per-project Attempt & Definition Breakdowns
        stmt_proj_attempts = (
            select(
                QuizAttempt.project_id,
                func.count(QuizAttempt.id).label("tot_attempts"),
                func.count(case((QuizAttempt.status == "completed", QuizAttempt.id))).label(
                    "comp_attempts"
                ),
            )
            .where(QuizAttempt.user_id == user_id)
            .group_by(QuizAttempt.project_id)
        )
        res_pa = await self.session.execute(stmt_proj_attempts)
        proj_attempts_map = {
            row.project_id: (row.tot_attempts, row.comp_attempts) for row in res_pa.fetchall()
        }

        stmt_proj_defs = (
            select(Quiz.project_id, func.count(Quiz.id).label("tot_defs"))
            .where(Quiz.user_id == user_id)
            .group_by(Quiz.project_id)
        )
        res_pd = await self.session.execute(stmt_proj_defs)
        proj_defs_map = {row.project_id: row.tot_defs for row in res_pd.fetchall()}

        stmt_proj_mastery = (
            select(
                Concept.project_id,
                func.count(case((ConceptMastery.mastery_score >= 70.0, Concept.id))).label("mast_cnt"),
                func.count(
                    case(
                        (
                            (ConceptMastery.mastery_score.is_not(None))
                            & (ConceptMastery.mastery_score < 60.0),
                            Concept.id,
                        )
                    )
                ).label("weak_cnt"),
            )
            .join(
                ConceptMastery,
                (Concept.id == ConceptMastery.concept_id) & (ConceptMastery.user_id == user_id),
            )
            .group_by(Concept.project_id)
        )
        res_pm = await self.session.execute(stmt_proj_mastery)
        proj_mastery_map = {
            row.project_id: (row.mast_cnt, row.weak_cnt) for row in res_pm.fetchall()
        }

        # 3. Projects by Progress
        stmt_proj = (
            select(
                Project.id,
                Project.name,
                Project.learning_goal,
                Space.name.label("space_name"),
                func.count(distinct(Concept.id)).label("tot_concepts"),
                func.count(
                    distinct(case((ConceptMastery.mastery_score.is_not(None), Concept.id)))
                ).label("assessed_concepts"),
                func.avg(ConceptMastery.mastery_score).label("avg_mastery"),
                func.max(ActivityEvent.created_at).label("last_active"),
            )
            .join(Space, Project.space_id == Space.id)
            .outerjoin(Concept, Project.id == Concept.project_id)
            .outerjoin(
                ConceptMastery,
                (Concept.id == ConceptMastery.concept_id) & (ConceptMastery.user_id == user_id),
            )
            .outerjoin(ActivityEvent, Project.id == ActivityEvent.project_id)
            .where(Project.user_id == user_id)
            .group_by(Project.id, Project.name, Project.learning_goal, Space.name)
            .order_by(text("last_active DESC NULLS LAST"))
        )
        res_proj = await self.session.execute(stmt_proj)
        project_items = []
        for r in res_proj.fetchall():
            tot_att, comp_att = proj_attempts_map.get(r.id, (0, 0))
            tot_d = proj_defs_map.get(r.id, 0)
            mast_c, weak_c = proj_mastery_map.get(r.id, (0, 0))
            project_items.append(
                ProjectProgressItem(
                    project_id=r.id,
                    project_name=r.name,
                    space_name=r.space_name,
                    learning_goal=r.learning_goal,
                    total_concepts=r.tot_concepts,
                    assessed_concepts=r.assessed_concepts,
                    mastered_concepts=mast_c,
                    weak_concepts=weak_c,
                    total_quiz_definitions=tot_d,
                    total_quiz_attempts=tot_att,
                    completed_quiz_attempts=comp_att,
                    average_mastery=round(float(r.avg_mastery), 1)
                    if r.avg_mastery is not None
                    else None,
                    last_active_at=r.last_active,
                )
            )

        # 4. Weakest Areas Across All Projects (Score < 60%)
        stmt_weak = (
            select(
                Concept.id,
                Concept.name,
                Concept.project_id,
                Project.name.label("project_name"),
                ConceptMastery.mastery_score,
                ConceptMastery.confidence,
            )
            .join(Project, Concept.project_id == Project.id)
            .join(
                ConceptMastery,
                (Concept.id == ConceptMastery.concept_id) & (ConceptMastery.user_id == user_id),
            )
            .where(
                Project.user_id == user_id,
                ConceptMastery.mastery_score.is_not(None),
                ConceptMastery.mastery_score < 60.0,
            )
            .order_by(ConceptMastery.mastery_score.asc(), ConceptMastery.confidence.desc())
            .limit(6)
        )
        res_weak = await self.session.execute(stmt_weak)
        weakest_areas = [
            WeakAreaItem(
                concept_id=r.id,
                concept_name=r.name,
                project_id=r.project_id,
                project_name=r.project_name,
                mastery_score=round(r.mastery_score, 1),
                confidence=round(r.confidence, 2),
            )
            for r in res_weak.fetchall()
            if is_valid_academic_concept(r.name)
        ]

        # 5. Overall Trend (Daily Events across all spaces/projects for past 30 days)
        since_30d = datetime.now(UTC) - timedelta(days=30)
        stmt_trend = (
            select(
                func.date_trunc("day", ActivityEvent.created_at).label("day"),
                func.count(ActivityEvent.id).label("cnt"),
            )
            .where(ActivityEvent.user_id == user_id, ActivityEvent.created_at >= since_30d)
            .group_by(text("day"))
            .order_by(text("day ASC"))
        )
        res_trend = await self.session.execute(stmt_trend)
        overall_trend = [
            DailyActivityBucket(
                date=r.day.strftime("%Y-%m-%d"),
                event_count=r.cnt,
            )
            for r in res_trend.fetchall()
        ]

        # 6. User AI Usage Summary
        stmt_user_ai = select(
            func.count(AIUsageLog.id).label("tot_calls"),
            func.coalesce(func.sum(AIUsageLog.total_tokens), 0).label("tot_tokens"),
            func.coalesce(func.sum(AIUsageLog.estimated_cost_usd), 0.0).label("tot_cost"),
            func.coalesce(func.avg(AIUsageLog.latency_ms), 0.0).label("avg_lat"),
        ).where(AIUsageLog.user_id == user_id)
        r_uai = (await self.session.execute(stmt_user_ai)).fetchone()
        user_ai_summary = AIActivitySummary(
            total_calls=r_uai.tot_calls if r_uai else 0,
            total_tokens=int(r_uai.tot_tokens) if r_uai else 0,
            total_estimated_cost_usd=round(float(r_uai.tot_cost), 6) if r_uai else 0.0,
            avg_latency_ms=round(float(r_uai.avg_lat), 1) if r_uai else 0.0,
        )

        return GlobalAnalyticsResponse(
            user_id=user_id,
            total_study_activity=study_act,
            projects_by_progress=project_items,
            weakest_areas=weakest_areas,
            overall_trend=overall_trend,
            ai_usage_summary=user_ai_summary,
        )

    # ------------------------------------------------------------------------
    # Authenticated User Recent Activity Stream
    # ------------------------------------------------------------------------
    async def get_recent_activity(
        self, user_id: uuid.UUID, limit: int = 20, project_id: uuid.UUID | None = None
    ) -> list[RecentActivityItem]:
        """Fetch recent learning activity milestones for the authenticated user."""
        milestone_types = [
            "quiz_completed",
            "quiz_started",
            "quiz_created",
            "material_uploaded",
            "tutor_turn",
            "tutor_conversation_started",
            "mastery_updated",
            "recommendation_generated",
        ]
        stmt = (
            select(
                ActivityEvent.id,
                ActivityEvent.event_type,
                ActivityEvent.payload,
                ActivityEvent.created_at,
                ActivityEvent.project_id,
                Project.name.label("project_name"),
                Project.space_id,
                Space.name.label("space_name"),
            )
            .outerjoin(Project, ActivityEvent.project_id == Project.id)
            .outerjoin(Space, Project.space_id == Space.id)
            .where(
                ActivityEvent.user_id == user_id,
                ActivityEvent.event_type.in_(milestone_types),
            )
        )
        if project_id:
            stmt = stmt.where(ActivityEvent.project_id == project_id)

        stmt = stmt.order_by(ActivityEvent.created_at.desc()).limit(limit)
        res = await self.session.execute(stmt)

        items: list[RecentActivityItem] = []
        for r in res.fetchall():
            ev_type = r.event_type
            payload = r.payload or {}

            if ev_type == "quiz_completed":
                score = payload.get("score")
                correct = payload.get("correct_answers")
                total = payload.get("total_questions")
                title = "Quiz Completed"
                if score is not None and correct is not None and total is not None:
                    detail = f"Score: {score:.0f}% ({correct}/{total} correct)"
                elif score is not None:
                    detail = f"Score: {score:.0f}%"
                else:
                    detail = "Practice evaluation completed"
            elif ev_type == "quiz_started":
                title = "Quiz Started"
                detail = "Adaptive quiz attempt initiated"
            elif ev_type == "quiz_created":
                title = "Quiz Available"
                q_title = payload.get("title", "Adaptive Quiz")
                q_count = payload.get("question_count", 5)
                detail = f"{q_title} ({q_count} questions generated)"
            elif ev_type == "material_uploaded":
                title = "Material Uploaded"
                filename = payload.get("filename", "Document")
                detail = f"Processed {filename}"
            elif ev_type in ("tutor_turn", "tutor_conversation_started"):
                title = "AI Tutor Session"
                query = payload.get("query") or payload.get("topic")
                detail = f"Discussed: {query[:60]}..." if query else "Grounded conceptual tutoring"
            elif ev_type == "mastery_updated":
                title = "Mastery Updated"
                concept = payload.get("concept_name", "Concept")
                score = payload.get("new_score")
                detail = f"{concept}: {score:.0f}%" if score is not None else f"{concept} assessed"
            elif ev_type == "recommendation_generated":
                title = "Recommendation"
                detail = payload.get("title", "Targeted study advice generated")
            else:
                title = ev_type.replace("_", " ").title()
                detail = payload.get("title") or payload.get("message")

            items.append(
                RecentActivityItem(
                    id=r.id,
                    event_type=ev_type,
                    title=title,
                    detail=detail,
                    project_id=r.project_id,
                    project_name=r.project_name,
                    space_id=r.space_id,
                    space_name=r.space_name,
                    payload=payload,
                    created_at=r.created_at,
                )
            )
        return items

    # ------------------------------------------------------------------------
    # Authenticated User Cross-Project Active Recommendations
    # ------------------------------------------------------------------------
    async def get_global_recommendations(
        self, user_id: uuid.UUID, project_id: uuid.UUID | None = None
    ) -> list[GlobalRecommendationItem]:
        """Fetch active recommendations across all user spaces and projects."""
        from app.models.mastery import Recommendation

        stmt = (
            select(
                Recommendation.id,
                Recommendation.project_id,
                Project.name.label("project_name"),
                Project.space_id,
                Space.name.label("space_name"),
                Recommendation.recommendation_type,
                Recommendation.title,
                Recommendation.body,
                Recommendation.reasoning,
                Recommendation.target_concept_id,
                Concept.name.label("target_concept_name"),
                ConceptMastery.mastery_score,
                Recommendation.created_at,
            )
            .join(Project, Recommendation.project_id == Project.id)
            .join(Space, Project.space_id == Space.id)
            .outerjoin(Concept, Recommendation.target_concept_id == Concept.id)
            .outerjoin(
                ConceptMastery,
                (Concept.id == ConceptMastery.concept_id) & (ConceptMastery.user_id == user_id),
            )
            .where(
                Recommendation.user_id == user_id,
                Recommendation.status == "active",
            )
        )
        if project_id:
            stmt = stmt.where(Recommendation.project_id == project_id)

        stmt = stmt.order_by(Recommendation.created_at.desc())
        res = await self.session.execute(stmt)

        items: list[GlobalRecommendationItem] = []
        for idx, r in enumerate(res.fetchall()):
            score = r.mastery_score
            if score is not None:
                priority = "High" if score < 50.0 else ("Medium" if score < 70.0 else "Low")
            else:
                priority = "High" if idx == 0 else "Medium"

            items.append(
                GlobalRecommendationItem(
                    id=r.id,
                    project_id=r.project_id,
                    project_name=r.project_name,
                    space_id=r.space_id,
                    space_name=r.space_name,
                    recommendation_type=r.recommendation_type,
                    title=r.title,
                    body=r.body,
                    reasoning=r.reasoning,
                    target_concept_id=r.target_concept_id,
                    target_concept_name=r.target_concept_name,
                    priority=priority,
                    current_mastery=round(score, 1) if score is not None else None,
                    created_at=r.created_at,
                )
            )
        return items
