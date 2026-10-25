# Deploying on Coolify (runbook)

Lean v1: **db** (PostGIS) + **backend** (FastAPI; applies Alembic migrations, then serves) +
**frontend** (nginx: SPA + `/api` proxy). One Compose file, [`infra/docker-compose.yml`](../infra/docker-compose.yml);
no paid service or API key is needed (Esri imagery and Copernicus DEM are keyless, see
[`DATA_SOURCES.md`](DATA_SOURCES.md)). Architecture background: [`ARCHITECTURE.md`](ARCHITECTURE.md) §10.

## What the Compose file guarantees

| Concern | Behavior |
|---|---|
| Exposure | **No host ports published.** Only the frontend's container port 80 is meant to be reached (by Coolify's proxy). The database and API are internal to the Compose network. |
| Required secrets | `POSTGRES_PASSWORD` and `APP_SECRET_KEY` are `${VAR:?…}`: `docker compose config`/`up` and Coolify refuse to deploy if unset. The backend also refuses to boot in production with the built-in dev secret. |
| HTTPS cookies | `APP_COOKIE_SECURE` defaults to `true`. `APP_CORS_ORIGINS` defaults to `[]` (the SPA is same-origin through nginx); set it to the public origin. |
| Migrations | The backend command runs `alembic upgrade head` and only then starts uvicorn (`&&`). A failed migration exits the container, `/readyz` never passes, and the frontend (which `depends_on` backend health) never starts. |
| Ordering | `db` healthy (`pg_isready`) → `backend` healthy (`/readyz` runs a DB query) → `frontend` healthy (HTTP 200 on `/`). |
| Restarts | `restart: unless-stopped` on all services. |
| Persistence | Named volume `pgdata` → `/var/lib/postgresql/data`. Redeploys keep it. |
| Logs | Docker `json-file` driver, rotated at 5 × 10 MB per service. |
| Client IP | uvicorn runs with `--proxy-headers`, so login throttling sees the real client IP from `X-Forwarded-For`, not nginx's container IP. |

Migrations are additive and idempotent (`alembic upgrade head` is a no-op when current). Never edit a
migration that has been deployed; add a new one.

## 1. Prerequisites

- A Coolify instance with a server that has ≥ 2 GB RAM (the backend image builds `rasterio`/`numpy`;
  the frontend build runs `npm ci`), and a DNS record for the public hostname pointing at it.
- The repository reachable from Coolify (public GitHub URL, or a GitHub App/deploy key for a private one).
- Two generated secrets (run anywhere):

  ```bash
  openssl rand -hex 24                                          # POSTGRES_PASSWORD (URL-safe!)
  python -c "import secrets; print(secrets.token_urlsafe(48))"   # APP_SECRET_KEY
  ```

## 2. Create the resource

