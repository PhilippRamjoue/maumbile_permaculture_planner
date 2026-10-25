# Maumbile — design your land

_Maumbile is the app's name; the repository and packages keep the working name `permaculture_planner`._

A web application for planning permaculture sites visually, on real georeferenced
aerial imagery. Define your land by its coordinates, pull in satellite imagery and
terrain, then design: trace **zones** and **sectors**, place **elements** (house,
beds, trees, water, paths), and **measure** distances and areas accurately.

> Status: **in development** — backend (auth, sites, regions, imagery proxy, planning, terrain) and
> frontend (shell, auth, dashboard, map, country-first site setup, design editor) are implemented and
> tested; terrain visualization and exports are next. For the current state, how to run/test, and known
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
