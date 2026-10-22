# Backend image on python:3.12-slim. rasterio ships manylinux wheels with a bundled GDAL (and
# certifi for HTTPS), so terrain (WP5) needs no system GDAL; Expat is installed below.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv

# uv provides fast, reproducible installs.
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv

WORKDIR /app

# Install dependencies first for better layer caching.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# rasterio bundles GDAL, but its Linux wheel still links the system Expat runtime.
RUN apt-get update && apt-get install -y --no-install-recommends libexpat1 \
    && rm -rf /var/lib/apt/lists/* \
    && .venv/bin/python -c "import rasterio"

COPY . .

EXPOSE 8000
CMD ["uv", "run", "--frozen", "--no-dev", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