1. **Project → New Resource → Public/Private Repository** (your Git source), pick the branch (`main`).
2. **Build Pack: Docker Compose.**
3. **Base Directory:** `/infra` · **Docker Compose Location:** `/docker-compose.yml`
   (the compose file's `build.context: ../backend` / `../frontend` is relative to `/infra`; if the
   build fails with a missing context, set Base Directory to `/` and Location to `/infra/docker-compose.yml`
   — Coolify's field labels vary slightly between versions).
4. Open the resource's **Domains** for the **frontend** service and enter the public URL **with the
   container port**: `https://maumbile.ecosoul.tech:80`. Coolify's Traefik proxy issues the Let's Encrypt
   certificate. Do **not** set a domain on `db` or `backend`.
5. **Environment Variables** (mark both secrets as such):

   | Variable | Value |
   |---|---|
   | `POSTGRES_PASSWORD` | generated, URL-safe (required) |
   | `APP_SECRET_KEY` | generated (required) |
   | `APP_CORS_ORIGINS` | `["https://maumbile.ecosoul.tech"]` |
   | `APP_COOKIE_SECURE` | `true` (default; leave it) |
   | `POSTGRES_USER`, `POSTGRES_DB` | optional (`postgres`, `permaculture`) |

   The full list with comments is [`infra/.env.example`](../infra/.env.example). **Set
   `POSTGRES_PASSWORD` before the first deploy:** Postgres only reads it when it initialises an
   empty volume.

## 3. First deploy

Click **Deploy**. Expect 5–10 minutes (image builds). In the deployment log you should see, in order:

1. `db` becomes healthy.
2. `backend`: Alembic prints `Running upgrade … -> 0009_element_type_icons` (the full chain on a fresh
   database; 0001 enables the PostGIS extension, which the `postgis/postgis` image permits), then
   `Uvicorn running on http://0.0.0.0:8000`.
3. `backend` and then `frontend` report **healthy**; the resource status turns *Running (healthy)*.

### Verify

```bash
infra/smoke-test.sh --remote https://maumbile.ecosoul.tech               # read-only checks
SMOKE_AUTH=1 infra/smoke-test.sh --remote https://maumbile.ecosoul.tech  # + registers a throwaway user
```

Then in a browser: register, create a site (**/sites/new**), confirm the satellite basemap and
attribution appear, generate terrain, export a PDF.

Check migrations explicitly from Coolify's **Terminal** for the backend (or `docker exec`):

```bash
/app/.venv/bin/alembic current      # → 0009_element_type_icons (head)
/app/.venv/bin/alembic history | head
```

> `/healthz` and `/readyz` are served by the backend only; nginx proxies just `/api`. They are
> therefore not reachable on the public URL — Coolify's container health status is the probe. From the
> backend terminal: `python -c "import urllib.request as u; print(u.urlopen('http://localhost:8000/readyz').read())"`.

## 4. Updating

Push to the tracked branch (enable Coolify's webhook for auto-deploy) or click **Redeploy**. Coolify
rebuilds, recreates the containers and the backend applies any new migrations on start. Always redeploy
the **whole** resource rather than restarting only the backend: nginx resolves `backend` once at start, so
a backend container that comes back with a new IP needs the frontend recreated too (a full redeploy
does that).

## 5. Rollback

Migrations are additive (new tables/columns), so older code runs against a newer schema.

1. In Coolify, redeploy the previous good commit (set the branch/commit, or revert on Git and redeploy).
2. The old backend runs `alembic upgrade head`; Alembic finds the database at a revision the old code
   doesn't know. If it errors with *Can't locate revision*, the previous image predates a migration that
   was already applied — in that case roll **forward** with a fix instead, or restore the database backup
   (below) taken before the deploy. Do not hand-edit `alembic_version` or drop tables to force it.
3. Verify as in §3.

**Back up before any deploy that adds a migration:**

```bash
# run on the server (container name from `docker ps`, e.g. db-<uuid>)
docker exec -t <db-container> pg_dump -U postgres -d permaculture -Fc > permaculture-$(date +%F).dump
# restore into an empty database: pg_restore -U postgres -d permaculture --clean --if-exists < file.dump
```

Coolify can also schedule volume/database backups; the user data lives only in the `pgdata` volume.

## 6. Imagery and elevation defaults

Providers are **data in code, not environment variables**: per-country chains live in
[`backend/app/modules/regions/seed.py`](../backend/app/modules/regions/seed.py) and the adapters in
`modules/imagery` and `modules/terrain`. Out of the box:

| Country | Imagery (primary → fallback) | Elevation |
|---|---|---|
| KE, TZ | Esri World Imagery → Sentinel-2 cloudless (EOX) | Copernicus DEM GLO-30 |
| everything else (`*`) | Sentinel-2 cloudless | Copernicus DEM GLO-30 |

No keys or accounts are involved. To change a default or add a country, edit `seed.py` (and the
row in [`DATA_SOURCES.md`](DATA_SOURCES.md) for new providers), commit, redeploy. The only related tunable
via environment is `APP_TERRAIN_CONTOUR_INTERVAL_M` (default 5 m). The deployment needs outbound HTTPS to
`services.arcgisonline.com`, `tiles.maps.eox.at` and `copernicus-dem-30m.s3.eu-central-1.amazonaws.com`.
Esri imagery is used under its terms for a free, non-commercial deployment with attribution (never
cached); switch the primary to Sentinel-2 cloudless if that ever changes.

## 7. Operating

**Logs** (Coolify → resource → *Logs*, per service, or `docker logs <container>`):

- Backend writes **one JSON object per line** (structlog): `{"method":"GET","path":"…","status":200,
  "duration_ms":12.3,"request_id":"…","event":"request","level":"info","timestamp":"…"}`. Probe paths
  `/healthz` and `/readyz` are logged only when they fail. Unhandled errors log `request_failed` with a
  traceback. Every response carries `X-Request-ID` (an incoming value is honoured), so a user-reported
  failure can be traced: grep the id in the backend logs.
- uvicorn's own start-up/shutdown lines are plain text; nginx writes its standard access log.
- Filter examples: `docker logs <backend> 2>&1 | grep '"status":5'` (server errors),
  `… | grep '"duration_ms":[0-9]\{4,\}'` (≥ 1 s requests), `… | grep terrain` (terrain jobs).

**What to watch**

| Signal | Meaning / action |
|---|---|
| Backend `unhealthy` or restarting | `/readyz` failing: database down, or a migration failed on start (read the first lines of the backend log). |
| 5xx rate in logs | Look at `request_failed` entries and their `request_id`. |
| Terrain stuck in *pending* | Background tasks run in the backend process; a restart drops in-flight jobs and the next request re-queues them. Check upstream reachability to the AWS DEM bucket. |
| Imagery tiles failing | Upstream (Esri/EOX) outage or blocked egress; sites fall back along the chain only when a provider doesn't cover the site. |
| Disk | `pgdata` growth (the imagery tile cache lives in Postgres) and Docker image/log accumulation on the host. |
| 429 on login | Per-IP/per-email throttle (10 attempts / 60 s, per process); expected under brute-force. |

**Rotating secrets.** `APP_SECRET_KEY`: change it in Coolify and redeploy — all users are signed out, no data
is lost. `POSTGRES_PASSWORD`: changing the variable alone breaks the backend (the database keeps the old
password); first run `ALTER USER postgres PASSWORD '…';` in the db container, then update the variable and
redeploy.

**Not included (deferred):** Sentry (optional in WP12) — add `sentry-sdk` and a DSN setting when error
alerting is wanted; the Redis/worker scale-up overlay (`infra/docker-compose.scale.yml`) is a placeholder
until heavy jobs exist; the backend runs a single uvicorn process (login throttling and background
terrain jobs are per-process, so do not add workers or replicas before moving that state to Redis).

## 8. Local smoke test (safe)

```bash
infra/smoke-test.sh
```

Builds and starts a **throwaway** stack under project name `permaculture-smoke-<random>` on ports
25432/28000/28080 with random secrets (overrides: [`docker-compose.smoke.yml`](../infra/docker-compose.smoke.yml)),
checks `/healthz`, `/readyz`, `X-Request-ID`, migrations at head, JSON logs, the SPA, the `/api` proxy and
a register → login → `/auth/me` flow, then runs `down -v` **on that generated project only** (the script
refuses any other project name). `SMOKE_KEEP=1` leaves it running. It never touches `permaculture-verify`,
whose database volume holds real data and must not be reset.
