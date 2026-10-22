# Work Packages

> **Progress (2026-10-22):** ✅ done — WP0–WP12 (WP10: [`TERRAIN_VIZ.md`](TERRAIN_VIZ.md); WP11: [`EXPORT.md`](EXPORT.md);
> WP12: [`DEPLOY.md`](DEPLOY.md)). See [`PROJECT_STATUS.md`](PROJECT_STATUS.md)
> for the current state, how to run/test, and known deferrals.
>
> Integration review fixes: [`REVIEW_FOLLOWUP_2026-10-21.md`](REVIEW_FOLLOWUP_2026-10-21.md).
> WP7's imagery contract is generated and checked; the complete generated API client remains deferred.

Self-contained units of work for implementing agents (Sonnet / Codex). Read
[`ARCHITECTURE.md`](ARCHITECTURE.md) first — it defines the stack, module shapes,
data model, API, and testing bar that every package must honor.

**Rules for implementing agents**

- Stay inside your package's scope. Do not change a published interface (API routes,
  provider protocols, data model) without flagging an architecture change.
- Every package is "done" only with tests passing and CI green. No package merges red.
- Honor the module shape (`router → service → repository`) and the dependency rule.
- Prefer the smallest change that satisfies the acceptance criteria.

**Legend** — `∥` can run in parallel with its siblings · effort is a rough t-shirt size.

---

## WP0 — Project scaffolding & tooling  `S`

**Goal:** a runnable skeleton with CI, so every later package lands in a consistent home.

**Deliverables**
- Monorepo layout from the README (`backend/`, `frontend/`, `infra/`, `docs/`, `.github/`).
- `backend/`: FastAPI app boots, `pyproject.toml` (ruff, mypy, pytest), `app/main.py` with `/healthz`.
- `frontend/`: Vite + React + TS boots, eslint + prettier + vitest configured.
- `infra/docker-compose.yml` — **lean v1**: db (postgis), backend, frontend; `infra/.env.example`.
  Document the optional `redis` + `worker` scale-up services (commented or an override file).
- `.github/workflows/ci.yml`: lint + type-check + unit tests for both sides.
- Root `CONTRIBUTING.md` documenting the module shape and the test commands.

**Acceptance:** `docker compose up` brings the stack up; `/healthz` returns ok; CI is green on an empty test suite.

---

## WP1 — Backend core & database foundation  `M`  (depends: WP0)

**Goal:** the backend spine every module plugs into.

**Deliverables**
- Pydantic `Settings` (12-factor), DB session management (async SQLAlchemy 2.0), PostGIS enabled.
- Alembic configured; initial migration creating the PostGIS extension.
- `core/` geo utilities: UTM-zone-from-lng/lat lookup, bbox helpers, GeoJSON↔geometry conversion.
- Error handling (RFC-7807), pagination, request-id middleware, OpenAPI tags per module.
- Test harness: pytest + Testcontainers spinning up `postgis/postgis`, an `AsyncClient` fixture.

**Acceptance:** an integration test writes and reads a geometry round-trip through PostGIS; UTM lookup
returns correct EPSG for Nairobi and Dar es Salaam.

---

## WP2 — Auth & accounts  `M`  (depends: WP1)  ∥ WP3

**Goal:** multi-user accounts.

**Deliverables**
- `modules/auth`: register, login, refresh, logout, `GET /auth/me`; JWT in httpOnly cookies;
  argon2 password hashing; `current_user` dependency. (Wrap `fastapi-users` or implement OAuth2 password flow.)
- User model + migration. Rate-limit login.

**Acceptance:** full auth flow covered by integration tests incl. refresh and unauthorized access (401).

---

## WP3 — Sites (land from coordinates)  `M`  (depends: WP1)  ∥ WP2

**Goal:** turn coordinates into a stored, measured site.

**Deliverables**
- `modules/sites`: `Site` model (boundary POLYGON 4326, `country_code`, centroid, area_m2, bbox, utm_epsg, owner).
- `POST /sites` from `{name, country_code, coordinates:[[lng,lat],…]}` (≥3 points): validate ring, close
  polygon, reject self-intersections, compute centroid/area (via local UTM)/bbox/utm_epsg. If `country_code`
  is omitted, reverse-derive it from the centroid. CRUD + ownership checks.

**Acceptance:** creating a site from 4 corners yields a correct area (±1% vs a known reference polygon);
`country_code` is stored (and derived when omitted); non-owners get 403; invalid rings get 422.

---

## WP3B — Region resolution, provider registry & attribution  `M`  (depends: WP1)

