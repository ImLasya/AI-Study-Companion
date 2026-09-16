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
from app.models.quiz import QuizAttempt
from app.models.space import Space
from app.schemas.analytics import (
    AIActivitySummary,
    ConceptTrendItem,
    DailyActivityBucket,
    GlobalAnalyticsResponse,
    GlobalStudyActivity,
    MasteryDistribution,
    ProjectAnalyticsResponse,
    ProjectProgressItem,
    QuizPerformanceTrendItem,
    TutorInteractionSummary,
    WeakAreaItem,
)


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
            ai_summary.total_estimated_cost_usd = round(ai_summary.total_estimated_cost_usd, 6)

        return ProjectAnalyticsResponse(
            project_id=project_id,
            learning_activity=activity_buckets,
            quiz_performance_trend=quiz_trends,
            current_mastery_distribution=dist,
            concept_trends=concept_trends,
            tutor_interaction_counts=tutor_counts,
            ai_activity=ai_summary,
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

        # Tutor conversations
        stmt_tc = select(func.count(TutorConversation.id)).where(
            TutorConversation.user_id == user_id
        )
        tot_convs = (await self.session.execute(stmt_tc)).scalar() or 0

        study_act = GlobalStudyActivity(
            total_events=tot_events,
            total_quizzes_completed=tot_quizzes,
            total_tutor_conversations=tot_convs,
            active_study_days=active_days,
        )

        # 2. Projects by Progress
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
        project_items = [
            ProjectProgressItem(
                project_id=r.id,
                project_name=r.name,
                space_name=r.space_name,
                learning_goal=r.learning_goal,
                total_concepts=r.tot_concepts,
                assessed_concepts=r.assessed_concepts,
                average_mastery=round(float(r.avg_mastery), 1)
                if r.avg_mastery is not None
                else None,
                last_active_at=r.last_active,
            )
            for r in res_proj.fetchall()
        ]

        # 3. Weakest Areas Across All Projects (Score < 50%)
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
                ConceptMastery.mastery_score < 50.0,
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
        ]

        # 4. Overall Trend (Daily Events across all spaces/projects for past 30 days)
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

        # 5. User AI Usage Summary
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
