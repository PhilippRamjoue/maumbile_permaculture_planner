# Project Status & Review Guide

Snapshot for a reviewer (human or AI) doing a **consistency, bug, and requirements check**.
Pair this with [`ARCHITECTURE.md`](ARCHITECTURE.md) (intended design), [`WORK_PACKAGES.md`](WORK_PACKAGES.md)
(the plan + acceptance criteria), and [`DATA_SOURCES.md`](DATA_SOURCES.md) (rights).

_Last updated: 2026-10-21._

## What is implemented

Built and merged to `main` (each package was implemented in isolation, then integrated here):

| Pkg | Area | Summary |
|-----|------|---------|
| WP0/WP1 | backend core | FastAPI app, Pydantic settings, async SQLAlchemy 2.0 + PostGIS, Alembic, core geo utils (UTM lookup, GeoJSON↔shape, BBox), RFC-7807 errors, request-id + structlog, pagination, pytest + Testcontainers harness |
| WP2 | `modules/auth` | register / login / refresh / logout / me; JWT in **httpOnly cookies**; argon2 hashing; `current_user` dependency; `users` + `refresh_tokens` tables; login rate limiting |
| WP3 | `modules/sites` | `Site` (boundary POLYGON 4326, country_code, centroid, area_m2, bbox, utm_epsg, owner_id); `POST /sites` from coordinates with ring validation + geodesic area; CRUD; login required; owner = current_user |
| WP3B | `modules/regions` | `DataProvider` base + provider registry; `RegionProfile` seed data; generic resolver (country+bbox+category → provider chain, `*` fallback); attribution API |
| WP4 | `modules/imagery` | `ImageryProvider` + Esri (keyless, not cached) and Sentinel-2 cloudless (CC-BY, cacheable) adapters; tile proxy `GET /sites/{id}/imagery/{z}/{x}/{y}.png` (+ `/meta`); cache respects `cacheable` |
| WP6 | `modules/planning` | `ElementType` (seeded), `Plan`, `Layer`, `Feature` (geometry + `properties` JSONB); CRUD; batch upsert by client UUID; `GET /element-types`; `POST /features:measure` (PostGIS) |
| WP5 | `modules/terrain` | `ElevationProvider` + Copernicus GLO-30 adapter (anonymous AWS); rasterio slope + contours as a background task, cached per site; `POST`/`GET /sites/{id}/terrain` |
| WP7 | frontend shell | router + auth guards + TanStack Query; API client (`credentials: include`, RFC-7807 parsing, 401→refresh→replay); auth pages; sites dashboard; `MapView` + layer registry; always-on attribution; credits page |
| WP8 | frontend site-setup | country-first flow at `/sites/new`: pick country → add ≥4 boundary points (paste/table/click) with live map preview → validate → `POST /sites` → redirect to the site map |

API is versioned under `/api/v1`; OpenAPI at `/docs`. Alembic chain:
`0001 → 0002_auth → 0002_sites → 0003_imagery → 0003_planning → 0004_terrain` (single head).

**Tests:** backend ~160 (pytest; unit + PostGIS-integration via Testcontainers + the migration chain),
frontend 85 (Vitest; MapLibre + fetch are faked). CI (`.github/workflows/ci.yml`) runs lint + format +
type-check + tests for both, plus the frontend production build.

## Not yet built (planned)

- **WP9** — design editor (draw zones/sectors, place/drag elements, measure, save via batch upsert). The core UI; next up.
- **WP10** — terrain visualization & sector helpers (overlay WP5 output in the editor).
- **WP11** — export/share (PNG/PDF/GeoJSON).
- **WP12** — Coolify deployment hardening.

`frontend/` currently has MapLibre but not yet Terra Draw (that arrives with WP9).

## How to run

```bash
# whole stack (needs Docker)
cd infra && cp .env.example .env && docker compose up --build
#   frontend http://localhost:8080 · backend http://localhost:8000/docs · db :5432

# backend dev
cd backend && uv sync && uv run uvicorn app.main:app --reload

# frontend dev
cd frontend && npm install && npm run dev   # proxies /api → :8000
```

## How to test / check

```bash
# backend
cd backend
uv run ruff check . && uv run ruff format --check . && uv run mypy app
uv run pytest                       # unit + PostGIS integration (needs Docker)
uv run pytest -m "not integration"  # unit only, no Docker
APP_LIVE_TESTS=1 uv run pytest -m live   # OPT-IN: hits the real AWS Copernicus bucket

# frontend
cd frontend
npm run lint && npm run typecheck && npm test && npm run build
```

Pytest markers: `integration` (needs a PostGIS container), `live` (hits real external services;
skipped unless `APP_LIVE_TESTS=1`). Default `pytest` stays offline except for the local container.

## Known deferrals & deliberate decisions (not bugs)

1. **`Site.owner_id` has no DB-level FK to `users`** and is nullable. Ownership is enforced at the app
   layer (every site endpoint requires `current_user`; owner is set from it). The FK + NOT NULL is a
   planned hardening, deferred because the sites test suite uses synthetic owner ids. See
   `backend/app/modules/sites/models.py`.
2. **Esri World Imagery** is keyless and used with attribution; its license is grey for *commercial*
   use. Acceptable for this free/non-commercial tool; Sentinel-2 cloudless (CC-BY) is the license-clean
   fallback. Esri tiles are deliberately not cached. See [`DATA_SOURCES.md`](DATA_SOURCES.md).
3. **Terrain live path**: the real AWS Copernicus fetch is covered only by an opt-in `live` test; the
   default suite stubs the DEM so it is offline/deterministic.
4. **Lean v1 deployment**: no Redis/worker; terrain runs as a FastAPI background task. Scale-up services
   are in `infra/docker-compose.scale.yml` for later.
5. Real-time collaborative editing, offline/PWA, and native mobile are out of scope (see ARCHITECTURE §1).

## Suggested review focus

- **Requirements vs. implementation**: check each built WP against its acceptance criteria in `WORK_PACKAGES.md`.
- **Cross-module consistency**: the module shape (`router → service → repository`), the `DataProvider`
  registry/resolver contract (regions ↔ imagery/terrain), and the API conventions in ARCHITECTURE §6.
- **Geo correctness**: WGS84 storage vs. UTM/geography measurement; area/length accuracy; ring validation.
- **Auth & security**: cookie flags, token handling, rate limiting, ownership checks (403/404), and that
  no endpoint leaks another user's data.
- **Error handling & edge cases**: invalid geometry, empty/no-data terrain, provider failures/timeouts,
  pagination bounds, batch-upsert idempotency.
