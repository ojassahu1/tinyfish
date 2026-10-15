from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import models
from .database import get_db
from .dependencies import get_current_user, get_workspace_id
from .models import Competitor, DetectedChange, EvidenceItem, FeatureObservation, MonitoredPage, MonitoringJob, PageSnapshot, PositioningObservation, PricingRecord, ResearchSource, ResearchTask, User, Workspace, WorkspaceMember
from .schemas import (
    ChangeResponse,
    CompetitorCreate,
    CompetitorResponse,
    EvidenceResponse,
    FeatureObservationResponse,
    IntegrationStatus,
    LoginRequest,
    MonitoringJobResponse,
    MonitoredPageCreate,
    MonitoredPageResponse,
    PricingRecordResponse,
    PositioningObservationResponse,
    ResearchRequest,
    ResearchSourceResponse,
    ResearchTaskResponse,
    SnapshotResponse,
    SignupRequest,
    TokenResponse,
    UserResponse,
    WorkspaceResponse,
)
from .security import TOKEN_LIFETIME, create_access_token, hash_password, verify_password
from .settings import get_settings
from .urls import UnsafeUrl, validate_public_https_url

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


app = FastAPI(title="CompetitorIQ API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Workspace-ID"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
def readiness(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ready"}


@app.get("/api/integrations", response_model=IntegrationStatus)
def integration_status(db: Session = Depends(get_db)) -> IntegrationStatus:
    try:
        db.execute(text("SELECT 1"))
        database_state = "ready"
    except Exception:
        database_state = "unavailable"
    return IntegrationStatus(
        tinyfish="configured" if settings.tinyfish_configured else "not_configured",
        llm="configured" if settings.llm_configured else "not_configured",
        database=database_state,
        queue="not_configured" if not settings.redis_url else "configured_unverified",
    )


@app.post("/api/auth/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, response: Response, db: Session = Depends(get_db)) -> TokenResponse:
    if not settings.app_secret_key:
        raise HTTPException(status_code=503, detail={"code": "auth_not_configured"})
    email = str(payload.email).lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(status_code=409, detail={"code": "email_already_registered"})
    user = User(email=email, password_hash=hash_password(payload.password))
    workspace = Workspace(name=payload.workspace_name.strip())
    db.add_all([user, workspace])
    db.flush()
    db.add(WorkspaceMember(user_id=user.id, workspace_id=workspace.id, role="owner"))
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail={"code": "email_already_registered"}) from error
    token = create_access_token(user.id, settings.app_secret_key)
    response.set_cookie("competitoriq_session", token, httponly=True, secure=settings.cookie_secure, samesite="lax", max_age=int(TOKEN_LIFETIME.total_seconds()), path="/")
    return TokenResponse()


@app.post("/api/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)) -> TokenResponse:
    if not settings.app_secret_key:
        raise HTTPException(status_code=503, detail={"code": "auth_not_configured"})
    user = db.scalar(select(User).where(User.email == str(payload.email).lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail={"code": "invalid_credentials"})
    token = create_access_token(user.id, settings.app_secret_key)
    response.set_cookie("competitoriq_session", token, httponly=True, secure=settings.cookie_secure, samesite="lax", max_age=int(TOKEN_LIFETIME.total_seconds()), path="/")
    return TokenResponse()


@app.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> Response:
    response.delete_cookie("competitoriq_session", httponly=True, secure=settings.cookie_secure, samesite="lax", path="/")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@app.get("/api/auth/me", response_model=UserResponse)
def current_user(user: User = Depends(get_current_user)) -> User:
    return user


@app.get("/api/workspaces", response_model=list[WorkspaceResponse])
def list_workspaces(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[WorkspaceResponse]:
    rows = db.execute(
        select(Workspace, WorkspaceMember.role)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user.id)
        .order_by(Workspace.created_at)
    ).all()
    return [WorkspaceResponse(id=workspace.id, name=workspace.name, role=role) for workspace, role in rows]


@app.post("/api/competitors", response_model=CompetitorResponse, status_code=status.HTTP_201_CREATED)
def create_competitor(
    payload: CompetitorCreate,
    workspace_id: str = Depends(get_workspace_id),
    db: Session = Depends(get_db),
) -> Competitor:
    domain = payload.domain.lower().strip().rstrip(".")
    if "/" in domain or ":" in domain or "@" in domain:
        raise HTTPException(status_code=422, detail={"code": "invalid_domain"})
    competitor = Competitor(
        workspace_id=workspace_id,
        name=payload.name.strip(),
        domain=domain,
        category=payload.category,
        notes=payload.notes,
    )
    db.add(competitor)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail={"code": "competitor_domain_exists"}) from error
    db.refresh(competitor)
    return competitor


@app.get("/api/competitors", response_model=list[CompetitorResponse])
def list_competitors(
    workspace_id: str = Depends(get_workspace_id),
    db: Session = Depends(get_db),
) -> list[Competitor]:
    return list(db.scalars(select(Competitor).where(Competitor.workspace_id == workspace_id).order_by(Competitor.created_at.desc())))


@app.post("/api/competitors/{competitor_id}/pages", response_model=MonitoredPageResponse, status_code=status.HTTP_201_CREATED)
def create_page(
    competitor_id: str,
    payload: MonitoredPageCreate,
    workspace_id: str = Depends(get_workspace_id),
    db: Session = Depends(get_db),
) -> MonitoredPage:
    competitor = db.scalar(select(Competitor).where(
        Competitor.id == competitor_id,
        Competitor.workspace_id == workspace_id,
    ))
    if competitor is None:
        raise HTTPException(status_code=404, detail={"code": "competitor_not_found"})
    try:
        url = validate_public_https_url(payload.url)
    except UnsafeUrl as error:
        raise HTTPException(status_code=422, detail={"code": "unsafe_url", "message": str(error)}) from error
    page = MonitoredPage(
        competitor_id=competitor.id,
        url=url,
        page_type=payload.page_type,
        frequency_hours=payload.frequency_hours,
    )
    db.add(page)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail={"code": "page_url_exists"}) from error
    db.refresh(page)
    return page


@app.get("/api/competitors/{competitor_id}/pages", response_model=list[MonitoredPageResponse])
def list_pages(
    competitor_id: str,
    workspace_id: str = Depends(get_workspace_id),
    db: Session = Depends(get_db),
) -> list[MonitoredPage]:
    competitor_exists = db.scalar(select(Competitor.id).where(
        Competitor.id == competitor_id,
        Competitor.workspace_id == workspace_id,
    ))
    if competitor_exists is None:
        raise HTTPException(status_code=404, detail={"code": "competitor_not_found"})
    return list(db.scalars(select(MonitoredPage).where(MonitoredPage.competitor_id == competitor_id).order_by(MonitoredPage.created_at.desc())))


def _workspace_page(db: Session, page_id: str, workspace_id: str) -> MonitoredPage:
    page = db.scalar(
        select(MonitoredPage)
        .join(Competitor, Competitor.id == MonitoredPage.competitor_id)
        .where(MonitoredPage.id == page_id, Competitor.workspace_id == workspace_id)
    )
    if page is None:
        raise HTTPException(status_code=404, detail={"code": "page_not_found"})
    return page


@app.post("/api/pages/{page_id}/scan", response_model=MonitoringJobResponse, status_code=status.HTTP_202_ACCEPTED)
def request_scan(
    page_id: str,
    workspace_id: str = Depends(get_workspace_id),
    db: Session = Depends(get_db),
) -> MonitoringJob:
    page = _workspace_page(db, page_id, workspace_id)
    if not settings.tinyfish_configured:
        raise HTTPException(status_code=503, detail={"code": "tinyfish_not_configured"})
    job = MonitoringJob(workspace_id=workspace_id, page_id=page.id, status="queued")
    db.add(job)
    db.commit()
    db.refresh(job)
    try:
        from .tasks import scan_page

        scan_page.delay(job.id)
    except Exception as error:
        job.status = "failed"
        job.error_code = "queue_unavailable"
        db.commit()
        raise HTTPException(status_code=503, detail={"code": "queue_unavailable", "job_id": job.id}) from error
    return job


@app.get("/api/jobs/{job_id}", response_model=MonitoringJobResponse)
def get_job(
    job_id: str,
    workspace_id: str = Depends(get_workspace_id),
    db: Session = Depends(get_db),
) -> MonitoringJob:
    job = db.scalar(select(MonitoringJob).where(
        MonitoringJob.id == job_id,
        MonitoringJob.workspace_id == workspace_id,
    ))
    if job is None:
        raise HTTPException(status_code=404, detail={"code": "job_not_found"})
    return job


@app.get("/api/pages/{page_id}/snapshots", response_model=list[SnapshotResponse])
def list_snapshots(
    page_id: str,
    workspace_id: str = Depends(get_workspace_id),
    db: Session = Depends(get_db),
) -> list[PageSnapshot]:
    _workspace_page(db, page_id, workspace_id)
    return list(db.scalars(select(PageSnapshot).where(PageSnapshot.page_id == page_id).order_by(PageSnapshot.version.desc())))


@app.get("/api/changes", response_model=list[ChangeResponse])
def list_changes(
    category: str | None = None,
    workspace_id: str = Depends(get_workspace_id),
    db: Session = Depends(get_db),
) -> list[DetectedChange]:
    query = select(DetectedChange).where(DetectedChange.workspace_id == workspace_id)
    if category:
        query = query.where(DetectedChange.category == category)
    return list(db.scalars(query.order_by(DetectedChange.observed_at.desc()).limit(100)))


@app.get("/api/monitoring/health")
def monitoring_health(
    workspace_id: str = Depends(get_workspace_id),
    db: Session = Depends(get_db),
) -> dict:
    now = datetime.now(timezone.utc)
    stale_before = now - timedelta(hours=24)
    pages = list(db.scalars(
        select(MonitoredPage)
        .join(Competitor, Competitor.id == MonitoredPage.competitor_id)
        .where(Competitor.workspace_id == workspace_id, MonitoredPage.enabled.is_(True))
    ))
    jobs = list(db.scalars(select(MonitoringJob).where(MonitoringJob.workspace_id == workspace_id)))
    latest_success: dict[str, datetime] = {}
    for job in jobs:
        if job.status == "completed" and job.finished_at:
            finished = job.finished_at.replace(tzinfo=timezone.utc) if job.finished_at.tzinfo is None else job.finished_at.astimezone(timezone.utc)
            if job.page_id not in latest_success or latest_success[job.page_id] < finished:
                latest_success[job.page_id] = finished
    statuses = {"queued": 0, "running": 0, "retrying": 0, "failed": 0, "completed": 0}
    for job in jobs:
        if job.status in statuses:
            statuses[job.status] += 1
    stale_pages = 0
    for page in pages:
        created = page.created_at.replace(tzinfo=timezone.utc) if page.created_at.tzinfo is None else page.created_at.astimezone(timezone.utc)
        if latest_success.get(page.id, created) < stale_before:
            stale_pages += 1
    has_snapshots = db.scalar(select(PageSnapshot.id).join(MonitoredPage).join(Competitor).where(
        Competitor.workspace_id == workspace_id,
    ).limit(1)) is not None
    return {
        "checked_at": now.isoformat(),
        "pages_monitored": len(pages),
        "jobs_by_status": statuses,
        "stale_pages": stale_pages,
        "last_successful_scan": max(latest_success.values()).isoformat() if latest_success else None,
        "snapshot_coverage": "available" if has_snapshots else "no_snapshots",
        "provider": "configured" if settings.tinyfish_configured else "not_configured",
        "failure_semantics": {
            "failed": "Scan failed; no removal finding is inferred.",
            "retrying": "Retry pending; no removal finding is inferred.",
            "stale_pages": "No successful scan within 24 hours.",
        },
    }


@app.get("/api/threat-analysis")
def threat_analysis(
    period_days: int = 30,
    price_weight: float = 0.35,
    feature_weight: float = 0.35,
    positioning_weight: float = 0.2,
    other_weight: float = 0.1,
    workspace_id: str = Depends(get_workspace_id),
    db: Session = Depends(get_db),
) -> dict:
    period_days = min(max(period_days, 1), 180)
    supplied_weights = {
        "pricing": max(0, min(price_weight, 1)),
        "feature": max(0, min(feature_weight, 1)),
        "positioning": max(0, min(positioning_weight, 1)),
        "other": max(0, min(other_weight, 1)),
    }
    total_weight = sum(supplied_weights.values()) or 1
    weights = {key: value / total_weight for key, value in supplied_weights.items()}
    since = datetime.now(timezone.utc) - timedelta(days=period_days)
    competitors = list(db.scalars(select(Competitor).where(Competitor.workspace_id == workspace_id)))
    changes = list(db.scalars(
        select(DetectedChange)
        .where(
            DetectedChange.workspace_id == workspace_id,
            DetectedChange.observed_at >= since,
            DetectedChange.verification_status.in_(["observed", "announcement_observed"]),
        )
    ))
    pages = {
        page.id: page.competitor_id
        for page in db.scalars(select(MonitoredPage).join(Competitor).where(Competitor.workspace_id == workspace_id))
    }
    results = []
    for competitor in competitors:
        competitor_changes = [change for change in changes if pages.get(change.page_id) == competitor.id]
        buckets: dict[str, list[DetectedChange]] = {"pricing": [], "feature": [], "positioning": [], "other": []}
        for change in competitor_changes:
            category = change.category
            bucket = "pricing" if category.startswith("pricing_") else "feature" if category == "feature_announcement" else "positioning" if category == "positioning_change" else "other"
            buckets[bucket].append(change)
        factors = {
            key: round(min(len(items), 4) / 4 * (sum(item.confidence for item in items) / len(items) if items else 0), 3)
            for key, items in buckets.items()
        }
        score = round(100 * sum(weights[key] * factors[key] for key in weights))
        results.append({
            "competitor_id": competitor.id,
            "competitor_name": competitor.name,
            "activity_score": score,
            "metric_type": "observed_activity_not_threat_probability",
            "observation_period_days": period_days,
            "observed_change_count": len(competitor_changes),
            "factors": {key: {"signal": factors[key], "weight": round(weights[key], 3), "count": len(buckets[key])} for key in weights},
        })
    return {
        "method": "Each category signal is min(observed_count, 4) / 4 multiplied by mean evidence confidence; weighted category signals are summed and scaled to 100.",
        "weights": weights,
        "results": results,
    }


@app.get("/api/pricing", response_model=list[PricingRecordResponse])
def list_pricing(
    page_id: str | None = None,
    workspace_id: str = Depends(get_workspace_id),
    db: Session = Depends(get_db),
) -> list[PricingRecord]:
    query = select(PricingRecord).where(PricingRecord.workspace_id == workspace_id)
    if page_id:
        _workspace_page(db, page_id, workspace_id)
        query = query.where(PricingRecord.page_id == page_id)
    return list(db.scalars(query.order_by(PricingRecord.recorded_at.desc()).limit(500)))


@app.get("/api/features/announcements", response_model=list[FeatureObservationResponse])
def list_feature_announcements(
    workspace_id: str = Depends(get_workspace_id),
    db: Session = Depends(get_db),
) -> list[FeatureObservation]:
    return list(db.scalars(
        select(FeatureObservation)
        .where(FeatureObservation.workspace_id == workspace_id)
        .order_by(FeatureObservation.created_at.desc())
        .limit(200)
    ))


@app.get("/api/pages/{page_id}/positioning", response_model=list[PositioningObservationResponse])
def list_positioning_history(
    page_id: str,
    workspace_id: str = Depends(get_workspace_id),
    db: Session = Depends(get_db),
) -> list[PositioningObservation]:
    _workspace_page(db, page_id, workspace_id)
    return list(db.scalars(
        select(PositioningObservation)
        .where(PositioningObservation.page_id == page_id)
        .order_by(PositioningObservation.captured_at.desc())
    ))


@app.post("/api/research", response_model=ResearchTaskResponse, status_code=status.HTTP_202_ACCEPTED)
def request_research(
    payload: ResearchRequest,
    workspace_id: str = Depends(get_workspace_id),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResearchTask:
    if not settings.tinyfish_configured:
        raise HTTPException(status_code=503, detail={"code": "tinyfish_not_configured"})
    if payload.competitor_ids:
        valid_ids = set(db.scalars(select(Competitor.id).where(
            Competitor.workspace_id == workspace_id,
            Competitor.id.in_(payload.competitor_ids),
        )))
        if valid_ids != set(payload.competitor_ids):
            raise HTTPException(status_code=404, detail={"code": "competitor_not_found"})
    task = ResearchTask(
        workspace_id=workspace_id,
        requested_by=user.id,
        question=payload.question.strip(),
        competitor_ids=payload.competitor_ids,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    try:
        from .tasks import research_market

        research_market.delay(task.id)
    except Exception as error:
        task.status = "failed"
        task.stage = "failed"
        task.error_code = "queue_unavailable"
        db.commit()
        raise HTTPException(status_code=503, detail={"code": "queue_unavailable", "task_id": task.id}) from error
    return task


@app.get("/api/research", response_model=list[ResearchTaskResponse])
def list_research_tasks(
    workspace_id: str = Depends(get_workspace_id),
    db: Session = Depends(get_db),
) -> list[ResearchTask]:
    return list(db.scalars(
        select(ResearchTask)
        .where(ResearchTask.workspace_id == workspace_id)
        .order_by(ResearchTask.created_at.desc())
        .limit(100)
    ))


@app.get("/api/research/{task_id}", response_model=ResearchTaskResponse)
def get_research_task(
    task_id: str,
    workspace_id: str = Depends(get_workspace_id),
    db: Session = Depends(get_db),
) -> ResearchTask:
    task = db.scalar(select(ResearchTask).where(
        ResearchTask.id == task_id,
        ResearchTask.workspace_id == workspace_id,
    ))
    if task is None:
        raise HTTPException(status_code=404, detail={"code": "research_task_not_found"})
    return task


@app.get("/api/research/{task_id}/sources", response_model=list[ResearchSourceResponse])
def list_research_sources(
    task_id: str,
    workspace_id: str = Depends(get_workspace_id),
    db: Session = Depends(get_db),
) -> list[ResearchSource]:
    task_exists = db.scalar(select(ResearchTask.id).where(
        ResearchTask.id == task_id,
        ResearchTask.workspace_id == workspace_id,
    ))
    if task_exists is None:
        raise HTTPException(status_code=404, detail={"code": "research_task_not_found"})
    return list(db.scalars(select(ResearchSource).where(ResearchSource.task_id == task_id).order_by(ResearchSource.created_at)))


@app.get("/api/changes/{change_id}/evidence", response_model=list[EvidenceResponse])
def list_evidence(
    change_id: str,
    workspace_id: str = Depends(get_workspace_id),
    db: Session = Depends(get_db),
) -> list[EvidenceItem]:
    change_exists = db.scalar(select(DetectedChange.id).where(
        DetectedChange.id == change_id,
        DetectedChange.workspace_id == workspace_id,
    ))
    if change_exists is None:
        raise HTTPException(status_code=404, detail={"code": "change_not_found"})
    return list(db.scalars(select(EvidenceItem).where(EvidenceItem.change_id == change_id).order_by(EvidenceItem.created_at)))


@app.get("/api/openapi.json", include_in_schema=False)
def openapi_schema() -> dict:
    return app.openapi()