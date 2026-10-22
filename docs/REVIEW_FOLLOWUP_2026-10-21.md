# Review follow-up — 2026-10-21

## Context and scope

The owner requested a requirements/correctness/modularity review, then authorized fixes and
improvements with a written handoff for Claude. This change hardens the implemented WP0–WP8
foundation. The owner subsequently selected WP9 implementation in the same session; that editor
is now included (see [`DESIGN_EDITOR.md`](DESIGN_EDITOR.md)). WP10–WP12 remain separate work.

## Changes and reasons

| Area | Previous behavior | New behavior and rationale |
|------|-------------------|----------------------------|
| Imagery API | Backend returned `covered`/`provider_key`; frontend expected `available`/`provider`, removed imagery after receiving metadata, and tests duplicated the wrong contract. | Frontend uses the backend contract. A small Python generator emits the response type and a serialized provider fixture, with CI drift detection. It is deliberately limited to imagery; a complete generated API client remains future work. |
| Tile templates | The frontend reconstructed the route independently. | It honors the backend template, resolves it against the API origin, and preserves the literal XYZ placeholders after URL resolution. The fallback remains for the loading state. |
| Credits | Missing provider metadata could leave the per-site page loading indefinitely. | An uncovered response produces an empty, completed source list. Nullable metadata is handled explicitly. |
| Terrain cache | A ready result was reused by site ID even after the site's boundary moved. | SHA-256 of bbox and country identifies geographic inputs. GET hides mismatches; POST requeues changed inputs, a changed ready-result provider, failed/stale work, or a requested contour-interval change. A name-only edit does not invalidate terrain. Terrain is derived over the bbox, so reshaping a polygon without changing its bbox correctly reuses the same result. |
| Terrain jobs | A delayed old task could overwrite a replacement generation or append stale contours. | Each attempt has a job UUID. Claim, completion, and failure writes check it. Completion checks and locks the result row before replacing contours in the same transaction. Superseded work publishes nothing. |
| Terrain resource use | A user-controlled bbox could enumerate many remote tiles and allocate an enormous raster. | Padded requests are limited to 1,000,000 estimated cells and 16 source tiles, before scheduling. The adapter repeats checks before opening tiles and against actual source spacing before merge. Oversized API requests return 422 without fetching a DEM. Limits are lean-v1 processing budgets, not geographic validity rules for storing sites. |
| Plan updates | Explicit `name: null` passed schema validation and failed the database constraint. | The endpoint returns 422. Nullable descriptions can still be cleared. |
| Batch writes | The SQL write guard stopped cross-plan overwrite, but a collision after the precheck could lead to unscoped readback and partial success. | `RETURNING` verifies all writes before commit; a collision rolls back the entire batch and becomes 409. Readback is also restricted by plan. A regression simulates the stale precheck deterministically. |
| Module boundaries | Imagery and terrain imported the sites router, model, and duplicated ownership error handling. | `sites.dependencies` exports an ownership-checked immutable context containing only ID, country, and bbox. Router dependency aliases remain available for existing overrides. |
| Authentication | Argon2 ran synchronously inside async service methods. | Hashing and verification run through `asyncio.to_thread`, keeping CPU-heavy work off the request event loop. |
| Readiness | `/readyz` always returned success. | It performs a database query with a three-second timeout and returns 503 on connectivity failure. Liveness remains independent. Compose waits for backend health before starting the frontend. |
| Builds | Backend ignored its lock during the dependency install; frontend could fall back from `npm ci` to `npm install`. | Both Dockerfiles require their lockfiles. Dependency drift causes a build failure instead of silently resolving a different environment. |
| Browser tests | Playwright was opt-in only, absent from CI, and response listeners could attach after navigation had already fetched tiles. | CI starts a disposable Compose stack and runs Chromium acceptance tests. Response listeners are attached before triggering navigation. Default tests stub tile bytes to isolate the UI/API integration from third-party availability. |
| Dependencies | Docker installation reported nine npm audit findings, including critical findings in MapLibre and test tooling. | Affected direct dependencies are upgraded to patched release lines and revalidated; see the verification results below. Node 22.12+ is required. |

Dependency release lines now used: MapLibre 6.15, React Router 7.18, Vite 7.3, Vitest 5.0,
and Vite's React plugin 5.2. The lockfile records exact versions. Vite 7 keeps the existing build
model while resolving the reported advisories; React remains on 18. MapLibre 6 uses named ESM
exports, so the map wrapper and fake module now use those exports. Test setup imports the
Vitest-specific jest-dom adapter. CI rejects high/critical npm audit findings.

