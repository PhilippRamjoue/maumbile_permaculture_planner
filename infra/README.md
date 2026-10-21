# Infra

Docker Compose for local dev and Coolify deployment.

```bash
cp .env.example .env            # set POSTGRES_PASSWORD etc.
docker compose up --build       # frontend :8080 · backend :8000 · db :5432
```

- **Lean v1** (`docker-compose.yml`): db + backend + frontend. Backend runs Alembic
  migrations on start, then serves.
- **Scale-up** (`docker-compose.scale.yml`): adds Redis + a worker when load needs it:
  `docker compose -f docker-compose.yml -f docker-compose.scale.yml up --build`.

## Coolify

Point a Coolify "Docker Compose" resource at `infra/docker-compose.yml`. Set the env vars
from `.env.example` as Coolify secrets. The frontend container serves the SPA and proxies
`/api` to the backend.
