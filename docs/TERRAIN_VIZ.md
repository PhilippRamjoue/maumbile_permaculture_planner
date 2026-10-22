# Terrain visualization & sector helpers (WP10)

Frontend-only package: it shows the WP5 terrain output over the imagery and adds sector helpers to
the WP9 editor. The 30 m DEM makes this a planning aid, not a survey instrument; the panel always
shows the backend's `notice` and the DEM `attribution` once terrain is ready.

## Using it

- **Site map and design editor** both show a **Terrain** panel (`features/terrain/TerrainPanel.tsx`).
  - Not computed yet → **Compute terrain** (`POST /sites/{id}/terrain`); the panel then polls
    `GET` every 2 s while the status is `pending`/`running` and stops at `ready`/`failed`.
  - `failed` shows the backend's message with **Try again**. A 404/422 from the POST (no elevation
    data, site too large) is shown as returned.
  - `ready`: toggles for **Contour lines** (on by default; every fifth "index" line is heavier) and
    **Slope** (off by default, it hides the imagery), a **slope legend** with each class's share of the
    site, elevation/relief summary, explanations for backend `flags`, and a contour-interval select
    (**Update contours** re-derives with the new interval).
- **Sector from bearings** (editor sidebar, `design-editor/SectorHelper.tsx`): choose a kind, a
  _from_ and a _to_ bearing (compass degrees, swept clockwise, so 315 → 45 wraps through north) and a
  radius (default: half the site's longer side), then **Add sector**. A wedge polygon from the site
  centre is added to the visible **Sectors** layer as `feature_type: "sector"` with
  `properties: {sector_kind, bearing_from, bearing_to, origin, radius_m, …}`, and saves with the
  rest of the design. Editing the bearings of such a sector redraws its wedge; hand-drawn sectors
  (no `origin`/`radius_m`) keep their polygon. Dragging vertices changes the polygon but not the
  stored bearings.
- **Sun path for a date**: sunrise/sunset azimuth at the site's latitude (declination formula,
  about ±1°, no horizon/terrain). _Use this sun path_ fills kind = sun and the bearings, choosing
  the side of the sky the sun actually crosses (through north for an equatorial site in June).

## Implementation

- `entities/generated/terrain.ts` and `shared/testing/terrain-contract.json` are generated from
  `backend/app/modules/terrain/schemas.py` by `backend/scripts/generate_frontend_contracts.py`
  (which now covers `TerrainRead` and nested models, with a small JSON-schema → TS converter and a
  `--check` drift test in CI). `entities/terrain.ts` re-exports them; `entities/terrainQueries.ts`
  has the API calls, `useTerrain` (self-polling) and `useRequestTerrain`.
- The map gets terrain through the **layer registry**: `MapLayerContext.terrain` (optional, same
  pattern as `imagery`), and two definitions in `features/map/layers/terrainLayers.ts`
  (`terrain-slope`, `terrain-contours`) registered in `defaultRegistry.ts`. `MapView` only forwards
  an optional `terrain` prop into the context. Both build `null` until the status is `ready`.
- `MapLayerDefinition.group` marks layers toggled by their own panel; the generic `LayerPanel`
  skips grouped layers so terrain toggles are not listed twice.
- The slope overlay is built from `slope_grid` (no terrain maths in the browser): cells are merged
  into rectangles per class (`slopeOverlay.ts`), drawn as one MultiPolygon per legend class,
  anti-aliasing off to avoid seams.
- **Draw order in the editor:** registry layers restack on top whenever one is rebuilt (terrain
  arriving late). `useEditorMap` therefore takes an `overlays` dependency (the terrain response) so
  it re-adds the editor's document and drawing layers above them.
- Pure geometry/solar helpers live in `design-editor/sectors.ts` (tested without a map).

## Tests

Vitest: slope-grid merging/georeferencing, layer specs, synchronizer behaviour as terrain
appears/disappears, panel states (not requested → polling → ready, failed, POST errors, interval
change, flags, toggles, legend/attribution/notice), wedge geometry across north, solar azimuths
(Nairobi both solstices, polar day), helper → feature → `savePayload`.

## Deferred

- Contour elevation labels (the map style has no glyph source yet).
- Choosing the sector origin on the map (it is the site centre; edit the bearings or move the
  polygon afterwards).
- A year-round sun envelope (solstice-to-solstice) and hourly sun positions.
- Slope/elevation read-out at a clicked point.
