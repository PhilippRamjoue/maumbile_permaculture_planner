# Architecture

This document is the single source of truth for how Maumbile (the Permaculture Planner) is
built. It is written to be consumed both by humans and by AI coding agents
(Opus as architect; Sonnet/Codex implementing work packages). Keep it current:
when a design decision changes, change it here first.

---

## 1. Goals and constraints

**Mission.** A **free-forever, non-commercial** tool for everyone — built to help people design
permaculture, especially in lower-income regions. No paid services or API keys in the default config;
every data source's rights are shown to users (see §7.4, [`DATA_SOURCES.md`](DATA_SOURCES.md)).

**Product goals**

- Anyone can define their land from coordinates and get real aerial imagery as a canvas.
- On that canvas: trace zones & sectors, place elements, and measure accurately.
- Easy and pleasant for non-experts; accurate enough for serious planning.
- Works **region by region**: start in East Africa; adding Europe or anywhere else is a config
  change (a provider adapter + a region profile), never a core rewrite (see §7).

**Engineering constraints (from the owner)**

- React frontend, Python backend, Dockerized, deployed on **Coolify** via Docker Compose.
- **Modular, scalable, testable.** Work must decompose into packages that independent
  AI agents can implement in parallel with minimal coordination.
- **Multi-user with accounts** from the start.
- **Accurate, georeferenced** measurements — not a sketch on a screenshot.
- Map tiles & elevation fetched via a **backend proxy + cache** (keys hidden, cost controlled).
- **East Africa first** (Kenya, Tanzania); design for later global expansion.

**Non-goals (for now)**

- Real-time multi-user collaborative editing (CRDT). Sharing/links come later; live co-editing is out of scope for v1.
- Offline-first / PWA. Nice later, not a v1 constraint.
- Mobile-native apps. Responsive web only.

---

## 2. System context

```
                 ┌─────────────────────────────────────────────┐
   Browser       │                 Frontend SPA                 │
  (the user) ───▶│   React + TS + Vite · MapLibre GL · Terra    │
                 │   Draw · Zustand · TanStack Query            │
                 └───────────────────────┬─────────────────────┘
                                         │ HTTPS / JSON (REST)
                                         │  + tile/DEM requests (proxied)
                 ┌───────────────────────▼─────────────────────┐
                 │                Backend API                   │
                 │  FastAPI modular monolith                    │
                 │  ┌─────────┬──────────┬──────────┬────────┐  │
                 │  │  auth   │  sites   │ planning │ export │  │
                 │  ├─────────┼──────────┼──────────┴────────┤  │
                 │  │ imagery (proxy+cache) │ terrain (DEM)   │  │
                 │  └─────────┴───────────┴──┬───────┬────────┘  │
                 └───────────────┬───────────┼───────┼──────────┘
                                 │           │       │
              ┌──────────────────▼──┐   ┌────▼───┐   ▼ (async jobs)
              │ PostgreSQL + PostGIS │   │ Redis  │  ┌──────────────┐
              │ users, sites, plans, │   │ cache  │  │ Worker (arq) │
              │ features (geometry)  │   │ queue  │  │ slope/contour│
              └──────────────────────┘   └────────┘  └──────┬───────┘
                                                            │
                        External providers (called only by backend)
                        ┌───────────────────────────────────────────┐
                        │ Imagery: Esri World Imagery (default)       │
                        │ Elevation: Copernicus/SRTM DEM, OpenTopoData│
                        └───────────────────────────────────────────┘
```

The browser never talks to external imagery/elevation providers directly. All such
traffic goes through the backend so we control keys, caching, cost, and licensing.

---

## 3. Technology choices and rationale

### Backend — FastAPI modular monolith

- **FastAPI** — async, typed, OpenAPI out of the box (frontend client can be generated),
  excellent for an API-first, testable service.
