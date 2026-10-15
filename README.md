# CompetitorIQ

CompetitorIQ is an evidence-first competitive intelligence workspace. The current implementation includes workspace-scoped account and competitor APIs, public URL validation, TinyFish Fetch/Search adapters, immutable page snapshots, exact text-change evidence, and a responsive product preview.

Dashboard figures are explicitly illustrative. Live TinyFish and LLM analysis are not enabled until credentials are configured.

## Requirements

- Node.js 20.9 or newer and npm
- Python 3.11
- Docker Desktop with Compose for PostgreSQL, Redis, API, worker, and web services
- A TinyFish API key for real Search/Fetch/Agent requests
- An OpenAI API key only when AI summaries are enabled in a later phase

## Configure

Copy `.env.example` to `.env`, generate a unique `APP_SECRET_KEY`, and set `TINYFISH_API_KEY` when available. Keep `.env` out of source control.

TinyFish uses the documented `X-API-Key` header. Fetch targets `https://api.fetch.tinyfish.ai`; Search targets `https://api.search.tinyfish.ai`. The Agent run endpoint is documented at `https://agent.tinyfish.ai/v1/automation/run` but is not wired into this release. No provider result is simulated when credentials are missing.

## Run with Docker Compose

```powershell
docker compose up --build
```

The API is available at `http://localhost:8000`, OpenAPI at `http://localhost:8000/docs`, and the web app at `http://localhost:3000`. Compose applies Alembic migrations before starting the API. Postgres and Redis data use named volumes.

Open the workspace at `http://localhost:3000/app`. In production, set `COOKIE_SECURE=true` so session cookies are sent only over HTTPS.

## Run API and tests locally

```powershell
python -m pip install -r api/requirements.txt
Set-Location api
python -m alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

In another terminal, run the worker with Redis available:

```powershell
Set-Location api
celery -A app.celery_app.celery_app worker --loglevel=INFO
```

Run the backend tests:

```powershell
Set-Location api
python -m pytest tests -q
```

## Current capability and limits

- Authentication uses Argon2 password hashes and signed HttpOnly, SameSite cookies for the browser. Bearer tokens remain accepted for API clients. New accounts receive a workspace; membership is checked server-side for competitor, page, job, snapshot, change, evidence, and research access.
- Monitored targets must use HTTPS and resolve only to public IP addresses. TinyFish final URLs are checked again before persistence. The provider performs the actual remote fetch; provider-side DNS/redirect behavior cannot be proven from this environment.
- Failed or incomplete fetches are stored as job errors and do not create snapshots or removal findings.
- Price history stores original displayed values, currency symbols, billing periods, and units. Percentage changes are calculated only when the comparator finds matching plan/currency/period/unit records.
- Launch radar records explicit announcement phrases as `announcement_observed`; first observation is not treated as a launch date. Homepage H1 changes are stored as exact positioning observations.
- Research uses TinyFish Search and Fetch in a background job. Optional OpenAI Responses analysis is strict-schema validated, treats page excerpts as untrusted, and drops observations citing URLs outside fetched evidence. Source gathering can run without an LLM; the report then says analysis is not configured.
- The workspace exposes competitor/page management, pricing history, announcement wording, change/evidence views, and research. Feature comparison matrix, threat scoring, saved/dismissed recommendations, discovery approval, scheduled briefs, exports, and email delivery are not implemented yet. No email is sent.
- Docker is not installed in the current development environment, and no TinyFish, OpenAI, Postgres, or Redis credentials/services were present during implementation. Compose and live provider calls therefore remain unverified here.
