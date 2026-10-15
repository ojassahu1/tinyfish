import difflib
import hashlib
import re
from datetime import timezone
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from urllib.parse import urlsplit

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Competitor, DetectedChange, EvidenceItem, FeatureObservation, MonitoredPage, MonitoringJob, PageSnapshot, PositioningObservation, PricingRecord, utc_now
from .tinyfish import FetchResult, TinyFishClient, TinyFishError


def normalize_text(value: str) -> str:
    lines = (" ".join(line.split()) for line in value.splitlines())
    return "\n".join(line for line in lines if line)


def content_hash(value: str) -> str:
    return hashlib.sha256(normalize_text(value).encode("utf-8")).hexdigest()


def _first_changed_lines(previous: str, current: str) -> tuple[str | None, str | None]:
    old_lines = normalize_text(previous).splitlines()
    new_lines = normalize_text(current).splitlines()
    diff = list(difflib.ndiff(old_lines, new_lines))
    removed = next((line[2:] for line in diff if line.startswith("- ")), None)
    added = next((line[2:] for line in diff if line.startswith("+ ")), None)
    return removed, added


def _dedupe_key(page_id: str, before_hash: str, after_hash: str, salt: str = "") -> str:
    raw = f"{page_id}:{before_hash}:{after_hash}:{salt}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


ANNOUNCEMENT_PATTERN = re.compile(r"\b(?:introducing|announcing|now available|new (?:feature|capability|product|release)|launched|released)\b", re.IGNORECASE)


def _first_markdown_heading(text: str) -> str | None:
    return next((line[2:].strip() for line in text.splitlines() if line.startswith("# ") and line[2:].strip()), None)


def _added_lines(previous: str | None, current: str) -> list[str]:
    if previous is None:
        return current.splitlines()
    return [line[2:] for line in difflib.ndiff(normalize_text(previous).splitlines(), normalize_text(current).splitlines()) if line.startswith("+ ")]


@dataclass(frozen=True)
class PriceObservation:
    plan_name: str
    plan_key: str
    displayed_price: str
    amount: Decimal
    currency_symbol: str
    billing_period: str
    price_unit: str | None
    evidence_excerpt: str


PRICE_PATTERN = re.compile(r"(?P<symbol>[$€£¥])\s*(?P<amount>\d[\d,]*(?:\.\d{1,2})?)")
PLAN_HEADING_IGNORES = {"pricing", "plans", "plan", "prices", "pricing plans", "our plans", "choose a plan"}


def extract_price_observations(text: str) -> list[PriceObservation]:
    observations = []
    current_plan: str | None = None
    for line in text.splitlines():
        clean_line = line.strip()
        heading = re.sub(r"^#{1,6}\s*", "", clean_line).strip(" *_")
        if heading != clean_line:
            current_plan = None if heading.lower() in PLAN_HEADING_IGNORES else heading

        match = PRICE_PATTERN.search(clean_line)
        if not match:
            continue
        inline_plan = clean_line[:match.start()].strip(" *#:-")
        plan_name = inline_plan or current_plan
        if not plan_name or plan_name.lower() in PLAN_HEADING_IGNORES:
            continue

        lowered = clean_line.lower()
        monthly = bool(re.search(r"\bmonthly\b|\bper\s+month\b|/\s*(?:month|mo)\b", lowered))
        annual = bool(re.search(r"\bannually\b|\bannual\b|\byearly\b|\bper\s+year\b|/\s*(?:year|yr)\b", lowered))
        if monthly and annual:
            continue
        period = "monthly" if monthly else "annual" if annual else "unspecified"
        unit_match = re.search(r"(?:per\s+|/\s*)(seat|user|member|workspace|account)\b", lowered)
        price_unit = unit_match.group(1) if unit_match else None
        try:
            amount = Decimal(match.group("amount").replace(",", ""))
        except InvalidOperation:
            continue
        plan_key = " ".join(plan_name.casefold().split())
        observations.append(PriceObservation(
            plan_name=plan_name,
            plan_key=plan_key[:160],
            displayed_price=match.group(0).strip(),
            amount=amount,
            currency_symbol=match.group("symbol"),
            billing_period=period,
            price_unit=price_unit,
            evidence_excerpt=clean_line,
        ))
    return observations