MapLibre 6 also ships its worker separately. The final visual regression caught that Vite's
ordinary library import did not package this worker, leaving GeoJSON vectors invisible. The map
wrapper now sets a worker URL imported with `?worker&url`, producing a same-origin `.js` asset
with nginx's JavaScript MIME type. Browser coverage now selects the saved house on the rendered
map after reload, rather than only checking the API data and feature list.

## Migration and deployment

New Alembic revision: `0005_terrain_generations`, after `0004_terrain`. It adds nullable
`input_key` and `job_id` columns. Existing sites, plans, features, and terrain data are retained.
Existing terrain rows have unknown inputs, so GET reports `not_requested` and the next POST
recomputes them. No bulk DEM fetch is triggered during deployment.

The normal Compose startup already runs `alembic upgrade head`. Rebuild the frontend and
backend together so the corrected metadata consumer and the generation-aware backend deploy
as one release. For a non-Compose development backend, run `uv run alembic upgrade head`.
Keep `APP_COOKIE_SECURE=true` behind HTTPS; plain HTTP on a LAN needs an explicit local override.

The local verification stack is separate from the user's services:

```powershell
# From the repository root; the secret below is for disposable local verification only.
$env:APP_SECRET_KEY = 'local-verification-only-01234567890123456789'
docker compose -p permaculture-verify -f infra/docker-compose.yml -f infra/docker-compose.verify.yml up --build -d --wait
$env:E2E = '1'
$env:E2E_BASE_URL = 'http://localhost:18080'
cd frontend
npm ci
npx playwright install chromium
npm run e2e -- --project=chromium
cd ..
# Stops this project while preserving its database and accounts.
docker compose -p permaculture-verify -f infra/docker-compose.yml -f infra/docker-compose.verify.yml down
```

The local project now contains an owner-requested account and must retain its `pgdata` volume.
Do not run `down -v` against it. CI uses a separate disposable project (`permaculture-ci`).

The override requires Compose >=2.24.4 for `!override`. It binds localhost ports 15432 (DB),
18000 (API), and 18080 (frontend). Do not use its disposable secret or insecure cookies in production.

## Verification

Local checks on 2026-10-21:

- Full backend suite: **178 passed, 1 skipped** against disposable PostGIS containers, including
  the complete Alembic chain, legacy terrain invalidation, and stale-job/batch-conflict regressions.
- Frontend: **91 passed** on the patched dependency versions; lint, TypeScript, production build,
  and changed-file formatting checks pass.
- Backend Ruff, formatting, mypy, and generated-contract drift checks pass.
- `npm audit --audit-level=high`: **0 vulnerabilities**, including development dependencies.
- Both production Docker images build and the isolated Compose stack reaches healthy state.
  Docker verification uncovered a missing `libexpat1` rasterio runtime dependency; the backend
  image now installs it and checks `import rasterio` during its build.
- Chromium against that built stack: **4 passed** (login/map, country-first site setup, full editor
  save/reload/deletion, and failed-save/navigation/layer-persistence regression).
- A separate live imagery-proxy smoke request returned **200 image/jpeg** with the real Esri source.
- The requested owner account was created through the API and its login reverified after the final
  rebuild. Its credentials are not stored in repository files. The local stack is left running at
  `http://localhost:18080`; its database volume is preserved.

The AWS Copernicus live test remains skipped unless explicitly enabled. Passing the default
suite proves local fixtures and PostGIS behavior, not upstream availability. CI workflows were
updated; this local task does not claim a completed GitHub Actions run.

## Remaining debt and scope boundaries

- `sites.owner_id` is still nullable and lacks a user FK. Existing synthetic-user test fixtures
  need migration before enforcing the constraint; this is not silently treated as solved.
- Only the imagery response is generated. Other handwritten API types should migrate as their
  consumers are extended, with contract coverage rather than independent mocks.
- Repository-owned commits remain outside the corrected batch path; larger multi-repository
  use cases may warrant an explicit unit-of-work boundary.
- Region profiles remain Python-seeded data; setup-map country framing is still a separate
  frontend approximation. Do not claim region setup is fully driven by runtime configuration.
- Terrain jobs still run in-process. A restart loses execution; stale work is retried on a later
  POST after ten minutes. Job UUIDs protect correctness, not durable scheduling or cancellation.
- DEM budgets limit each request, not aggregate concurrent workloads. Queue capacity/rate limits
  and a worker remain appropriate before supporting materially higher concurrency.
- Authentication throttling is process-local; expired-key cleanup and shared storage remain
  follow-up work. Production reverse-proxy trust settings also need to match deployment so
  IP throttling distinguishes clients rather than grouping them under nginx's address.
  No account recovery/email verification flow was added.
- WP10–WP12 and the previously documented licensing decisions remain separate work.
- The patched MapLibre release increases the lazy map bundle to roughly 1.06 MB (292 kB gzip).
  The existing 900 kB warning remains visible rather than silently raising its threshold.
