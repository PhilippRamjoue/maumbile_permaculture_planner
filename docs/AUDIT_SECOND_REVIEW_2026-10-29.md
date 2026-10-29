# Independent review of the 2026-10-29 audit

Reviewed against commit `85a0732` and the untracked `AUDIT_2026-10-29.md` on 2026-10-29.
Scope: source inspection across editor state, rendering, persistence, API/query lifecycle,
backend services/repositories, providers, export, contracts, tests and CI. This is a review,
not an implementation pass; application source and Claude's audit were left unchanged.

## Assessment

The modular monolith is a suitable foundation. Keep the revision-guarded design endpoint,
provider adapters, ownership ports, generated contracts and disposable database tests.
There is no evidence here that a rewrite or microservices would improve maintainability.

However, **the original verdict is too reassuring**. Its cleanup recommendations are broadly
useful, but it overlooks observable failure paths and export discrepancies. Large files are
maintenance risks, not automatically the highest-priority defects. Correctness and draft
survival should precede broad extraction or unused-export removal.

## Additional findings, in recommended priority order

### 1. P1: a failed background refetch destroys the mounted editor draft

Evidence:

- `frontend/src/features/design-editor/DesignEditorPage.tsx:16` returns an error screen whenever
  the site query is in error, even when it retains previously loaded site data.
- The same file at lines 176–177 takes `design.error ?? types.error` and returns early before
  rendering `Workspace`.
- `frontend/src/app/guards.tsx:11` similarly replaces the authenticated route outlet on a user
  query error, even when the last authenticated user is still cached.
- `Workspace.tsx:131` creates the editor store in component state; goals and boundary drafts
  also belong to that mounted instance. Removing it removes the unsaved work.

Trigger: load a plan, edit it, then encounter a failed background refetch. Reconnection can
trigger stale query refetches; `refetchOnWindowFocus: false` does not disable reconnect refetches.
Query invalidation or an explicit refetch can also trigger this path. The router leave blocker
does not protect conditional rendering inside the same route.

Verification: two temporary Vitest reproduction tests rendered the real `DesignEditorPage`
with a stateful draft probe replacing only `Workspace`. Each seeded valid cached data,
entered unsaved text, and explicitly failed either the design or site refetch. Both confirmed
that the draft component unmounted although the query still had its previous data. The temporary
tests were removed after execution. The auth guard finding is source-traced, not separately
reproduced.

Fix: distinguish initial-load failures from refresh failures. Preserve the mounted draft and
show a recoverable error alongside it when cached data remains usable. Handle actual loss of
authorization explicitly, including draft recovery. Add regression tests for design, site,
catalogue and current-user refresh failures. Merely disabling one refetch trigger is insufficient.

### 2. P2: tool routing can silently save a feature into the wrong layer

Evidence: `Workspace.tsx:464–470` looks for a *visible* layer by display name and updates
`activeLayer` only if one is found. Otherwise it retains the previous layer. `useEditorMap.ts:229`
uses that retained ID when saving the drawn feature; its drawing guard checks visibility, not
that the layer matches the intended feature family.

Example: leave Elements as the active layer, hide Zones, then choose Draw zone. No visible Zones
layer is found, so the new zone goes into Elements. It subsequently follows the wrong visibility
and stacking controls. Renaming a standard layer through the API produces the same routing weakness.
Palette tools also route all `element` tool entries to Elements, although their actual
`feature_type` can be path or annotation.

Verification: executed the current `layerNameFor` and `choose` code extracted from Workspace,
with Elements visible and Zones hidden. Choosing `zone` retained the Elements ID. The subsequent
feature assignment was traced in `useEditorMap`.

Fix: make destination resolution explicit and return either a valid destination or an actionable
failure. Decide deliberately whether drawing reveals a hidden destination or asks the user to
show it. Eventually use a stable layer role instead of editable English names; account for the
palette entry's actual feature type. Test hidden, renamed and missing destination layers.

### 3. P2: exported path widths do not preserve the editor's metric widths

Evidence:

- The editor's `lineWidth.ts` and `focus/view.ts` interpret `properties.width_m` in ground metres.
- `backend/app/modules/export/render.py:80` derives style from pixel `stroke_width`, and
  `_draw_feature` at line 339 derives line thickness from that style. Neither reads `width_m`.
- The editor also derives repeated planting icons from `row_icon` / `row_spacing_m`; the backend
  renderer does not consume those properties.