def persist_successful_fetch(
    db: Session,
    job: MonitoringJob,
    page: MonitoredPage,
    workspace_id: str,
    fetched: FetchResult,
) -> PageSnapshot | None:
    if fetched.not_modified:
        job.status = "completed"
        job.finished_at = utc_now()
        db.commit()
        return None

    normalized = normalize_text(fetched.text)
    if not normalized:
        raise TinyFishError("tinyfish_incomplete_extraction", retryable=True)

    previous = db.scalar(
        select(PageSnapshot)
        .where(PageSnapshot.page_id == page.id)
        .order_by(PageSnapshot.version.desc())
        .limit(1)
    )
    current_hash = content_hash(normalized)
    version = (previous.version + 1) if previous else 1
    snapshot = PageSnapshot(
        page_id=page.id,
        job_id=job.id,
        version=version,
        source_url=fetched.final_url,
        title=fetched.title,
        content_text=normalized,
        content_hash=current_hash,
        extraction_metadata=fetched.metadata,
    )
    db.add(snapshot)
    db.flush()

    price_changed = False
    for observation in extract_price_observations(normalized):
        previous_price = db.scalar(
            select(PricingRecord)
            .join(PageSnapshot, PageSnapshot.id == PricingRecord.snapshot_id)
            .where(
                PricingRecord.page_id == page.id,
                PricingRecord.plan_key == observation.plan_key,
                PricingRecord.currency_symbol == observation.currency_symbol,
                PricingRecord.billing_period == observation.billing_period,
                PricingRecord.price_unit == observation.price_unit,
                PageSnapshot.version < version,
            )
            .order_by(PageSnapshot.version.desc())
            .limit(1)
        )
        record = PricingRecord(
            workspace_id=workspace_id,
            page_id=page.id,
            snapshot_id=snapshot.id,
            plan_key=observation.plan_key,
            plan_name=observation.plan_name,
            displayed_price=observation.displayed_price,
            amount=observation.amount,
            currency_symbol=observation.currency_symbol,
            billing_period=observation.billing_period,
            price_unit=observation.price_unit,
            evidence_excerpt=observation.evidence_excerpt,
        )
        db.add(record)
        if previous_price and previous_price.amount != observation.amount:
            direction = "increased" if observation.amount > previous_price.amount else "decreased"
            percent = None
            if previous_price.amount != 0:
                percent = float((observation.amount - previous_price.amount) / previous_price.amount * 100)
            change = DetectedChange(
                workspace_id=workspace_id,
                page_id=page.id,
                previous_snapshot_id=previous_price.snapshot_id,
                current_snapshot_id=snapshot.id,
                category=f"pricing_{direction[:-1]}",
                headline=f"{observation.plan_name} price {direction}",
                old_value=f"{previous_price.displayed_price} {previous_price.billing_period}",
                new_value=f"{observation.displayed_price} {observation.billing_period}",
                confidence=1.0,
                percentage_change=percent,
                verification_status="observed",
                dedupe_key=_dedupe_key(page.id, previous_price.displayed_price, observation.displayed_price, observation.plan_key),
            )
            db.add(change)
            db.flush()
            db.add(EvidenceItem(
                change_id=change.id,
                snapshot_id=snapshot.id,
                source_url=fetched.final_url,
                excerpt=f"{previous_price.evidence_excerpt}\n{observation.evidence_excerpt}",
            ))
            price_changed = True

    specific_change_created = price_changed
    is_homepage = page.page_type in {"custom", "product"} and urlsplit(page.url).path in {"", "/"}
    headline = _first_markdown_heading(normalized) if is_homepage else None
    if headline:
        db.add(PositioningObservation(
            workspace_id=workspace_id,
            page_id=page.id,
            snapshot_id=snapshot.id,
            headline=headline,
            source_url=fetched.final_url,
        ))
        previous_headline = _first_markdown_heading(previous.content_text) if previous else None
        if previous and previous_headline and previous_headline != headline:
            change = DetectedChange(
                workspace_id=workspace_id,
                page_id=page.id,
                previous_snapshot_id=previous.id,
                current_snapshot_id=snapshot.id,
                category="positioning_change",
                headline="Homepage headline changed",
                old_value=previous_headline,
                new_value=headline,
                confidence=1.0,
                verification_status="observed",
                dedupe_key=_dedupe_key(page.id, previous.content_hash, current_hash, "positioning"),
            )
            db.add(change)
            db.flush()
            db.add(EvidenceItem(change_id=change.id, snapshot_id=snapshot.id, source_url=fetched.final_url, excerpt=f"{previous_headline}\n{headline}"))
            specific_change_created = True

    for line in _added_lines(previous.content_text if previous else None, normalized):
        if not ANNOUNCEMENT_PATTERN.search(line):
            continue
        claim = line.strip()[:2000]
        feature_key = hashlib.sha256(" ".join(claim.casefold().split()).encode("utf-8")).hexdigest()
        existing = db.scalar(select(FeatureObservation.id).where(
            FeatureObservation.page_id == page.id,
            FeatureObservation.feature_key == feature_key,
        ))
        if existing:
            continue
        db.add(FeatureObservation(
            workspace_id=workspace_id,
            page_id=page.id,
            snapshot_id=snapshot.id,
            feature_key=feature_key,
            claim=claim,
            classification="announcement_observed",
        ))
        change = DetectedChange(
            workspace_id=workspace_id,
            page_id=page.id,
            previous_snapshot_id=previous.id if previous else None,
            current_snapshot_id=snapshot.id,
            category="feature_announcement",
            headline="Public announcement wording observed",
            new_value=claim,
            confidence=1.0,
            verification_status="announcement_observed",
            dedupe_key=_dedupe_key(page.id, previous.content_hash if previous else "first", feature_key, "announcement"),
        )
        db.add(change)
        db.flush()
        db.add(EvidenceItem(change_id=change.id, snapshot_id=snapshot.id, source_url=fetched.final_url, excerpt=claim))
        specific_change_created = True

    if previous and previous.content_hash != current_hash and not specific_change_created:
        old_value, new_value = _first_changed_lines(previous.content_text, normalized)
        change = DetectedChange(
            workspace_id=workspace_id,
            page_id=page.id,
            previous_snapshot_id=previous.id,
            current_snapshot_id=snapshot.id,
            category="content_change",
            headline="Public page content updated",
            old_value=old_value,
            new_value=new_value,
            confidence=1.0,
            verification_status="observed",
            dedupe_key=_dedupe_key(page.id, previous.content_hash, current_hash),
        )
        db.add(change)
        db.flush()
        evidence_excerpt = "\n".join(value for value in (old_value, new_value) if value)
        db.add(EvidenceItem(
            change_id=change.id,
            snapshot_id=snapshot.id,
            source_url=fetched.final_url,
            excerpt=evidence_excerpt,
        ))

    job.status = "completed"
    job.finished_at = utc_now()
    db.commit()
    db.refresh(snapshot)
    return snapshot


async def execute_scan(db: Session, job_id: str, client: TinyFishClient | None = None) -> PageSnapshot | None:
    job = db.get(MonitoringJob, job_id)
    if job is None:
        return None
    page = db.get(MonitoredPage, job.page_id)
    competitor = db.get(Competitor, page.competitor_id) if page else None
    if page is None or competitor is None:
        job.status = "failed"
        job.error_code = "page_not_found"
        db.commit()
        return None

    job.status = "running"
    job.attempts += 1
    db.commit()
    provider = client or TinyFishClient()
    try:
        fetched = await provider.fetch(page.url)
        return persist_successful_fetch(db, job, page, competitor.workspace_id, fetched)
    except TinyFishError as error:
        job.status = "retrying" if error.retryable else "failed"
        job.error_code = error.code
        if not error.retryable:
            job.finished_at = utc_now()
        db.commit()
        raise
