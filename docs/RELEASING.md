# Releasing

Releases are tags. Pushing a tag `vX.Y.Z` runs
[`.github/workflows/release.yml`](../.github/workflows/release.yml), which builds the backend and
frontend images, pushes them to GitHub Container Registry and creates a GitHub release. Nothing
else is needed: the workflow authenticates with the built-in `GITHUB_TOKEN` (`packages: write`), so
no registry secret is stored anywhere.

| Image | Tags pushed |
|---|---|
| `ghcr.io/<owner>/maumbile-backend` | `X.Y.Z`, `X.Y`, and `latest` (not for pre-releases such as `v0.2.0-rc.1`) |
| `ghcr.io/<owner>/maumbile-frontend` | the same |

`<owner>` is the lowercased GitHub user/organisation that owns the repository. Images are
`linux/amd64`. The frontend image is domain-agnostic (the SPA calls `/api` same-origin), so the same
image runs on any domain; all configuration comes from environment variables at run time.

## Cutting a release

1. Make sure `main` is green (lint, types, tests, e2e).
2. Move the entries under `## [Unreleased]` in [`CHANGELOG.md`](../CHANGELOG.md) into a new
   `## [X.Y.Z] - YYYY-MM-DD` section and update the compare links at the bottom. The release
   workflow fails fast if the section for the tag is missing; its text becomes the release notes.
3. Optionally bump the version fields (`backend/pyproject.toml`, `frontend/package.json`, the
   FastAPI `version=` in `backend/app/main.py`) in the same commit.
4. Commit, then tag and push:

   ```bash
   git tag -a vX.Y.Z -m "Maumbile X.Y.Z"
   git push origin main vX.Y.Z
   ```

5. Watch the **Release** workflow. When it is green, the images are on GHCR and the release page
   exists.

Versioning: `MAJOR` for breaking changes to configuration or the API, `MINOR` for features, `PATCH`
for fixes. Database migrations are additive; see [`DEPLOY.md`](DEPLOY.md) §5 for rollback limits.

## First release only: make the packages public

GHCR creates a package as **private** on first push. So that self-hosters can pull without logging
in, open each package (GitHub → profile or organisation → *Packages* → `maumbile-backend`, then
`maumbile-frontend`) → *Package settings* → *Change visibility* → **Public**. Do this once; later
tags keep the setting. The images are labelled with the source repository, which links them to it.

## Deploying a release

- **Self-hosters:** [`../infra/docker-compose.ghcr.yml`](../infra/docker-compose.ghcr.yml) pulls the
  images; pin `MAUMBILE_VERSION=X.Y.Z` in your `.env` to control upgrades, or leave it at `latest`.
- **The hosted instance on Coolify:** see [`OPERATIONS.md`](OPERATIONS.md) → *Updating*.