- **SQLAlchemy 2.0 + GeoAlchemy2** — mature ORM with first-class PostGIS geometry support.
- **Alembic** — schema migrations.
- **Pydantic v2** — request/response schemas and settings.
- **PostgreSQL + PostGIS** — the right database for this. PostGIS gives us geometry/geography
  types, spatial indexes, and accurate distance/area via the `geography` type and
  on-the-fly reprojection. Do **not** hand-roll geospatial math in Python what PostGIS does natively.
- **Redis + arq (optional, not in lean v1)** — a task queue + cache for *when* load demands it.
  **v1 deliberately omits both**: terrain at 30 m over a small site bbox is a milliseconds-scale
  computation (see §7), so it runs as a FastAPI background task and results are cached once per
  site. Add Redis + `arq` only when high-res DEMs, heavy export rendering, or real concurrency
  arrive. (See the two deployment profiles in §10.)
- **Why a modular monolith, not microservices:** one deployable, one test suite, trivial
  local dev, no network between bounded contexts. We keep strict module boundaries so that
  *if* terrain processing or imagery ever needs independent scaling, it extracts cleanly into
  the optional worker — a config/infra change, not a rewrite.

### Frontend — React + MapLibre

- **React + TypeScript + Vite** — fast dev, typed, standard.
- **MapLibre GL JS** — open-source (BSD), WebGL vector map engine. Chosen over Leaflet for
  performance, crisp rendering at any zoom, nice visuals, and a healthy future. It renders
  our Esri raster imagery as a raster source and our design features as GeoJSON vector layers.
  - *Tradeoff acknowledged:* Leaflet + Leaflet-Geoman is faster to a first editor and has
    more turnkey drawing plugins. We accept slightly more up-front work on MapLibre for the
    long-term payoff. If v1 velocity becomes critical, Leaflet is the documented fallback.
- **Terra Draw** — engine-agnostic drawing/editing (polygons for zones/sectors, points/lines
  for elements and paths, vertex editing, snapping). Engine-agnostic means we are not locked to MapLibre.
- **Turf.js** — client-side geodesic distance/area for instant feedback while drawing
  (authoritative measurements are confirmed server-side via PostGIS).
- **Zustand** — local/UI and editor state (selected tool, active layer, draft geometry).
- **TanStack Query** — server state (sites, plans, features): caching, mutations, optimistic updates.
- **Feature-sliced structure** — each feature is a folder (`features/site-setup`,
  `features/design-editor`, …) so an agent can own a feature end to end.

---

## 4. Backend module decomposition (bounded contexts)

Each module is a Python package under `backend/app/modules/<name>/` with a consistent
internal shape so agents and reviewers always know where things live:

```
modules/<name>/
├── router.py        # FastAPI APIRouter — HTTP layer only
├── schemas.py       # Pydantic request/response models
├── models.py        # SQLAlchemy ORM models (if the module owns tables)
├── service.py       # business logic — pure-ish, unit-testable, no FastAPI imports
├── repository.py    # data access (DB queries) — the only place that touches the session
└── tests/
```

**Dependency rule:** `router → service → repository → db`. Services never import routers;
modules depend on each other only through service interfaces, never by reaching into another
module's repository or models.

### Modules

1. **`auth`** — registration, login, JWT (access + refresh) in httpOnly cookies, password
   hashing (argon2), current-user dependency. Consider `fastapi-users` to avoid rebuilding
   the wheel; wrap it behind our own interface.
2. **`sites`** — a *site* is a piece of land owned by a user. Create from coordinates
   (≥3 points → boundary polygon), store boundary in PostGIS, compute centroid/area/bbox and
   the local UTM zone. CRUD. One user → many sites.
3. **`imagery`** — provider adapter interface + implementations; a **tile proxy + cache**
   endpoint the frontend hits. Default provider: Esri World Imagery. See §7.
4. **`terrain`** — fetch DEM for a site's bbox from an elevation provider, derive slope and
   contour lines (runs in the worker), store/serve results. See §7.
5. **`planning`** — the design domain. A *plan* belongs to a site; it contains *layers*;
   layers contain *features* (zones, sectors, elements, paths, annotations). This is where
   the real editing data lives. See §5.
