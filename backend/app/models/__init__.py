"""SQLAlchemy Domain Models for AI Study Companion."""

from app.models.chunk import MaterialChunk
from app.models.conversation import TutorConversation, TutorMessage
from app.models.event import ActivityEvent
from app.models.material import Material
from app.models.project import Project
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
]

