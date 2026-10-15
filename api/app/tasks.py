import asyncio

from .celery_app import celery_app
from .database import SessionLocal
from .models import MonitoringJob, ResearchTask, utc_now
from .monitoring import execute_scan
from .research import execute_research
from .tinyfish import TinyFishError


@celery_app.task(bind=True, max_retries=4, name="competitoriq.scan_page")
def scan_page(self, job_id: str) -> str:
    with SessionLocal() as db:
        try:
            asyncio.run(execute_scan(db, job_id))
        except TinyFishError as error:
            job = db.get(MonitoringJob, job_id)
            if job is None:
                return "missing"
            if error.retryable and self.request.retries < self.max_retries:
                raise self.retry(countdown=min(2 ** (self.request.retries + 1), 60))
            job.status = "failed"
            job.error_code = error.code
            job.finished_at = utc_now()
            db.commit()
            raise
    return "completed"


@celery_app.task(bind=True, max_retries=3, name="competitoriq.research_market")
def research_market(self, task_id: str) -> str:
    with SessionLocal() as db:
        try:
            asyncio.run(execute_research(db, task_id))
        except TinyFishError as error:
            task = db.get(ResearchTask, task_id)
            if task is None:
                return "missing"
            if error.retryable and self.request.retries < self.max_retries:
                task.status = "retrying"
                task.stage = "retrying"
                db.commit()
                raise self.retry(countdown=min(2 ** (self.request.retries + 1), 60))
            task.status = "failed"
            task.stage = "failed"
            task.error_code = error.code
            task.finished_at = utc_now()
            db.commit()
            raise
    return "completed"