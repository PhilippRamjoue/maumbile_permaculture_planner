# Maumbile — design your land

_Maumbile is the app's name; the repository and packages keep the working name `permaculture_planner`._

A web application for planning permaculture sites visually, on real georeferenced
aerial imagery. Free and open source ([AGPL-3.0](LICENSE)), built as a public good. Define your land by its coordinates, pull in satellite imagery and
terrain, then design: trace **zones** and **sectors**, place **elements** (house,
beds, trees, water, paths), and **measure** distances and areas accurately.

## Run it yourself in ~5 minutes

You need Docker (with Compose v2) and nothing else: the images are prebuilt and published to GitHub
Container Registry, so there is no build step, no API key and no paid service.

```bash
git clone --depth 1 https://github.com/PhilippRamjoue/permaculture_planner.git maumbile
cd maumbile/infra
cp .env.example .env
# Set the two required secrets (random values, generated here; they stay in your local .env):
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|; s|^APP_SECRET_KEY=.*|APP_SECRET_KEY=$(openssl rand -hex 32)|" .env
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml -f docker-compose.local.yml up -d
```

Open <http://localhost:8080>, register, and create your first site. The database lives in the
`pgdata` Docker volume, so it survives restarts and upgrades.

- **On a server with a domain:** leave out `docker-compose.local.yml` (it publishes localhost ports
  and relaxes cookie security), put the `frontend` service's port 80 behind an HTTPS reverse proxy
  (Coolify, Caddy, Traefik, ...) and set `APP_CORS_ORIGINS` to your public origin. Cookies are
  `Secure` by default, so the site must be served over HTTPS. Steps: [`docs/DEPLOY.md`](docs/DEPLOY.md).
- **Upgrade:** `docker compose -f docker-compose.yml -f docker-compose.ghcr.yml pull` then `up -d`
  (migrations run automatically). Pin `MAUMBILE_VERSION=0.1.0` in `.env` to stay on a release.
- **Back up** the database regularly: [`docs/OPERATIONS.md`](docs/OPERATIONS.md).
- **Not on Linux/amd64?** Build from source instead: `docker compose -f docker-compose.yml -f docker-compose.local.yml up --build`.

> Status: **v0.1** — feature-complete first release (accounts, sites, imagery, terrain, design editor,
> exports) and still evolving; see [`CHANGELOG.md`](CHANGELOG.md). For the current state, how to run/test, and known
> deferrals, see **[`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md)**. Design lives in
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md); the task plan in [`docs/WORK_PACKAGES.md`](docs/WORK_PACKAGES.md).
>
> Review fixes and rationale: [`docs/REVIEW_FOLLOWUP_2026-10-21.md`](docs/REVIEW_FOLLOWUP_2026-10-21.md).
> Claude/agent entry point: [`CLAUDE.md`](CLAUDE.md).

## Vision

Make permaculture design approachable for anyone, anywhere — starting in East
Africa (Kenya, Tanzania) — with a tool that is genuinely accurate (real-world
coordinates and measurements) yet easy and pleasant to use.

## Tech at a glance

| Layer        | Choice                                                            |
|--------------|-------------------------------------------------------------------|
| Frontend     | React + TypeScript + Vite, MapLibre GL JS, Terra Draw, Zustand, TanStack Query |
| Backend      | Python, FastAPI, SQLAlchemy 2.0, GeoAlchemy2, Pydantic v2, Alembic |
| Database     | PostgreSQL + PostGIS                                               |
| Cache/queue  | Postgres cache in lean v1; Redis + arq worker added only when load needs it |
| Imagery      | Pluggable providers — default **Esri World Imagery** (keyless; not cached)  |
| Elevation    | Pluggable providers — default **Copernicus DEM GLO-30** (~30 m, keyless, AWS Open Data) |
| Deploy       | Docker Compose on Coolify — lean 3-container v1 (db + backend + frontend)  |

**Cost: zero.** No external service in the default config needs a paid plan or an API key.

## Configuration and secrets

**Nothing secret is stored in this repository.** All instance configuration and secrets
(`APP_SECRET_KEY`, `POSTGRES_PASSWORD`, `APP_CORS_ORIGINS`, your domain) live in **Coolify's
environment variables** (or a local, git-ignored `.env` file) — never in git. One public repository
is safe because config is externalized ([12-factor](https://12factor.net/config)): Compose reads
`${VAR}` placeholders, `.env*` is git-ignored (only [`infra/.env.example`](infra/.env.example) with
`change-me` placeholders is tracked) and excluded from Docker builds. `maumbile.ecosoul.tech` in the
docs is just an example origin. Details: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Repository layout (target)

```
permaculture_planner/
├── README.md
├── docs/
│   ├── ARCHITECTURE.md        # system design, modules, data model, geo strategy
│   ├── PROJECT_STATUS.md      # what's built, how to run/test, known deferrals (review guide)
│   ├── DATA_SOURCES.md        # every data source: license, attribution, rights
│   └── WORK_PACKAGES.md       # sequenced, self-contained tasks for AI agents
├── backend/                   # FastAPI modular monolith
├── frontend/                  # React + Vite SPA
├── infra/                     # docker-compose, Coolify config, env templates
└── .github/workflows/         # CI
```

## Core principles

- **Modular monolith** backend with clear bounded contexts; extract workers only where load demands it.
- **Region-resolved, pluggable providers** — country-first; imagery/elevation/data sources are chosen
  by a region profile (data, not code), so adding a new region is config, not a rewrite.
- **Rights are visible** — every source carries license + attribution metadata shown in-app; free, no keys.
- **Georeferenced everything** — geometry stored in WGS84, measured in a local projection.
- **Testable by construction** — every module ships with unit + integration tests; providers have contract tests.