6. **`export`** — render/export a plan (PNG/PDF/GeoJSON). Later.
7. **`shared`** / `core` — config, db session, geo utilities (UTM zone lookup, reprojection
   helpers), auth dependencies, error handling, pagination.

---

## 5. Domain & data model

Geometry is stored in **WGS84 (EPSG:4326)** using PostGIS. All user-facing geometry travels
over the API as **GeoJSON**. Measurements are computed in a projected CRS (local UTM) or via
the PostGIS `geography` type — never read off raw Web-Mercator pixels.

### Core entities

```
User (1)───(N) Site (1)───(N) Plan (1)───(N) Layer (1)───(N) Feature
                 │                                               │
                 ├─ boundary: POLYGON (4326)                     ├─ geometry: POINT|LINESTRING|POLYGON (4326)
                 ├─ country_code (ISO-3166, drives providers)    ├─ feature_type: zone|sector|element|path|annotation
                 ├─ centroid, area_m2, bbox                      ├─ element_type_id → ElementType (nullable)
                 └─ utm_epsg (e.g. 32737 for Tanzania)           └─ properties: JSONB (name, notes, style, zone_number…)

ElementType (catalog)   TerrainDataset (per site)      ImageryCacheTile (optional persistent tile cache)
 ├─ key: "house"…        ├─ site_id                     ├─ provider, z/x/y
 ├─ category             ├─ dem_source, resolution_m    └─ bytes, fetched_at
 ├─ default_style        ├─ slope_raster_ref
 └─ icon                 └─ contours: MULTILINESTRING
```

**Notes**

- **Zones** (0–5) and **sectors** (sun/wind/fire/view/water…) are just `Feature`s with a
  `feature_type` and typed `properties`, so the editor and storage stay uniform. A zone carries
  `{zone_number: 1}`; a sector carries `{sector_kind: "wind", bearing_from, bearing_to}`.
- **`ElementType`** is a seeded catalog (house, bed, tree, pond, swale, fence, path…) with
  category, default style, and icon. Features reference it so the palette is data-driven and
  extensible without code changes.
- **`properties: JSONB`** keeps per-feature attributes flexible while the geometry column stays
  strongly typed and spatially indexed (GiST index on every geometry column).
- **`country_code`** on Site (and a default on User) drives region resolution (§7.0): which imagery/
  elevation/data providers are pulled and the map defaults. **`RegionProfile`** is seeded **data**
  (country → ordered provider chains per category), not code, so new regions are added without a
  deploy of new logic.
- Soft-delete (`deleted_at`) on Site/Plan so users can recover; hard-delete is an explicit action.

### Coordinate systems (the measurement contract)

- **Storage:** EPSG:4326 (lat/lng), geometry type, GiST-indexed.
- **Display:** MapLibre reprojects to Web Mercator (EPSG:3857) for rendering.
- **Measurement:** reproject the feature to the site's **local UTM zone** (Kenya ≈ EPSG:32736/32737,
  Tanzania ≈ EPSG:32736/32737) and compute length/area there, or use PostGIS `ST_Area(geog)` /
  `ST_Length(geog)` on the `geography` cast. East Africa straddles the equator, so distortion is
  low, but we still project for correctness. The frontend shows live turf.js estimates; the
  backend returns authoritative numbers on save.

---

## 6. API design (REST, versioned under `/api/v1`)

Resource-oriented and OpenAPI-documented. The imagery response type and fixture are generated
from the backend schema (`backend/scripts/generate_frontend_contracts.py`), with CI drift checks.
Other frontend API types are currently handwritten; a complete generated client remains a target.

WP9's batch save adds optional `deleted_ids` to `POST /plans/{id}/features:batch`.
Upserts and plan-scoped deletions are atomic; omitted feature IDs are preserved. Layer metadata
continues through separate idempotent PATCH requests. See [`DESIGN_EDITOR.md`](DESIGN_EDITOR.md)
for the client save/retry protocol and its transaction boundaries.