Verification: called the actual `_draw_feature` with a recording draw object for otherwise
identical 1 m and 10 m paths. Both produced the same supersampled line width of 10 pixels.
The planting-icon difference was established by source inspection.

Impact: a user can configure an accurate road or path on screen and download a to-scale plan
that gives it a different physical width. GeoJSON preserves the properties; the discrepancy is
in PNG/PDF presentation.

Fix: render metric widths using the export projection's pixels per metre. Define which visible
editor properties PNG/PDF promise to preserve, and test that contract with different widths,
scales and planting rows. Shared semantics and fixtures matter more than sharing rendering code
between Python and TypeScript.

### 4. P2: export reads do not use the consistent design snapshot

Evidence: `backend/app/modules/export/access.py:38–39` calls `get_plan` and `list_features`
separately. `PlanningService.get_design` at line 124 already provides a plan-row-locked read
of plan, layers and features. Export does not use it.

Under the default READ COMMITTED transaction isolation, a concurrent save can commit between
the separate reads. Export can combine old layer visibility or goals with newer features.
`PlanDocument` is described as frozen at one moment, but assembling a dataclass alone does not
give those reads snapshot consistency. Flushing the initiating browser does not exclude other
tabs/devices.

Confidence: source-traced concurrency defect; no concurrent database reproduction was run for
this finding. A deterministic regression should pause export between its reads, commit a design
save in another session, and check that the result represents one revision.

Fix: consume the existing consistent design read for plan-owned data, map it into the export DTO,
and release the transaction before rendering. Define site-boundary consistency separately, since
the boundary is shared across plans and has its own concurrency token.

### 5. P2: React lifecycle rules are not enforced by ESLint

Evidence: `frontend/eslint.config.js` enables the base JS and TypeScript recommended rules only;
there is no React Hooks plugin or equivalent hook dependency gate. TypeScript strictness does
not detect conditional hook calls or stale effect closures.

This matters in code whose correctness depends on multiple effects, callback refs and coordinated
save states. Add hooks rules and review the dependency warnings deliberately. For example,
MapView intentionally constructs one map per site and reads initial bounds: preserve that intent
with a clear lifecycle design rather than mechanically adding every referenced value to its effect.

### 6. P3: backend process resources have no explicit shutdown owner

Evidence: `imagery/providers.py:37–49` lazily creates a process-global `httpx.AsyncClient`.
`app/main.py:23–25` has a lifespan that only yields; it closes neither this client nor the DB
engine. The operating system eventually reclaims them at process exit, but repeated application
lifecycles and tests can retain resources or reuse an object tied to an earlier event loop.

Fix: give shared resources a startup/shutdown owner, while preserving adapter injection for tests.
Verify repeated lifespan entry/exit and client replacement. This is lifecycle debt, not evidence
of a current production outage.

## Check of Claude's individual recommendations