**Goal:** the seam that makes new regions config, not code — and that surfaces rights to users.

**Deliverables**
- A **provider registry** + shared `DataProvider` base (fields: `key`, `category`, `attribution`,
  `license`, `terms_url`, `cacheable`, `covers(bbox)`). Every imagery/elevation/… adapter registers here.
- **`RegionProfile`** as seeded data (country → ordered provider chain per category + map defaults),
  incl. a global `"*"` fallback profile.
- A generic **resolver**: `(country_code, bbox, category) → first covering adapter`, falling back down
  the chain and finally to `"*"`.
- Attribution surfacing: an endpoint returning the sources/licenses/terms used for a site, driving the
  in-app credits page (kept in sync with [`docs/DATA_SOURCES.md`](DATA_SOURCES.md)).

**Acceptance:** resolving `imagery` for a Kenyan site returns the Esri adapter; with Esri forced
non-covering it falls back to Sentinel-2 cloudless; an unknown country resolves via `"*"`; the
attribution endpoint lists each used source with license + terms URL. Adding a new region profile in a
test requires no code change to the resolver.

---

## WP4 — Imagery providers + tile proxy/cache  `M`  (depends: WP1, WP3, WP3B)

**Goal:** serve georeferenced aerial tiles for a site through our backend, provider chosen by region.

**Deliverables**
- `modules/imagery`: `ImageryProvider` (extends `DataProvider`); `EsriWorldImageryProvider`
  (`cacheable=False`) and `Sentinel2CloudlessProvider` (`cacheable=True`); both registered in the
  WP3B registry and referenced by region profiles.
- `GET /sites/{id}/imagery/{z}/{x}/{y}.png` — resolver picks the provider for the site's country/bbox,
  fetch upstream, **cache only if `cacheable`**, return with attribution.
- `GET /sites/{id}/imagery/meta` — provider key, attribution, license, terms_url, max zoom, coverage flag.
- Provider **contract test** (recorded fixture) that any future adapter must pass.

**Acceptance:** tiles for a Kenyan bbox return 200 via the resolved provider; an Esri tile is **not**
cached, a Sentinel-2 tile **is** cached on second request; `meta` includes license + terms_url; contract
test passes.

---

## WP5 — Terrain: DEM fetch + slope/contours  `L`  (depends: WP1, WP3, WP3B)

**Goal:** derive slope and contour lines for a site — lightweight, cached once per site.

**Deliverables**
- `modules/terrain`: `ElevationProvider` (extends `DataProvider`) + `CopernicusDemAwsProvider`
  (`cacheable=True`, registered in the WP3B registry) — reads the Copernicus DEM GLO-30 window for the
  site bbox from the public AWS bucket `copernicus-dem-30m` via **anonymous, unsigned** S3 requests
  (no key). Self-hosted OpenTopoData documented as the offline alternative.
- Derivation as a **FastAPI background task** (lean v1 — no arq worker): fetch DEM window → `rasterio`
  slope (°/%) + contours at a configurable interval → store contours as MULTILINESTRING + slope overlay.
  **Cache by site geographic inputs and contour interval**; editable boundaries invalidate results.
  Job UUID guards fence superseded attempts, and DEM extent budgets run before fetching/allocating.
- `POST /sites/{id}/terrain` (kick off / returns status) and `GET /sites/{id}/terrain` (status + results).
- GDAL/rasterio provisioned in the backend image (use a GDAL base image or `libgdal-dev`).

**Acceptance:** terrain completes in well under a few seconds for a sloped East-African site bbox and
returns contour GeoJSON + a slope legend; flat-area, no-data, and ocean (=0) cases handled gracefully;
a second request serves the cached result.

> If high-res (user-uploaded) DEMs or heavy batch work is added later, move this derivation to the
> optional arq worker (§3/§10 in ARCHITECTURE.md). The module interface does not change.

---

## WP6 — Planning domain (plans, layers, features)  `L`  (depends: WP1, WP3)

**Goal:** the data model and API for the actual design.

**Deliverables**
- `modules/planning`: `Plan`, `Layer`, `Feature` (geometry 4326, feature_type, element_type_id, properties JSONB),
  `ElementType` catalog + seed data (house, bed, tree, pond, swale, fence, path, zone, sector…).
- Full CRUD; **batch upsert** `POST /plans/{id}/features:batch` keyed by client UUIDs; GeoJSON in/out.
- `POST /features:measure` authoritative length/area via PostGIS. GiST indexes on geometry.

