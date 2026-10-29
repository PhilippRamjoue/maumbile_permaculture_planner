# Claude handoff — 29 October 2026

## Current state

The owner requested an independent check of `AUDIT_2026-10-29.md`, then authorized fixing all
actionable findings from that audit and the second review. Implementation and the complete local
preflight are finished. There are no known failing checks or outstanding implementation blockers
within that scope. This is not a guarantee that the application has no undiscovered defects.

**All implementation changes are still uncommitted in the shared working tree**, based on
`85a0732`. Nothing was pushed, tagged, released or deployed by this work. Preserve the new files
as well as tracked modifications and the two intentional barrel deletions. The original Claude
audit was already untracked when the review started; it was preserved unchanged.

This handoff supersedes the October 27 handoff's instructions about an unfinished panel task and
WP10/WP11 being next. Those statements are historical; do not restart that older work.

Read:

1. [Implementation and verification](AUDIT_FIXES_2026-10-29.md).
2. [Independent audit and corrections](AUDIT_SECOND_REVIEW_2026-10-29.md).
3. [Architecture](ARCHITECTURE.md), especially the October 29 contracts.
4. [Contributing](../CONTRIBUTING.md) and [releasing](RELEASING.md).

## What changed

- **Draft lifetime:** background refresh failures for site/design/catalogue/session retain the
  mounted editor. An expired session in an already-open editor retains the draft and offers
  sign-in in another tab plus a session retry. Initial anonymous visits still redirect to login;
  server ownership checks remain authoritative.
- **Layer routing:** standard layers have immutable nullable roles, independent of their names.
  Drawing resolves the actual feature family's destination, reveals it if hidden and errors if
  it is missing. Path/annotation palette entries and parametric sectors follow this policy.
- **Exports:** plan/layers/features come from the locked design snapshot. The DB transaction ends
  before rendering. PNG/PDF preserve metric path widths and planting rows; stacking matches the
  editor. GeoJSON includes layer roles.
- **Editor structure:** `useEditorPersistence` owns the one revision queue, all save domains,
  autosave, flush and navigation blocking. `EditorSaveFeedback` owns recovery/leave presentation.
  `useEditorShortcuts`, `useActiveLayer`, `useImageryBasemap`, `useSectorAdding` and `MapControlBar`
  separate their respective concerns. Workspace shrank from 895 to 579 lines.
- **Map rendering:** pure `designLayerSpecs` use the existing `LayerSynchronizer` through its new
  `syncSpecs` entry point. Selection/geometry update existing GeoJSON sources; visibility and
  stacking no longer require destroying them. Preserve drawing/boundary/sector handles on top.
- **Resource ownership:** lifespan closes shared HTTP and DB resources. Terrain services receive
  repositories and a repository-context factory; session construction and rollback moved out of
  the service, retaining every generation guard.
- **Guardrails:** explicit pinned type/test dependencies; Hooks lint; Knip in CI; four stronger
  mypy flags; AST private-module/framework boundary checks including relative imports. Two unused
  barrels and unnecessary exports were removed. Generated schema exports remain generator-owned.
- **Operations:** safe preference-storage helper; matching source versions (`0.4.1`); backend
  OpenAPI version derived from pyproject, with release-tag stamping for both images; CI version
  check; full local release preflight; HTTPS/bounded package downloads in the backend image.

The two audits are not literal deletion checklists. The second review corrects the "15 phantom
dependencies" count, the mega-effect/imagery claim, stale test counts and proposed zoom-alias
collapse. Distinct imagery/framing policies and generated exports were intentionally preserved.
Further splitting Workspace just to reach 300 lines is not required to complete this work.

## Migration and compatibility

New additive migration: `backend/app/migrations/versions/0015_layer_roles.py`.

- Adds nullable `layers.role`, valid-role checks and per-plan role uniqueness.
- Backfills one layer per existing standard name deterministically; preserves IDs and data.
- Custom layers and duplicate standard names remain unassigned. Duplicate plans copy roles.
- A standard layer renamed **before** this migration cannot be reliably inferred from its name.
  It remains unassigned rather than guessing. Inspect actual data before rollout; if such plans
  exist, map their intended roles explicitly after confirming the intended destinations. Do not
  automatically assign roles to arbitrary custom layers or reset plans to repair them.

Deploy matching backend/frontend images together and apply the normal Alembic upgrade after a
backup. Source versions remain `0.4.1`; these new changes are recorded under **Unreleased** in
CHANGELOG. Choose the next release version when preparing an authorized release.

Keep the single queued, revision-guarded design write protocol and the legacy-write rejection
after protection. Site boundaries have a separate concurrency token and are shared across plans;
the export design lock does not turn them into plan-owned data.

## Verification completed

The final `scripts/preflight.py` run exited successfully on the completed source:

- **250 backend tests passed; 1 opt-in live DEM test skipped.** Includes disposable PostGIS,
  migration upgrade/downgrade on legacy rows, concurrent export/save and lifecycle regressions.
- **488 frontend tests passed across 51 files.** Includes draft preservation across four refresh
  errors and session expiry, layer routing and stable rendering-source operations.
- **13 Chromium acceptance tests passed** against freshly built containers, including real editor
  draft preservation after reconnect failure and renamed/hidden destination-layer drawing.
- Ruff lint/format, mypy, TypeScript, ESLint Hooks, private-module checks, source versions and
  generated contract drift passed. Knip found no unused-code issues; npm audit found zero
  vulnerabilities. Clean locked installs and both container builds passed.
- `git diff --check` was clean at handoff preparation. Subsequent handoff edits are documentation.

Known non-failing observations: Rasterio dependency deprecation warnings, an expected jsdom
canvas-fallback diagnostic, and MapLibre's bundle-size advisory. Live upstream DEM/tile availability
was not tested; those checks remain explicit opt-ins.

## Running verification again

From the repository root, with Python 3.11+, uv, Node 22.12+, Docker and Chromium installed:

```text
python scripts/preflight.py
```

On the current Windows machine the default `python` is older, so the verified invocation is:

```powershell
.\backend\.venv\Scripts\python.exe scripts/preflight.py
```

Install Chromium once if needed: `cd frontend; npx playwright install chromium`.
Preflight uses a unique `permaculture-preflight-<random>` Compose project and port **28080**,
disables SMTP, then removes only its own test containers/network/database volume. Both projects
created during this work were checked and have no remaining containers or volumes. Build images
and normal Docker build caches may remain.

**Never reset or remove the preserved `permaculture-verify` database volume.** Backend integration
tests must keep using disposable Testcontainers. In this Windows environment pytest/uv needed
execution outside the filesystem sandbox; that was an environment restriction, not a test failure.

## What remains

No additional audit fix is currently required before human review. The remaining steps are review
of the working-tree diff, inclusion of the new files, committing, and any separately authorized
release/deployment. Before deployment, check whether historical renamed layers need explicit role
mapping, back up production and deploy both sides together. No production inspection or migration
was performed in this task.

Do not rerun or broaden every test merely because this handoff exists. Run relevant regressions
after changes and the full preflight before release. Preserve the recorded results as historical
evidence rather than describing them as CI runs against an already-committed branch.
