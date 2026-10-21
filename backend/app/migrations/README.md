# Migrations

Alembic migrations. The database URL comes from `APP_DATABASE_URL` via `env.py`.

```bash
uv run alembic upgrade head                 # apply
uv run alembic revision -m "add sites"      # new (hand-written)
uv run alembic revision --autogenerate -m "add sites"   # from model changes
```

Import new models in `env.py` so `--autogenerate` can see them.