**Acceptance:** batch-upserting a mix of point/line/polygon features persists and re-reads identically as
GeoJSON; `:measure` matches PostGIS within tolerance; zone/sector typed properties validated.

---

## WP7 — Frontend shell & map base  `M`  (depends: WP2, WP3B, WP4)

**Goal:** the app users log into, with a working map showing site imagery.

**Deliverables**
- `app/` shell: router, TanStack Query client, auth guard, generated API client from OpenAPI.
- `features/auth` UI; `features/sites-dashboard` list.
- `features/map`: `<MapView>` wrapping MapLibre; imagery raster source pointed at the backend proxy;
  a layer registry; **always-on attribution control** fed by `/imagery/meta`.
- A **"Data sources & credits"** page rendered from the attribution endpoint (WP3B), listing each
  source's license + terms link.

**Acceptance:** a logged-in user opens a site and sees its aerial imagery correctly georeferenced at the
site centroid/zoom with the provider's attribution visible; the credits page lists sources, licenses,
and terms links; Playwright covers login → open site → imagery + attribution visible.

---

## WP8 — Site-setup flow (country-first)  `M`  (depends: WP3, WP3B, WP7)

**Goal:** the entry point — pick country, enter coordinates, land on the map with the right sources.

**Deliverables**
- `features/site-setup`: **step 1 — choose country** (sets the provider chain + map defaults; can be
  auto-suggested from the first coordinates); **step 2** — enter coordinates (paste/table/click-to-add
  ≥4 points) with live boundary preview, validation, name the site; submit → `POST /sites` → redirect
  to its map view.

**Acceptance:** e2e — pick a country, enter 4 corners, see the boundary, create, and arrive on the site
map with imagery resolved for that country; attribution for the active source is visible.

---

## WP9 — Design editor (core)  `XL`  (depends: WP6, WP7, WP8)

**Status:** implemented; see [`DESIGN_EDITOR.md`](DESIGN_EDITOR.md) for controls, tested behavior,
save semantics, and explicitly deferred refinements.

**Goal:** the heart — draw, place, measure, save.

**Deliverables**
- `features/design-editor`: Terra Draw integrated with MapLibre; tools for polygon (zones/sectors),
  point/line (elements/paths), select, edit vertices, drag, delete.
- Element palette from `/element-types`; click/drag to place; per-feature properties panel.
- Layer panel: toggle/reorder zones, sectors, elements, paths.
- Live measurement (Turf) while drawing + a dedicated measure tool; authoritative numbers on save.
- Save via batch upsert with client UUIDs; optimistic updates; undo/redo of editor actions.

**Acceptance:** e2e — draw a zone, place & drag a house, draw a path, read a measurement, save, reload,
everything persists identically.

---

## WP10 — Terrain visualization & sectors helpers  `M`  (depends: WP5, WP9)

**Goal:** make slope/sun/wind usable in the editor.

**Deliverables**
- Contour + slope overlays as toggleable layers with a legend.
- Sector helpers: draw sun-path / wind sectors from bearings (and, if feasible, a solar-position helper
  from the site's lat/lng and date).

**Acceptance:** contours and a slope legend render over imagery; a wind sector drawn from two bearings saves as a sector feature.

---

## WP11 — Export & share  `M`  (depends: WP9)

**Goal:** get the plan out.

**Deliverables**
- `modules/export`: PNG/PDF render of the current plan + legend; GeoJSON download.
- Optional read-only share link for a plan.

**Acceptance:** exporting a plan yields a correctly scaled image with legend and attribution; GeoJSON re-imports cleanly.

---

## WP12 — Deployment on Coolify  `M`  (depends: a working WP7–WP9 slice)

**Goal:** live, reproducible deploy.

**Deliverables**
- Harden `infra/docker-compose.yml` for Coolify; release-step migrations; healthchecks; volumes.
- `infra/.env.example` complete; deployment runbook in `docs/`.
- Structured logging, `/healthz` + `/readyz`, optional Sentry.

**Acceptance:** a clean Coolify deploy from compose brings up the full stack; smoke test of the critical flow passes against the deployed URL.

---

## Suggested parallelization

- **Wave 1:** WP0 → WP1.
- **Wave 2 (parallel):** WP2 ∥ WP3 ∥ WP3B.
- **Wave 3 (parallel):** WP4 ∥ WP6 ∥ WP7 (WP7 needs WP2+WP3B+WP4 for full function but its shell can start early).
- **Wave 4:** WP8 → WP9.
- **Wave 5 (parallel):** WP5 → WP10 ∥ WP11.
- **Wave 6:** WP12 (as soon as a usable slice exists; iterate).
