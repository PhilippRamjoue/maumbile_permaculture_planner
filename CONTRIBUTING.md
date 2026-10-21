# Contributing

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the design and
[`docs/WORK_PACKAGES.md`](docs/WORK_PACKAGES.md) for the task breakdown. This file covers
how the code is organized and how to run things.

## Backend module shape (enforced)

Every backend module lives in `backend/app/modules/<name>/` with:

```
router.py      # FastAPI APIRouter — HTTP layer only
schemas.py     # Pydantic request/response models
models.py      # SQLAlchemy ORM models (if the module owns tables)
service.py     # business logic — no FastAPI imports, unit-testable
repository.py  # data access — the only place that touches the DB session
tests/
```

**Dependency rule:** `router → service → repository → db`. Services never import routers.
Modules depend on each other only through service interfaces — never by reaching into another
module's repository or models.

## Definition of done

A change merges only when: lint + type-check + tests pass locally and in CI. New logic ships
with tests (unit for services/geo; PostGIS integration for repositories).

## Backend — dev commands

```bash
cd backend
uv sync                       # create .venv and install deps (incl. dev)
uv run uvicorn app.main:app --reload   # http://localhost:8000  (/healthz, /docs)
uv run ruff check .           # lint
uv run ruff format .          # format
uv run mypy app               # type-check
uv run pytest                 # all tests (integration tests need Docker running)
uv run pytest -m "not integration"     # unit tests only (no Docker)
uv run alembic upgrade head   # apply migrations
```

## Frontend — dev commands

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173
npm run lint
npm run typecheck
npm test
npm run build
```

## Whole stack

```bash
cd infra
cp .env.example .env
docker compose up --build     # frontend http://localhost:8080 · backend http://localhost:8000
```