```
POST   /auth/register                 POST /auth/login   POST /auth/refresh   POST /auth/logout
GET    /auth/me

GET    /sites                         list my sites
POST   /sites                         create from {name, coordinates:[[lng,lat],…]}
GET    /sites/{id}                    includes boundary, centroid, area, utm_epsg, bbox
PATCH  /sites/{id}                    DELETE /sites/{id}

GET    /sites/{id}/imagery/{z}/{x}/{y}.png     proxied+cached tile (provider chosen server-side)
GET    /sites/{id}/imagery/meta                attribution, provider, max zoom, available flag

POST   /sites/{id}/terrain            trigger DEM fetch + slope/contour derivation (async → job id)
GET    /sites/{id}/terrain            status + results (slope legend, contour GeoJSON / tile URL)

GET    /sites/{id}/plans              POST /sites/{id}/plans
GET    /plans/{id}                    full plan with layers
PATCH  /plans/{id}                    DELETE /plans/{id}

GET    /plans/{id}/features           POST /plans/{id}/features        (GeoJSON in/out)
PATCH  /features/{id}                 DELETE /features/{id}
POST   /plans/{id}/features:batch     bulk upsert (editor saves many at once)

GET    /element-types                 seeded palette catalog
POST   /features:measure              {geometry} → {length_m, area_m2}  (authoritative, no save)

GET    /plans/{id}/export?format=png|pdf|geojson
```

Conventions: cursor/offset pagination, RFC-7807 problem+json errors, idempotent batch upsert
keyed by client-supplied feature UUIDs (so the editor can save offline-drawn features safely).

---

## 7. Region resolution & data providers

The riskiest, most region-dependent part — so it is the most abstracted. This is also the
seam that makes **"East Africa now, Europe (and anywhere) later" a config change, not a rewrite.**
Expansion must never require touching core logic — only adding an adapter and a region profile.

### 7.0 Region resolution — the country-first design

**User flow:** onboarding asks for the **country** first (and the resolver can also reverse-derive
it from entered coordinates to validate/auto-select). The country is stored on the user and on each
site, and drives which sources we pull from and sensible map defaults (center, zoom, units).

**Three layers, so adding a region is data, not code:**

1. **Provider adapters** (code) — each wraps one external source and declares its metadata
   (see interfaces below). The *only* thing new regions may require.
2. **Region profiles** (data — seeded in DB/config, not hardcoded) — per country/region, an ordered
   **provider chain per category**, plus defaults:
   ```yaml
   # region_profiles (data)
   KE:   # Kenya
     imagery:   [esri_world_imagery, sentinel2_cloudless]   # ordered: primary, fallback
     elevation: [copernicus_dem_glo30]
     climate:   []            # future categories plug in here
     defaults:  { units: metric }
   DE:   # Germany (example of a later, cleaner-licensed expansion)
     imagery:   [de_dop_orthophoto, esri_world_imagery]
     elevation: [de_dgm1, copernicus_dem_glo30]
   "*":  # global fallback profile — always resolvable anywhere
     imagery:   [sentinel2_cloudless]
     elevation: [copernicus_dem_glo30]
   ```
3. **Resolver** (code, generic) — given a site's country + bbox and a category, returns the first
   adapter in the chain that `covers()` the bbox, falling back down the chain and finally to `"*"`.
   Categories are open-ended (`imagery`, `elevation`, `climate`, `soil`, `species`, …), so new kinds
   of region-specific *information* plug in without changing the resolver.

**Adding Europe later** = add any missing adapters + add region profiles. No changes to the resolver,
the planning domain, or the frontend. That is the "don't block ourselves" guarantee, made concrete.

### 7.1 Imagery provider interface

Every provider — of any category — exposes license/attribution metadata so rights can be surfaced
to users (see §7.4) and caching can respect each source's terms.

```python
class DataProvider(Protocol):            # shared base for every category
    key: str                             # stable id used in region profiles, e.g. "esri_world_imagery"
    category: str                        # "imagery" | "elevation" | "climate" | ...
    attribution: str                     # human-readable credit line shown in-app
    license: str                         # SPDX id or short name, e.g. "CC-BY-4.0", "Esri ToS"
    terms_url: str                       # link users can open to verify rights
    cacheable: bool                      # may we store responses? (per the source's ToS)
    def covers(self, bbox: BBox) -> bool: ...

class ImageryProvider(DataProvider):     # category = "imagery"
    max_zoom: int
    async def get_tile(self, z: int, x: int, y: int) -> bytes | None: ...
```

