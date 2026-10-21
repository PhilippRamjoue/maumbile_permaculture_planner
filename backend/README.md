# Backend

FastAPI modular monolith. See [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) §4 for the
module shape and [`../CONTRIBUTING.md`](../CONTRIBUTING.md) for dev commands.

```
app/
├── main.py            # FastAPI app, health probes, middleware wiring
├── api/v1/router.py   # single wiring point for module routers
├── core/              # config, db, geo utils, errors, logging, pagination
├── migrations/        # Alembic (0001 enables PostGIS)
└── modules/           # bounded contexts (added per work package)
tests/                 # unit (no DB) + integration (PostGIS via Testcontainers)
```

Quick start:

```bash
uv sync
uv run uvicorn app.main:app --reload   # http://localhost:8000/docs
uv run pytest -m "not integration"     # unit tests, no Docker needed
uv run pytest                          # + PostGIS integration tests (needs Docker)
```
