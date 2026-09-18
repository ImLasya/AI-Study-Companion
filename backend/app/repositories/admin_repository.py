"""Admin Repository (Phase 6).

Dedicated cross-tenant administrative query interface for platform analytics,
user journey auditing, activity logs, AI telemetry, job health, and evaluation runs.
Guarantees strict separation from tenant-scoped repositories and protects sensitive data.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import case, distinct, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_usage import AIUsageLog
from app.models.concept import Concept
from app.models.conversation import TutorConversation, TutorMessage
from app.models.evaluation import AIEvaluationRun
from app.models.event import ActivityEvent
from app.models.flashcard import Flashcard
from app.models.mastery import ConceptMastery
from app.models.material import Material
from app.models.project import Project
from app.models.quiz import QuizAttempt
from app.models.space import Space
from app.models.user import User
from app.schemas.admin import (
    AdminActivityFeedResponse,
    AdminActivityItem,
    AdminAIUsageItem,
    AdminAIUsageResponse,
    AdminJobFailureItem,
    AdminJobHealthResponse,
    AdminOverviewResponse,
    AdminUserDetailResponse,
    AdminUserListResponse,
    AdminUserProjectSummary,
    AdminUserRecentActivity,
    AdminUserRecentQuiz,
    AdminUserSummary,
    AIEvaluationCaseItem,
    AIEvaluationSuiteSummary,
    AIEvaluationSummaryResponse,
)
from app.schemas.analytics import AIActivitySummary


class AdminRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ------------------------------------------------------------------------
    # 1. Platform Overview
    # ------------------------------------------------------------------------
    async def get_overview(self) -> AdminOverviewResponse:
        """Fetch cross-platform high-level metrics."""
        tot_users = (await self.session.execute(select(func.count(User.id)))).scalar() or 0
        tot_spaces = (await self.session.execute(select(func.count(Space.id)))).scalar() or 0
        tot_projects = (await self.session.execute(select(func.count(Project.id)))).scalar() or 0
        tot_materials = (await self.session.execute(select(func.count(Material.id)))).scalar() or 0
        tot_quiz_attempts = (await self.session.execute(select(func.count(QuizAttempt.id)))).scalar() or 0
        tot_flashcards = (await self.session.execute(select(func.count(Flashcard.id)))).scalar() or 0
        tot_tutor_sessions = (await self.session.execute(select(func.count(TutorConversation.id)))).scalar() or 0

        # Average Quiz Score
        avg_score_res = (await self.session.execute(select(func.coalesce(func.avg(QuizAttempt.score), 0.0)))).scalar() or 0.0

        # Active users in past 24h & 7d
        now = datetime.now(UTC)
        past_24h = now - timedelta(hours=24)
        past_7d = now - timedelta(days=7)

        active_24h = (
            await self.session.execute(
                select(func.count(distinct(ActivityEvent.user_id))).where(
                    ActivityEvent.created_at >= past_24h
                )
            )
        ).scalar() or 0

        active_7d = (
            await self.session.execute(
                select(func.count(distinct(ActivityEvent.user_id))).where(
                    ActivityEvent.created_at >= past_7d
                )
            )
        ).scalar() or 0

        # AI Spend and Calls
        ai_res = (
            await self.session.execute(
                select(
                    func.count(AIUsageLog.id),
                    func.coalesce(func.sum(AIUsageLog.estimated_cost_usd), 0.0),
                )
            )
        ).fetchone()
        tot_ai_calls = ai_res[0] if ai_res else 0
        tot_ai_spend = float(ai_res[1]) if ai_res else 0.0

        # Job Health Summary
        job_res = await self.session.execute(
            select(Material.status, func.count(Material.id)).group_by(Material.status)
        )
        job_health: dict[str, int] = {row[0]: row[1] for row in job_res.fetchall()}

        # Concept Mastery Distribution (supports both 0.0-1.0 and 0.0-100.0 score scales)
        mastered_cnt = (
            await self.session.execute(
                select(func.count(ConceptMastery.id)).where(
                    or_(
                        ConceptMastery.mastery_score >= 70.0,
                        ConceptMastery.mastery_score.between(0.70, 1.0),
                    )
                )
            )
        ).scalar() or 0
        learning_cnt = (
            await self.session.execute(
                select(func.count(ConceptMastery.id)).where(
                    or_(
                        ConceptMastery.mastery_score.between(40.0, 69.99),
                        ConceptMastery.mastery_score.between(0.40, 0.6999),
                    )
                )
            )
        ).scalar() or 0
        practice_cnt = (
            await self.session.execute(
                select(func.count(ConceptMastery.id)).where(
                    or_(
                        ConceptMastery.mastery_score < 40.0,
                        ConceptMastery.mastery_score < 0.40,
                    )
                )
            )
        ).scalar() or 0
        concept_dist = {
            "novice": practice_cnt,
            "learning": learning_cnt,
            "mastered": mastered_cnt,
            "Mastered (>=70%)": mastered_cnt,
            "Learning (40-69%)": learning_cnt,
            "Needs Practice (<40%)": practice_cnt,
        }

        # Activity Distribution
        act_rows = (await self.session.execute(
            select(ActivityEvent.event_type, func.count(ActivityEvent.id))
            .group_by(ActivityEvent.event_type)
            .order_by(func.count(ActivityEvent.id).desc())
            .limit(20)
        )).fetchall()
        raw_act_map = {row[0]: row[1] for row in act_rows}

        quiz_activity_cnt = (
            raw_act_map.get("quiz_completed", 0) + raw_act_map.get("quiz_started", 0)
        ) or tot_quiz_attempts

        tutor_activity_cnt = (
            raw_act_map.get("tutor_message_sent", 0)
            or (await self.session.execute(select(func.count(TutorMessage.id)))).scalar()
            or tot_tutor_sessions
        )

        materials_activity_cnt = raw_act_map.get("material_uploaded", 0) or tot_materials

        concepts_assessed_cnt = (
            raw_act_map.get("concept_extracted", 0)
            or (mastered_cnt + learning_cnt)
            or (tot_projects * 2)
        )

        activity_dist = {
            "quiz_attempts": quiz_activity_cnt,
            "tutor_sessions": tutor_activity_cnt,
            "materials": materials_activity_cnt,
            "concepts": concepts_assessed_cnt,
            **raw_act_map,
        }

        return AdminOverviewResponse(
            total_users=tot_users,
            total_spaces=tot_spaces,
            total_projects=tot_projects,
            total_materials=tot_materials,
            total_quiz_attempts=tot_quiz_attempts,
            total_tutor_sessions=tot_tutor_sessions,
            total_flashcards=tot_flashcards,
            average_quiz_score=round(float(avg_score_res), 1),
            active_users_daily=active_24h,
            active_users_weekly=active_7d,
            total_ai_spend_usd=round(tot_ai_spend, 4),
            total_ai_calls=tot_ai_calls,
            job_health_summary=job_health,
            concept_mastery_distribution=concept_dist,
            activity_distribution=activity_dist,
        )

    # ------------------------------------------------------------------------
    # 2. Paginated User Directory
    # ------------------------------------------------------------------------
    async def list_users(
        self, page: int = 1, page_size: int = 20, search: str | None = None
    ) -> AdminUserListResponse:
        """List platform users with learning stats and safe fields (never exposes passwords)."""
        offset = max(0, (page - 1) * page_size)

        base_filter = []
        if search:
            search_pattern = f"%{search.strip().lower()}%"
            base_filter.append(
                (func.lower(User.email).like(search_pattern))
                | (func.lower(func.coalesce(User.full_name, "")).like(search_pattern))
            )

        # Count total
        count_stmt = select(func.count(User.id))
        if base_filter:
            count_stmt = count_stmt.where(*base_filter)
        total = (await self.session.execute(count_stmt)).scalar() or 0

        # Query user items
        stmt = (
            select(
                User.id,
                User.email,
                User.full_name,
                User.role,
                User.created_at,
                func.count(distinct(Project.id)).label("project_count"),
                func.max(ActivityEvent.created_at).label("last_activity"),
            )
            .outerjoin(Project, User.id == Project.user_id)
            .outerjoin(ActivityEvent, User.id == ActivityEvent.user_id)
            .group_by(User.id, User.email, User.full_name, User.role, User.created_at)
            .order_by(User.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        if base_filter:
            stmt = stmt.where(*base_filter)

        rows = (await self.session.execute(stmt)).fetchall()
        items = [
            AdminUserSummary(
                id=r.id,
                email=r.email,
                full_name=r.full_name,
                role=r.role,
                created_at=r.created_at,
                project_count=r.project_count,
                last_activity_at=r.last_activity,
            )
            for r in rows
        ]

        return AdminUserListResponse(items=items, total=total, page=page, page_size=page_size)

    # ------------------------------------------------------------------------
    # 3. User Journey Drill-in
    # ------------------------------------------------------------------------
    async def get_user_journey(self, user_id: uuid.UUID) -> AdminUserDetailResponse | None:
        """Inspect a single user's learning path, spaces, projects, quiz progress, and AI telemetry."""
        # 1. User base
        u_res = await self.session.execute(
            select(
                User.id,
                User.email,
                User.full_name,
                User.role,
                User.created_at,
                func.count(distinct(Project.id)).label("project_count"),
                func.max(ActivityEvent.created_at).label("last_activity"),
            )
            .outerjoin(Project, User.id == Project.user_id)
            .outerjoin(ActivityEvent, User.id == ActivityEvent.user_id)
            .where(User.id == user_id)
            .group_by(User.id, User.email, User.full_name, User.role, User.created_at)
        )
        u_row = u_res.fetchone()
        if not u_row:
            return None

        user_summary = AdminUserSummary(
            id=u_row.id,
            email=u_row.email,
            full_name=u_row.full_name,
            role=u_row.role,
            created_at=u_row.created_at,
            project_count=u_row.project_count,
            last_activity_at=u_row.last_activity,
        )

        spaces_count = (
            await self.session.execute(select(func.count(Space.id)).where(Space.user_id == user_id))
        ).scalar() or 0

        # 2. Projects
        p_stmt = (
            select(
                Project.id,
                Project.name,
                Space.name.label("space_name"),
                Project.created_at,
                func.count(distinct(Concept.id)).label("concept_count"),
                func.avg(ConceptMastery.mastery_score).label("avg_mastery"),
            )
            .join(Space, Project.space_id == Space.id)
            .outerjoin(Concept, Project.id == Concept.project_id)
            .outerjoin(
                ConceptMastery,
                (Concept.id == ConceptMastery.concept_id) & (ConceptMastery.user_id == user_id),
            )
            .where(Project.user_id == user_id)
            .group_by(Project.id, Project.name, Space.name, Project.created_at)
            .order_by(Project.created_at.desc())
        )
        p_rows = (await self.session.execute(p_stmt)).fetchall()
        projects = [
            AdminUserProjectSummary(
                id=r.id,
                name=r.name,
                space_name=r.space_name,
                created_at=r.created_at,
                concept_count=r.concept_count,
                average_mastery=round(float(r.avg_mastery), 1)
                if r.avg_mastery is not None
                else None,
            )
            for r in p_rows
        ]

        # 3. Recent Activity (limit 15)
        act_stmt = (
            select(
                ActivityEvent.id,
                ActivityEvent.event_type,
                ActivityEvent.project_id,
                ActivityEvent.created_at,
            )
            .where(ActivityEvent.user_id == user_id)
            .order_by(ActivityEvent.created_at.desc())
            .limit(15)
        )
        act_rows = (await self.session.execute(act_stmt)).fetchall()
        recent_activity = [
            AdminUserRecentActivity(
                id=r.id,
                event_type=r.event_type,
                project_id=r.project_id,
                created_at=r.created_at,
            )
            for r in act_rows
        ]

        # 4. Recent Quizzes (limit 10)
        q_stmt = (
            select(
                QuizAttempt.id,
                Project.name.label("project_name"),
                QuizAttempt.score,
                QuizAttempt.completed_at,
            )
            .join(Project, QuizAttempt.project_id == Project.id)
            .where(QuizAttempt.user_id == user_id, QuizAttempt.status == "completed")
            .order_by(QuizAttempt.completed_at.desc())
            .limit(10)
        )
        q_rows = (await self.session.execute(q_stmt)).fetchall()
        recent_quizzes = [
            AdminUserRecentQuiz(
                attempt_id=r.id,
                project_name=r.project_name,
                score_percentage=round(r.score or 0.0, 1),
                passed=(r.score or 0.0) >= 70.0,
                completed_at=r.completed_at,
            )
            for r in q_rows
        ]

        # 5. AI Usage
        ai_stmt = select(
            func.count(AIUsageLog.id).label("tot_calls"),
            func.coalesce(func.sum(AIUsageLog.input_tokens), 0).label("in_tokens"),
            func.coalesce(func.sum(AIUsageLog.output_tokens), 0).label("out_tokens"),
            func.coalesce(func.sum(AIUsageLog.total_tokens), 0).label("tot_tokens"),
            func.coalesce(func.sum(AIUsageLog.estimated_cost_usd), 0.0).label("tot_cost"),
            func.coalesce(func.avg(AIUsageLog.latency_ms), 0.0).label("avg_lat"),
        ).where(AIUsageLog.user_id == user_id)
        ai_row = (await self.session.execute(ai_stmt)).fetchone()
        ai_summary = AIActivitySummary(
            total_calls=ai_row.tot_calls if ai_row else 0,
            total_input_tokens=int(ai_row.in_tokens) if ai_row else 0,
            total_output_tokens=int(ai_row.out_tokens) if ai_row else 0,
            total_tokens=int(ai_row.tot_tokens) if ai_row else 0,
            total_estimated_cost_usd=round(float(ai_row.tot_cost), 6) if ai_row else 0.0,
            avg_latency_ms=round(float(ai_row.avg_lat), 1) if ai_row else 0.0,
        )

        return AdminUserDetailResponse(
            user=user_summary,
            spaces_count=spaces_count,
            projects=projects,
            recent_activity=recent_activity,
            recent_quizzes=recent_quizzes,
            ai_usage=ai_summary,
        )

    # ------------------------------------------------------------------------
    # 4. Platform Activity Feed
    # ------------------------------------------------------------------------
    async def get_activity_feed(
        self,
        user_id: uuid.UUID | None = None,
        project_id: uuid.UUID | None = None,
        event_type: str | None = None,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> AdminActivityFeedResponse:
        """Query platform-wide activity feed with filters."""
        offset = max(0, (page - 1) * page_size)
        filters = []
        if user_id:
            filters.append(ActivityEvent.user_id == user_id)
        if project_id:
            filters.append(ActivityEvent.project_id == project_id)
        if event_type:
            filters.append(ActivityEvent.event_type == event_type)
        if from_date:
            filters.append(ActivityEvent.created_at >= from_date)
        if to_date:
            filters.append(ActivityEvent.created_at <= to_date)

        count_stmt = select(func.count(ActivityEvent.id))
        if filters:
            count_stmt = count_stmt.where(*filters)
        total = (await self.session.execute(count_stmt)).scalar() or 0

        stmt = (
            select(
                ActivityEvent.id,
                ActivityEvent.user_id,
                User.email.label("user_email"),
                ActivityEvent.project_id,
                Project.name.label("project_name"),
                ActivityEvent.event_type,
                ActivityEvent.created_at,
            )
            .join(User, ActivityEvent.user_id == User.id)
            .outerjoin(Project, ActivityEvent.project_id == Project.id)
            .order_by(ActivityEvent.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        if filters:
            stmt = stmt.where(*filters)

        rows = (await self.session.execute(stmt)).fetchall()
        items = [
            AdminActivityItem(
                id=r.id,
                user_id=r.user_id,
                user_email=r.user_email,
                project_id=r.project_id,
                project_name=r.project_name,
                event_type=r.event_type,
                created_at=r.created_at,
            )
            for r in rows
        ]

        return AdminActivityFeedResponse(items=items, total=total, page=page, page_size=page_size)

    # ------------------------------------------------------------------------
    # 5. AI Observability & Telemetry
    # ------------------------------------------------------------------------
    async def get_ai_usage_telemetry(
        self,
        operation: str | None = None,
        model: str | None = None,
        success: bool | None = None,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> AdminAIUsageResponse:
        """Compute latency percentiles (p50/p95), tokens, costs, failure rates and return log records."""
        offset = max(0, (page - 1) * page_size)
        filters = []
        if operation:
            filters.append(AIUsageLog.operation == operation)
        if model:
            filters.append(AIUsageLog.model == model)
        if success is not None:
            filters.append(AIUsageLog.success == success)
        if from_date:
            filters.append(AIUsageLog.created_at >= from_date)
        if to_date:
            filters.append(AIUsageLog.created_at <= to_date)

        # Percentiles and totals via SQL
        agg_stmt = select(
            func.count(AIUsageLog.id).label("total_calls"),
            func.count(case((AIUsageLog.success.is_(False), 1))).label("failed_calls"),
            func.coalesce(func.sum(AIUsageLog.input_tokens), 0).label("in_tokens"),
            func.coalesce(func.sum(AIUsageLog.output_tokens), 0).label("out_tokens"),
            func.coalesce(func.sum(AIUsageLog.total_tokens), 0).label("tot_tokens"),
            func.coalesce(func.sum(AIUsageLog.estimated_cost_usd), 0.0).label("tot_cost"),
            func.coalesce(
                func.percentile_cont(0.50).within_group(AIUsageLog.latency_ms), 0.0
            ).label("p50"),
            func.coalesce(
                func.percentile_cont(0.95).within_group(AIUsageLog.latency_ms), 0.0
            ).label("p95"),
        )
        if filters:
            agg_stmt = agg_stmt.where(*filters)

        agg_row = (await self.session.execute(agg_stmt)).fetchone()
        tot_calls = agg_row.total_calls if agg_row else 0
        failed_calls = agg_row.failed_calls if agg_row else 0
        fail_rate = round((failed_calls / tot_calls) * 100.0, 2) if tot_calls > 0 else 0.0

        # Query recent paginated log items
        log_stmt = (
            select(
                AIUsageLog.id,
                AIUsageLog.user_id,
                AIUsageLog.project_id,
                AIUsageLog.operation,
                AIUsageLog.provider,
                AIUsageLog.model,
                AIUsageLog.latency_ms,
                AIUsageLog.total_tokens,
                AIUsageLog.estimated_cost_usd,
                AIUsageLog.success,
                AIUsageLog.error,
                AIUsageLog.created_at,
            )
            .order_by(AIUsageLog.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        if filters:
            log_stmt = log_stmt.where(*filters)

        log_rows = (await self.session.execute(log_stmt)).fetchall()
        recent_logs = [
            AdminAIUsageItem(
                id=r.id,
                user_id=r.user_id,
                project_id=r.project_id,
                operation=r.operation,
                provider=r.provider,
                model=r.model,
                latency_ms=round(r.latency_ms, 1),
                total_tokens=r.total_tokens,
                estimated_cost_usd=round(r.estimated_cost_usd, 6)
                if r.estimated_cost_usd is not None
                else None,
                success=r.success,
                error=r.error,
                created_at=r.created_at,
            )
            for r in log_rows
        ]

        return AdminAIUsageResponse(
            p50_latency_ms=round(float(agg_row.p50), 1) if agg_row else 0.0,
            p95_latency_ms=round(float(agg_row.p95), 1) if agg_row else 0.0,
            total_calls=tot_calls,
            failed_calls=failed_calls,
            failure_rate=fail_rate,
            total_input_tokens=int(agg_row.in_tokens) if agg_row else 0,
            total_output_tokens=int(agg_row.out_tokens) if agg_row else 0,
            total_tokens=int(agg_row.tot_tokens) if agg_row else 0,
            total_cost_usd=round(float(agg_row.tot_cost), 6) if agg_row else 0.0,
            recent_logs=recent_logs,
            total_records=tot_calls,
            page=page,
            page_size=page_size,
        )

    # ------------------------------------------------------------------------
    # 6. Background Job Health
    # ------------------------------------------------------------------------
    async def get_job_health(self, limit: int = 20) -> AdminJobHealthResponse:
        """Inspect materials ingestion queue status and recent failures."""
        cnt_res = await self.session.execute(
            select(Material.status, func.count(Material.id)).group_by(Material.status)
        )
        status_counts = {r[0]: r[1] for r in cnt_res.fetchall()}
        total_materials = sum(status_counts.values())

        fail_stmt = (
            select(
                Material.id,
                Material.project_id,
                Project.name.label("project_name"),
                Material.filename,
                Material.status,
                Material.failure_reason,
                Material.created_at,
                Material.updated_at,
            )
            .join(Project, Material.project_id == Project.id)
            .where((Material.status == "failed") | (Material.failure_reason.is_not(None)))
            .order_by(Material.updated_at.desc())
            .limit(limit)
        )
        fail_rows = (await self.session.execute(fail_stmt)).fetchall()
        recent_failures = [
            AdminJobFailureItem(
                material_id=r.id,
                project_id=r.project_id,
                project_name=r.project_name,
                filename=r.filename,
                status=r.status,
                failure_reason=r.failure_reason,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
            for r in fail_rows
        ]

        return AdminJobHealthResponse(
            status_counts=status_counts,
            total_materials=total_materials,
            recent_failures=recent_failures,
        )

    # ------------------------------------------------------------------------
    # 7. AI Evaluation Runs
    # ------------------------------------------------------------------------
    async def get_latest_evaluations(self) -> AIEvaluationSummaryResponse:
        """Fetch latest evaluation run metrics and case breakdown."""
        # Find latest run_id
        latest_run_id_stmt = (
            select(AIEvaluationRun.run_id, AIEvaluationRun.run_at)
            .order_by(AIEvaluationRun.run_at.desc())
            .limit(1)
        )
        latest_run = (await self.session.execute(latest_run_id_stmt)).fetchone()
        if not latest_run:
            return AIEvaluationSummaryResponse()

        run_id = latest_run.run_id
        run_at = latest_run.run_at

        # Fetch cases for this run
        stmt_cases = (
            select(AIEvaluationRun)
            .where(AIEvaluationRun.run_id == run_id)
            .order_by(AIEvaluationRun.suite.asc(), AIEvaluationRun.case_id.asc())
        )
        case_rows = (await self.session.execute(stmt_cases)).scalars().all()

        total = len(case_rows)
        passed = sum(1 for c in case_rows if c.passed)
        overall_rate = round((passed / total) * 100.0, 1) if total > 0 else 0.0

        suite_map: dict[str, dict[str, int]] = {}
        cases = []
        for c in case_rows:
            if c.suite not in suite_map:
                suite_map[c.suite] = {"total": 0, "passed": 0}
            suite_map[c.suite]["total"] += 1
            if c.passed:
                suite_map[c.suite]["passed"] += 1

            cases.append(
                AIEvaluationCaseItem(
                    id=c.id,
                    run_id=c.run_id,
                    suite=c.suite,
                    case_id=c.case_id,
                    passed=c.passed,
                    score=c.score,
                    notes=c.notes,
                    run_at=c.run_at,
                )
            )

        suite_summaries = [
            AIEvaluationSuiteSummary(
                suite=s,
                total=v["total"],
                passed=v["passed"],
                pass_rate=round((v["passed"] / v["total"]) * 100.0, 1) if v["total"] > 0 else 0.0,
            )
            for s, v in suite_map.items()
        ]

        return AIEvaluationSummaryResponse(
            latest_run_id=run_id,
            latest_run_at=run_at,
            overall_pass_rate=overall_rate,
            total_cases=total,
            passed_cases=passed,
            suite_summaries=suite_summaries,
            cases=cases,
        )

    async def record_evaluation_cases(self, cases: list[dict[str, Any]]) -> None:
        """Batch persist evaluation cases."""
        for c in cases:
            entry = AIEvaluationRun(
                run_id=c["run_id"],
                run_at=c["run_at"],
                suite=c["suite"],
                case_id=c["case_id"],
                passed=c["passed"],
                score=c.get("score"),
                notes=c.get("notes"),
            )
            self.session.add(entry)
        await self.session.commit()
