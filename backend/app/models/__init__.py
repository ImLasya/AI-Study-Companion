"""SQLAlchemy Domain Models for AI Study Companion."""

from app.models.ai_usage import AIUsageLog
from app.models.chunk import MaterialChunk
from app.models.concept import Concept
from app.models.conversation import TutorConversation, TutorMessage
from app.models.evaluation import AIEvaluationRun
from app.models.event import ActivityEvent
from app.models.mastery import (
    ConceptMastery,
    MasterySnapshot,
    ProcessedEvent,
    Recommendation,
)
from app.models.material import Material
from app.models.project import Project
from app.models.quiz import Quiz, QuizAnswer, QuizAttempt, QuizQuestion
from app.models.space import Space
from app.models.user import User

__all__ = [
    "User",
    "Space",
    "Project",
    "ActivityEvent",
    "Material",
    "MaterialChunk",
    "TutorConversation",
    "TutorMessage",
    "Concept",
    "Quiz",
    "QuizQuestion",
    "QuizAttempt",
    "QuizAnswer",
    "ConceptMastery",
    "MasterySnapshot",
    "Recommendation",
    "ProcessedEvent",
    "AIUsageLog",
    "AIEvaluationRun",
]