- **Default:** `EsriWorldImageryProvider` (XYZ tiles, attribution required). Best free resolution,
  good coverage across Kenya/Tanzania, **no API key** needed.
  - **License honesty:** Esri's terms are grey for a standalone *commercial* product (community
    reading: fine within Esri's ecosystem; a commercial product may need an ArcGIS subscription).
    **Fine for a private/personal tool (our v1).** Persistently caching Esri tiles likely violates
    their ToS, so the Esri adapter declares `cacheable = False` — the proxy still fronts it (provider
    hiding, attribution, rate control) but does not store its tiles.
- **License-clean keyless fallback:** `Sentinel2CloudlessProvider` (EOX, CC-BY, WMTS, no key,
  **cacheable**) — ~10 m resolution. The swap target if the product is ever commercialized and the
  Esri license is a concern; coarser, but legally unambiguous.
- **Expansion adapters (later, config-selected by region):** Mapbox/MapTiler Satellite (free tier,
  needs a key), Bing, national orthophoto WMS where they exist (e.g. Germany DOP), user-uploaded
  drone orthophotos / OpenAerialMap for high detail on a single site.
- **Proxy + cache:** backend serves `/sites/{id}/imagery/{z}/{x}/{y}.png`. It picks the provider
  (per region/config), fetches upstream, returns the tile with correct attribution via `.../imagery/meta`,
  and caches **only when the provider's adapter declares `cacheable = True`**. Respecting each
  provider's ToS on caching and attribution is a documented, enforced per-adapter property.

### 7.3 Elevation provider interface

```python
class ElevationProvider(DataProvider):   # category = "elevation"
    resolution_m: float
    async def get_dem(self, bbox: BBox) -> RasterRef: ...   # GeoTIFF for the site bbox
```

- **Default:** Copernicus DEM **GLO-30** (~30 m) read directly from the **public AWS Open Data
  bucket** `copernicus-dem-30m` (eu-central-1) via **anonymous, unsigned** S3 requests — **no AWS
  account, no key, no cost**. Cloud-Optimized GeoTIFFs, so we fetch only the window covering the
  site bbox. (Caveats: a few countries' tiles are unreleased; ocean = 0.) Self-hosted **OpenTopoData**
  (Docker, keyless) is the documented alternative/offline path.
- **Terrain is light by design:** a permaculture site bbox at 30 m is a tiny raster (a 1 km² site ≈
  33×33 px). Slope + contours on that is a milliseconds-scale `numpy`/`rasterio` computation — **not**
  heavy GIS. So it runs as a **FastAPI background task** (lean v1; the optional arq worker from §3 is
  only needed for high-res DEMs or heavy batch work).
- **Cache by geographic inputs:** derive terrain when requested and store contours as
  `MULTILINESTRING` + a slope overlay. Reuse matching bbox/country inputs and contour interval;
  rederive after geographic or provider changes. GET hides results for old geographic inputs.
  Each attempt has a job UUID checked by every background write, fencing superseded tasks.
  Padded DEM requests are bounded to 1,000,000 estimated cells and 16 source tiles before I/O.
  The editor performs **no** terrain math, which keeps it smooth on a small instance.
- **Derivation:** load the DEM window with `rasterio`, compute **slope** (°/%) and **contour lines**
  at a configurable interval (e.g. 1 m / 5 m), simplify, store.
- **Philosophy — planning aid, not survey instrument:** 30 m slope/contours show where water flows
  and where it's steep — enough to place swales, zones, and beds sensibly. We deliberately skip
  cm-accuracy, cut/fill volumetrics, etc. Those become an **optional, opt-in "pro" sharpening** via a
  user-uploaded drone/survey DEM later — never in the default, fast path.

> **Note for implementers:** `rasterio`/GDAL need the GDAL system libraries. In lean v1 they live in
> the **backend** image (GDAL-provisioned base, e.g. `ghcr.io/osgeo/gdal`, or `libgdal-dev`); in the
> scale-up profile they move to the worker image. The computation is small, so this is not a hot path.

### 7.4 Attribution & rights (surfaced to users)

Because this is a free tool that people must be able to trust, **every source's rights are visible
in the app** and generated from the same provider metadata so they never drift:

- **Always-on map attribution control** — shows the active provider's `attribution` line (e.g.
  "Esri, Maxar, Earthstar Geographics", "© EOX Sentinel-2 cloudless (CC-BY-4.0)",
  "Copernicus DEM © ESA").
