from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "ai_study_companion",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    # Sensible defaults for async task retries and durability
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)
