# Project Status & Review Guide

Snapshot for a reviewer (human or AI) doing a **consistency, bug, and requirements check**.
Pair this with [`ARCHITECTURE.md`](ARCHITECTURE.md) (intended design), [`WORK_PACKAGES.md`](WORK_PACKAGES.md)
(the plan + acceptance criteria), and [`DATA_SOURCES.md`](DATA_SOURCES.md) (rights).

_Last updated: 2026-10-29._

**Maintainability follow-up:** [`AUDIT_FIXES_2026-10-29.md`](AUDIT_FIXES_2026-10-29.md) records
draft-preserving refresh/session handling, stable layer-role migration `0015`, consistent export
reads and metric rendering, editor refactoring, automated architecture/Hooks/unused-code checks
and the local release preflight. The independent review is
[`AUDIT_SECOND_REVIEW_2026-10-29.md`](AUDIT_SECOND_REVIEW_2026-10-29.md).

**Latest reliability work:** [`AUDIT_FIXES_2026-10-26.md`](AUDIT_FIXES_2026-10-26.md) records the
local audit fixes, migrations `0011_plan_revision` and `0012_password_recovery`, regression checks
and operator rollout steps. The hosted instance at <https://maumbile.ecosoul.tech> reports v0.1.4;
these follow-up fixes are local/unreleased and have not been deployed there.

**Review follow-up:** integration fixes and hardening are documented in
[`REVIEW_FOLLOWUP_2026-10-21.md`](REVIEW_FOLLOWUP_2026-10-21.md). Claude's entry point is
[`../CLAUDE.md`](../CLAUDE.md). This includes the corrected imagery contract, terrain input
invalidation/job fencing/budgets, atomic batch conflicts, and Docker/browser verification.

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
| WP9 | design editor | plan creation/opening; Terra Draw zones/sectors/paths/elements, selection/vertices/drag/rotation, properties, Turf/PostGIS measurements, layer toggle/reorder, undo/redo, atomic feature save/delete and reload |
| WP10 | terrain viz + sector helpers | `TerrainPanel` (compute/poll `POST`/`GET /terrain`, contour + slope toggleable registry layers, slope legend, credit/notice); editor "Sector from bearings" wedges + sun-path helper; generated `TerrainRead` contract. See [`TERRAIN_VIZ.md`](TERRAIN_VIZ.md) |
| WP11 | `modules/export` | `GET /plans/{id}/export?format=geojson\|png\|pdf` (scaled A4 plan with legend/attribution, round-trippable GeoJSON), read-only share links (`plan_shares`, migration `0006`), editor "Export & share" menu and public `/shared/:token` page; see [`EXPORT.md`](EXPORT.md) |
| WP12 | `infra/` | production-shaped `docker-compose.yml` (no host ports, required secrets, migrate-then-serve, health-ordered), `docker-compose.local.yml`, throwaway `smoke-test.sh`; JSON request logging; runbook [`DEPLOY.md`](DEPLOY.md) |
| WP8 | frontend site-setup | country-first flow at `/sites/new`: pick country → add ≥4 boundary points (paste/table/click) with live map preview → validate → `POST /sites` → redirect to the site map |

API is versioned under `/api/v1`; OpenAPI at `/docs`. Alembic chain:
`0001 → 0002_auth → 0002_sites → 0003_imagery → 0003_planning → 0004_terrain → 0005_terrain_generations → 0006_plan_shares`
(single head). Existing terrain is lazily recomputed after the new migration; site/design data is retained.

**Tests:** backend 226 passing + one skipped opt-in live test (pytest; unit + PostGIS integration via
Testcontainers + the migration chain), frontend 391 (Vitest; MapLibre + fetch are faked), and 11
Chromium acceptance tests against built containers.
CI (`.github/workflows/ci.yml`) runs lint/type checks, backend formatting, API contract drift checks,
both suites, the frontend build, and Chromium acceptance tests against a disposable Compose stack.

## Not yet built (planned)

- **WP12** (Coolify deployment) is implemented and the owner-confirmed hosted instance is live:
  see [`DEPLOY.md`](DEPLOY.md). Optional Sentry, verified off-host backup restoration and operator
  configuration for the next release remain operational follow-up work.
- **Map-reliability pass** is **done** (satellite setup basemap; precise corner placement, drag, snap,
  select, delete, undo/redo, zoom-to-boundary; zoom-stable drawing). See `frontend/README.md`.
- **Guided focus-mode shell** is **done**: the editor is a focus switcher
  (Boundary → Sectors&terrain → Zones → Elements → Functions) over one saved design — only the current
  mode's feature types are editable, the others render as faint, toggleable context, with a suggested
  order and progress rail but free navigation and autosave. See
  `frontend/src/features/design-editor/focus/` and [`UX_GUIDED_MODES.md`](UX_GUIDED_MODES.md).

All planned feature work is now implemented and the hosted instance is deployed. Ongoing polish
remains — see [`UX_GUIDED_MODES.md`](UX_GUIDED_MODES.md) for refinements (e.g. mid-ring
corner insertion, edge snapping, deeper focus-mode integration tests).

`frontend/` now includes Terra Draw and Turf. See [`DESIGN_EDITOR.md`](DESIGN_EDITOR.md) for controls,
save semantics and remaining editor refinements.

## How to run

```bash
# whole stack (needs Docker)
cd infra && cp .env.example .env && docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
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
4. **Lean v1 deployment**: no Redis/worker; terrain runs as a FastAPI background task, with per-request
   extent limits and generation guards. Results are invalidated when the bbox/country changes.
   Scale-up services
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