- **"Data sources & credits" page** — lists each provider actually used, its `license`, and a clickable
  `terms_url`, rendered straight from the registry metadata so adding an adapter auto-updates the page.
- **Canonical rights reference:** [`docs/DATA_SOURCES.md`](DATA_SOURCES.md) documents every source, its
  license, required attribution, caching stance, and terms link — the single place to audit rights.
- **Caching respects terms:** the proxy caches a response only if its provider declares `cacheable = True`
  (Esri = `False`; Sentinel-2 cloudless & Copernicus DEM = `True`).

For the **East Africa default**, Esri World Imagery is used with full attribution; for a *free,
non-commercial, educational/humanitarian* deployment this is the common, defensible practice, and the
resolver lets a deployment flip to the license-clean Sentinel-2 cloudless default via config. As we
expand to regions with open national orthophotos (e.g. Europe), those are both higher-resolution **and**
cleaner-licensed — expansion improves rights clarity, not worsens it.

---

## 8. Frontend architecture

```
frontend/src/
├── app/            # app shell, router, providers, query client, auth guard
├── features/
│   ├── auth/           # login/register UI + hooks
│   ├── site-setup/     # enter coordinates → boundary → fetch imagery → create site
│   ├── map/            # MapLibre wrapper, layer registry, imagery+terrain layers
│   ├── design-editor/  # the core: tools, Terra Draw integration, element palette,
│   │                   # measuring, layer panel, selection, save (batch upsert)
│   └── sites-dashboard/# list/manage my sites & plans
├── entities/       # typed domain models + generated API client
├── shared/         # ui kit, hooks, geo helpers (turf wrappers), config
```

- **Map as the substrate:** one `<MapView>` owns the MapLibre instance. Imagery is a raster
  source pointed at the backend proxy. Design features are GeoJSON sources, one per layer
  (zones, sectors, elements, paths), toggleable and reorderable.
- **Editor state (Zustand):** active tool, active layer, current selection, in-progress draft
  geometry, measurement readout. Kept separate from server state so undo/redo and tool switching
  are snappy.
- **Server state (TanStack Query):** sites/plans/features fetched and mutated; the editor saves
  via the batch-upsert endpoint with client-generated feature UUIDs, enabling optimistic updates.
- **Measuring UX:** live geodesic readout via Turf while drawing; on save the backend confirms
  authoritative length/area. A dedicated measure tool (ruler / area) uses the same path.
- **Element placement:** palette (from `/element-types`) → click/drag onto the map → a point (or
  sized footprint) feature with the element type's default style; draggable, rotatable, editable.

---

## 9. Testing strategy (the "testable" requirement, concretely)

- **Backend unit tests** — services and geo utilities in isolation; fast, no DB (`pytest`).
- **Backend integration tests** — real PostGIS via **Testcontainers** (spin up `postgis/postgis`),
  exercise repositories + routers through the ASGI app (`httpx.AsyncClient`). This is where
  geometry round-trips and measurement accuracy are asserted against known fixtures.
- **Provider contract tests** — each imagery/elevation adapter verified against a recorded
  fixture (VCR-style) so new adapters must satisfy the same interface before merge.
