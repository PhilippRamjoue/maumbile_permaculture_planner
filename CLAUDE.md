# Project context for Claude and other coding agents

Read these before changing behavior:

0. [2026-10-27 handoff](docs/CLAUDE_HANDOFF_2026-10-27.md): committed audit fixes and your
   remaining uncommitted panel task; start here when continuing this work.
1. [Architecture](docs/ARCHITECTURE.md): intended boundaries, geometry and API conventions.
2. [Project status](docs/PROJECT_STATUS.md): completed packages and deliberate deferrals.
3. [2026-10-21 review follow-up](docs/REVIEW_FOLLOWUP_2026-10-21.md): bugs fixed, rationale,
   migration behavior, verification, and remaining debt.
4. [Design editor](docs/DESIGN_EDITOR.md): WP9 implementation, controls, save semantics and tests.
5. [Work packages](docs/WORK_PACKAGES.md): terrain overlays (WP10) and export (WP11) remain next.

Key implementation constraints:

- Imagery metadata uses **`covered` / `provider_key`**, not `available` / `provider`.
  Its TypeScript response type and test JSON are generated from backend models. Run
  `cd backend && uv run python scripts/generate_frontend_contracts.py` after contract changes;
  CI runs the same script with `--check`. Do not hand-edit those generated files.
- Terrain is cached against its **bbox and country**, with provider checks on POST and a
  distinct job UUID for each attempt. Preserve the generation guard in every background write.
  Site boundaries are editable; never assume that a site's terrain is permanently valid.
- DEM extent limits must run before opening upstream tiles and before raster allocation.
- Batch feature writes are atomic. UUID conflict guards must also prevent cross-plan readback.
  Optional `deleted_ids` are applied in the same transaction as upserts; omitted ids are preserved.
  The editor now uses `GET/PUT /plans/{id}/design`: a consistent snapshot and one atomic,
  revision-guarded transaction for feature deletions/upserts, layer changes and goals. Its writes
  share a client queue. Legacy writes advance the revision, and are rejected after a plan has
  entered protected saving; keep this guard so old tabs cannot overwrite newer work.
- Use `sites.dependencies.OwnedSite` for imagery/terrain access, rather than importing the
  sites router or ORM model. Services remain independent of FastAPI.
- Add a new Alembic migration for schema changes; never rewrite migrations already deployed.
- Test with disposable PostGIS databases. The verification Compose override uses separate
  ports and an explicit project name; do not reset a user's existing database to run tests.

See [CONTRIBUTING.md](CONTRIBUTING.md) for commands. The default browser tests stub tile images
only; authentication, site creation, metadata, routing, and the built app use the real stack.
`E2E_LIVE_TILES=1` opts into real upstream tiles. Live Copernicus tests remain opt-in.

The local `permaculture-verify` stack now contains an owner-requested account and is being
preserved. Do not remove its database volume or reset it while running tests. Backend integration
tests must continue using disposable Testcontainers databases; CI has a separate project name.
