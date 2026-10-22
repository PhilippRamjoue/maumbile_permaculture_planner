# Infra

Docker Compose for local dev, verification and the Coolify deployment.
**Deploying? Follow [`../docs/DEPLOY.md`](../docs/DEPLOY.md).**

```bash
cp .env.example .env            # set POSTGRES_PASSWORD and APP_SECRET_KEY (both required)
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
#   frontend :8080 · backend :8000/docs · db :5432 (all bound to 127.0.0.1)
```

- **Lean v1** (`docker-compose.yml`): db + backend + frontend, production-shaped: no host ports,
  required secrets (`${VAR:?}`), Secure cookies. The backend runs Alembic migrations on start, then serves.
  Health checks: db `pg_isready` → backend `/readyz` (a database query) → frontend HTTP 200.
- **Local** (`docker-compose.local.yml`): publishes localhost ports and allows non-HTTPS cookies. Never on a server.
- **Verification** (`docker-compose.verify.yml`, combined with the main file): disposable local
  tests on ports 15432/18000/18080 under an explicit project name. See the commands and migration notes in
  [`../docs/REVIEW_FOLLOWUP_2026-10-21.md`](../docs/REVIEW_FOLLOWUP_2026-10-21.md). The local
  `permaculture-verify` project holds real data: never `down -v` it.
- **Smoke test** (`smoke-test.sh` + `docker-compose.smoke.yml`): `./smoke-test.sh` builds a throwaway
  `permaculture-smoke-<random>` stack on ports 25432/28000/28080, checks it and removes only that stack;
  `./smoke-test.sh --remote https://your-domain` checks a deployed URL.
- **Scale-up** (`docker-compose.scale.yml`): adds Redis + a worker when load needs it:
  `docker compose -f docker-compose.yml -f docker-compose.scale.yml up --build`.

## Coolify

Create a Docker Compose resource from this repository (Base Directory `/infra`, file
`/docker-compose.yml`), put the secrets from `.env.example` into Coolify's environment variables and
attach the domain to the **frontend** service on port 80. Full steps, rollback, operating notes and the
imagery/elevation defaults: [`../docs/DEPLOY.md`](../docs/DEPLOY.md).