- **Frontend unit/component** — Vitest + React Testing Library for hooks, state, pure components.
- **Frontend map/editor** — Playwright e2e against a seeded backend for the critical flows
  (define land → see imagery → draw a zone → place a house → measure → save → reload).
- **CI gate:** lint (ruff + mypy; eslint + tsc) → unit → integration → e2e on PRs. Every work
  package is "done" only with tests and green CI. Target ≥80% coverage on `service.py`/domain logic.

---

## 10. Deployment (Docker Compose on Coolify)

Two profiles. **Start with Lean v1** — it is what a modest Coolify instance wants.

**Lean v1 (recommended, ~3 containers):**

```yaml
# infra/docker-compose.yml (sketch)
services:
  db:        # postgis/postgis:16-3.4 — persistent volume
  backend:   # uvicorn/gunicorn FastAPI (incl. GDAL/rasterio); terrain via background task;
             # runs migrations on deploy; short-lived cache in Postgres
  frontend:  # nginx serving the built Vite SPA; proxies /api to backend
```

**Scale-up (add later, only when needed):**

```yaml
  redis:     # cache + arq queue
  worker:    # arq worker with GDAL — high-res terrain, heavy export rendering, batch jobs
```

Add the scale-up services when high-res DEMs, heavy exports, or real concurrency arrive; the
module boundaries mean this is a config/infra change, not a code rewrite. **No external service in
either profile requires a paid plan or an API key** in the default provider config (Esri imagery +
Copernicus DEM from AWS Open Data are both keyless; see §7).

- **Coolify** deploys from this compose file; secrets (provider keys, JWT secret, DB creds) come
  from Coolify-managed env vars — never committed. `infra/.env.example` documents every variable.
- **Migrations** run as a release step before the new backend serves traffic.
- **Observability:** structured JSON logs, `/healthz` + `/readyz`, request IDs. Sentry optional.
- **Config** via Pydantic `Settings` (12-factor); one `Settings` object, validated at boot.

---

## 11. Build sequence & agent workflow

Implementation is sliced into self-contained **work packages** (see
[`WORK_PACKAGES.md`](WORK_PACKAGES.md)). Each package names its goal, deliverables, the
interfaces it must honor, its dependencies, and its acceptance tests — enough for a Sonnet or
Codex agent to execute it with little back-and-forth. Opus owns this document and the package
specs; implementing agents own the code inside a package and must not change a published
interface without an architecture update.

**Critical path:** WP0 scaffolding → WP1 backend core → (WP2 auth ∥ WP3 sites) → WP4 imagery →
WP7 frontend shell → WP8 site-setup flow → WP6 planning domain → WP9 design editor →
WP5 terrain → WP10 terrain viz → WP11 export → WP12 deploy. Packages marked ∥ can run in parallel.

---

## 12. Open decisions (tracked, not yet fixed)

1. **Map engine final call** — MapLibre (recommended) vs Leaflet+Geoman (faster MVP). Default: MapLibre.
2. **Auth build vs buy** — `fastapi-users` vs hand-rolled OAuth2/JWT. Lean: wrap `fastapi-users`.
3. **Persistent tile cache medium** — Redis-only vs Redis + Postgres/disk. Decide when cache size is known.
4. **Slope overlay transport** — pre-rendered raster tiles vs vector contours only. Start with contours (vector) + a simple slope color overlay.
5. **Element footprints** — points with icons (v1) vs scaled polygons with rotation (v1.1).
6. **Software license** — the project is free-forever and non-commercial in spirit. Recommend an OSI
   open-source license; leaning **AGPL-3.0** (anyone who hosts a modified version must share their
   source, keeping it open for everyone), with **Apache-2.0/MIT** as the permissive alternative if
   broad reuse matters more than copyleft. Owner's call — add a `LICENSE` file once decided.
7. **East Africa imagery default** — **Esri World Imagery** (keyless, best resolution) with full
   attribution and no caching, acceptable for a free non-commercial deployment; a deployment can flip
   the default to license-clean **Sentinel-2 cloudless** via region-profile config. Revisit only if the
   project ever goes commercial.

Record changes to these as short ADR entries appended to this section.