| Original item | Independent assessment |
| --- | --- |
| #1 Workspace extraction | Agree: 895 lines and many responsibilities. Extract persistence and navigation as cohesive behavior, preserving one revision queue and all dirty domains. Avoid arbitrary line-count targets or splitting a reliable state machine into mutually dependent hooks. Imagery already has `useImageryChoice`, `useImageryMeta` and `useImageryProviders`; another wrapper is useful only if it owns a clear policy. |
| #2 useEditorMap mega-effect | Partly incorrect. It has **six effects**, including a drawing lifecycle tied only to `[map, store]`, selection/mode synchronization, image resolution and design rendering. Its broad rendering effect recreates **design** sources/layers; imagery belongs to MapView's LayerSynchronizer and is not re-added on every tool switch. The real optimization is stable design sources with data/paint/visibility updates, plus explicit stacking ownership. Measure before changing it. |
| #3 "15 phantom dependencies" | Real issue, inaccurate unit. There are **three undeclared imported package names across 15 source/test files**: `geojson` (12 files), `@turf/distance` (2 tests), `@maplibre/maplibre-gl-style-spec` (1 test). `geojson` is type-only and supplied by `@types/geojson`; declare that type package, not a runtime `geojson` package. The other two imports are test-only today and can be devDependencies. |
| #4 stricter mypy | Agree, with a smaller first step than suggested. Running the four proposed additional flags produced **9 errors**: one production `no-any-return` in `core/geo.py:56`, the others in tests/fixtures. This is practical to address without a long module-by-module migration. Explicit `Any` and `ignore_missing_imports = true` still need separate judgment; these flags are not a complete strictness guarantee. |
| #5 module boundary gate | Agree, but define allowed edges first. AST inspection found the cross-module private repository import in `planning/dependencies.py:14`; it is composition wiring, not service logic. Export's adapter also legitimately calls planning and sites services, and the renderer consumes planning's pure icon catalogue. A blanket ban on all cross-module imports would encode the wrong architecture. TerrainService still accepts sessions, constructs its repository and rolls back sessions itself, so "repositories are the only place touching sessions" is not literally true. |
| #6 unused-code gate | Useful after a reviewed baseline, with a pinned tool/config and clear source/test/generated entry points. Knip's exact counts were **not independently rerun** here; they should not be treated as verified deletions. Start by distinguishing production reachability from test-only use and intentional extension interfaces. |
| #7 localStorage helper | Reasonable small cleanup. Prefer a tiny safe get/set/remove utility first; a generic persistence hook can introduce synchronization and SSR semantics this application does not need yet. |
| #8 dead exports and zoom aliases | Verify each removal. The two barrels have no obvious current consumers, but an unused export does not necessarily mean its implementation is dead. `IMAGERY_MAX_ZOOM` and `MAX_FIT_ZOOM` describe different policies intentionally linked today; equal values alone are not harmful duplication. Preserve the distinction if the framing policy can evolve separately. |
| #9 version drift | Confirmed (`0.1.0` backend versus `0.4.1` frontend). Useful operational cleanup, lower priority than draft preservation and export correctness. Release docs currently make bumping these fields optional. |
| #10 release preflight | Agree. Match the actual CI jobs: lint, backend formatting, both type checks, generated-contract drift, tests, frontend build, dependency audit and browser acceptance tests. The five-command subset in the audit is not the exact CI set. Release images already depend on the reusable verification workflow, which should remain authoritative. |

Other corrections: generated contracts already include terrain, shares, goals, elements and icons,
not only imagery. Zero TODO markers and a large test count do not demonstrate architectural health
or coverage of failure paths. The frontend test count is 479, not approximately 245.

## Verification

- Existing frontend suite: **48 files, 479 tests passed**. One expected jsdom canvas diagnostic is
  emitted by the icon fallback test; it is not a failing test.
- Two temporary failed-refetch reproductions: **2 passed**, confirming the current unmount behavior.
- Extracted active-layer routing reproduction: confirmed the hidden-Zones fallback.
- Actual backend export drawing reproduction: confirmed equal stroke thickness for 1 m and 10 m.
- Frontend lint, type check and production build: **passed**. Build still reports the existing
  MapLibre chunk size warning (about 1.06 MB uncompressed); this alone does not justify a rewrite.
- Backend Ruff lint and formatting: **passed** (141 files formatted).
- Current mypy configuration: **passed**, 127 source files. Proposed four extra checks: 9 errors,
  as described above; no configuration changes were made.
- Generated frontend contract check: **passed**.
- Backend unit suite excluding integration/live tests: **126 passed, 116 deselected**.
- Full backend suite including disposable PostGIS integration: **241 passed, 1 live test
  deselected**, in 88.91 seconds. Rasterio emitted 33 dependency deprecation warnings.
- Browser acceptance tests and live upstream provider checks were not rerun. Unit-level
  reproductions do not establish real WebGL interaction or upstream provider availability.

Windows sandbox restrictions prevented ordinary pytest startup; unit verification used the existing
virtual environment outside that sandbox. Integration verification uses the suite's disposable
Testcontainers database, not the preserved `permaculture-verify` database.

## Implementation order

1. Preserve mounted drafts across refresh failures; add the missing failure-path regressions.
2. Fix layer destination selection and export metric rendering; define their behavior with tests.
3. Make export reads consistent using the existing design read contract.
4. Declare the three missing dependency families, introduce Hooks lint, and enable the small
   first mypy increment. Specify and enforce backend dependency boundaries with composition exceptions.
5. Extract editor persistence/navigation with behavior unchanged. Then improve design-layer syncing
   and stacking using measurable source/layer operation counts. Avoid changing both systems together.
6. Review unused exports, consolidate storage wrappers, own resource shutdown, align versions and
   add a complete release preflight.

The objective is explicit ownership of drafts, transactions, layer roles and resource lifetimes.
Reducing file size and export counts helps only when it makes those contracts easier to uphold.
