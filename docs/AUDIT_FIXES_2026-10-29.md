# Maintainability audit implementation — 29 October 2026

Implements the actionable findings from Claude's audit and the independent second review.
All changes are local; this work does not publish, tag or deploy a release.

## Correctness and draft ownership

- Initial-load failures still show errors. Failed background refreshes of site, design, catalogue
  or session data retain the mounted editor and its draft, with a visible refresh error.
- If a previously authenticated editor loses its session, the draft remains open. The owner can
  sign in in another tab, check the session and retry saving. New anonymous visits still redirect
  to login. Server ownership checks continue to govern every read/write.
- Standard layers have immutable nullable roles, independent of display names. Drawing resolves
  the actual feature family's destination, including path/annotation palette entries, and reveals
  it when hidden. A missing destination produces an error instead of reusing a previous layer.
  Parametric sector additions reveal their destination too.
- Export consumes the locked design snapshot, releases its transaction before rendering, and
  preserves metric path widths and planting rows. Higher `sort_order` draws on top in both the
  editor and PNG/PDF. GeoJSON includes layer roles as well as the stored feature properties.

## Structure and resource ownership

- `useEditorPersistence` owns the single revision queue, all three save domains, autosave, flush
  and navigation blocking. Save failures and draft-download/leave UI live in `EditorSaveFeedback`.
- Imagery-choice policy, sector adding, active-layer routing and keyboard lifecycle each have a
  cohesive hook. Whole-map controls live in `MapControlBar`.
- `designLayerSpecs` builds pure rendering specs. The shared `LayerSynchronizer` applies them
  incrementally: selection and geometry changes update GeoJSON on existing sources; visibility
  updates layout properties. Reordering/restacking preserves sources and drawing handles.
- Workspace is reduced from 895 to 579 lines; its persistence coordinator is 185 lines, and
  `useEditorMap` is reduced from 520 to 418 lines with pure style/spec building separated. The
  remaining Workspace code assembles the feature panels and presentation rather than duplicating
  save coordination. These are responsibility boundaries, not an arbitrary line-count gate.
- `safeLocalStorage` centralizes optional preference access. Storage failures retain in-memory
  behavior; no generic persisted-state framework is introduced.
- Application lifespan closes the shared upstream HTTP client and database engine. A later
  lifespan gets a fresh HTTP client.
- Terrain services receive repositories and a repository-context factory. Session construction
  and rollback live in repository/composition code; geographic generation guards are preserved.

## Guardrails and cleanup

- Added explicit, pinned dev dependencies for GeoJSON types, Turf distance and the MapLibre style
  expression evaluator. The latter two are currently used only by tests.
- Hooks lifecycle/dependency rules run as errors under ESLint. Intentional mount-time values in
  MapView and site setup are captured explicitly, preserving their existing lifecycle behavior.
- Knip runs in CI with no unused-code baseline suppressions. Removed two unused barrels and
  unnecessary exports/re-exports. Generated schema exports remain generator-owned and are
  excluded from pruning; their drift check remains active.
- Enabled `disallow_untyped_defs`, `disallow_incomplete_defs`, `warn_return_any` and
  `no_implicit_reexport`; fixed the production return type and test/fixture annotations.
- AST boundary checks reject cross-module private model/repository imports, including relative
  imports, and framework/router imports in services. The sole private-import exception is the
  explicitly named planning DI composition root. Public service adapters and pure catalogue
  dependencies remain allowed.
- Backend source version now matches frontend `0.4.1`. FastAPI reads pyproject metadata by
  default; release builds stamp both images from the release tag. CI checks source versions match.
- `python scripts/preflight.py` runs clean dependency installs, audits, lint/format/types,
  boundaries, generated contracts, both full suites, the frontend build and Chromium acceptance
  tests. It creates a unique disposable Docker project on port 28080, disables SMTP delivery and
  removes only its own containers/volume in `finally`.
- Backend image downloads use HTTPS mirrors and bounded retries/timeouts after an HTTP mirror
  download took over seven minutes during verification. Release-version arguments are applied
  after dependency installation so stamping an image does not invalidate those build layers.

The imagery zoom and framing zoom retain distinct meanings. The framing ceiling is explicit,
bounded by imagery coverage; equal values today are not a reason to erase that policy distinction.
Generated types and test-referenced helpers were not treated as automatically dead code.

## Migration and rollout

`0015_layer_roles` adds a nullable role and per-plan uniqueness/check constraints. Existing
standard names are backfilled deterministically; duplicate standard names and custom layers stay
unassigned. Existing plan/features, IDs and revisions are retained. Plan duplication copies roles.
An older, already-renamed standard layer cannot be inferred safely from its name; it remains
unassigned rather than silently treating a custom layer as a standard destination.

Deploy backend and frontend together after backing up production. Apply the normal Alembic upgrade;
no database reset is required. There is no change to the revision/legacy-write protection contract.
The preserved `permaculture-verify` project and its volume are not used by preflight.

## Verification

Regression coverage includes mounted draft lifetime after four refresh failures and expired
sessions; hidden/renamed/missing layer routing and palette feature types; retained rendering
sources through selection/geometry/visibility/order changes; PNG/PDF metric widths and bounded
planting rows; locked exports during concurrent writes; layer-role rename/duplication; legacy
data backfill/downgrade in a temporary table; repeated application lifespans; and architecture
rule violations. Browser regressions exercise reconnect failures and drawing into a renamed,
hidden destination against the built stack.

The complete final preflight passed:

- **250 backend tests passed**, one opt-in live DEM test skipped; PostGIS integration and all
  migrations ran against disposable databases.
- **488 frontend tests passed** across 51 files.
- **13 Chromium acceptance tests passed**, including both new regressions, against the freshly
  built containers.
- Ruff lint/format, stronger mypy checks, TypeScript, ESLint Hooks rules, AST boundaries, source
  version checks and generated-contract drift checks passed. Knip reported no unused-code issues;
  npm audit reported zero vulnerabilities. Clean npm/uv installs and both image builds succeeded.
- The disposable preflight containers, network and database volume were removed after testing.

Live upstream DEM and tile checks remain opt-in; the normal suite uses deterministic provider
fixtures. Existing Rasterio deprecation warnings, the expected jsdom canvas-fallback diagnostic
and the MapLibre bundle-size advisory remain dependency/tooling observations, not failed checks.
