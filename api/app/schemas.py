from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    workspace_name: str = Field(min_length=2, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    authenticated: bool = True


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    created_at: datetime


class WorkspaceResponse(BaseModel):
    id: str
    name: str
    role: str


class CompetitorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    domain: str = Field(min_length=3, max_length=253)
    category: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=4000)


class CompetitorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    domain: str
    category: str | None
    notes: str | None
    created_at: datetime


class MonitoredPageCreate(BaseModel):
    url: str = Field(min_length=8, max_length=2048)
    page_type: str = Field(default="custom", pattern="^(pricing|product|features|changelog|blog|custom)$")
    frequency_hours: int = Field(default=24, ge=1, le=720)


class MonitoredPageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    competitor_id: str
    url: str
    page_type: str
    frequency_hours: int
    enabled: bool
    created_at: datetime


class IntegrationStatus(BaseModel):
    tinyfish: str
    llm: str
    database: str
    queue: str


class MonitoringJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: str
    attempts: int
    error_code: str | None
    created_at: datetime
    finished_at: datetime | None


class SnapshotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    page_id: str
    job_id: str
    version: int
    source_url: str
    title: str | None
    content_text: str
    content_hash: str
    extraction_metadata: dict
    captured_at: datetime


class ChangeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    page_id: str
    previous_snapshot_id: str | None
    current_snapshot_id: str
    category: str
    headline: str
    old_value: str | None
    new_value: str | None
    confidence: float
    verification_status: str
    observed_at: datetime


class EvidenceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    snapshot_id: str
    source_url: str
    excerpt: str
    created_at: datetime


class PricingRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    page_id: str
    snapshot_id: str
    plan_name: str
    displayed_price: str
    amount: float
    currency_symbol: str
    billing_period: str
    price_unit: str | None
    evidence_excerpt: str
    recorded_at: datetime


class FeatureObservationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    page_id: str
    snapshot_id: str
    claim: str
    classification: str
    created_at: datetime


class PositioningObservationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    page_id: str
    snapshot_id: str
    headline: str
    source_url: str
    captured_at: datetime


class ResearchRequest(BaseModel):
    question: str = Field(min_length=10, max_length=1500)
    competitor_ids: list[str] = Field(default_factory=list, max_length=20)


class ResearchTaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    question: str
    status: str
    stage: str
    sources_discovered: int
    pages_inspected: int
    verified_observations: int
    unresolved_questions: int
    analysis_status: str
    report: dict
    error_code: str | None
    created_at: datetime
    finished_at: datetime | None


class ResearchSourceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    url: str
    title: str
    snippet: str
    excerpt: str
    fetch_status: str
    created_at: datetime