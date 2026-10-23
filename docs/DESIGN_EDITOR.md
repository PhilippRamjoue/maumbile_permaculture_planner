# Design editor (WP9)

Implemented after the owner selected the editor as the next task during the 2026-10-21 review
follow-up. The existing planning backend is now exposed through a usable drawing/save workflow.

## Using it

1. Open a site, choose **Design plans**, then create or open a named plan.
2. **Draw zone / Draw sector:** click corners and click the first corner again to finish.
   Zones default to 1; sectors default to wind, bearings 0–90°. Edit those properties afterwards.
3. **Draw path:** click its points and press Enter. Escape cancels an unfinished drawing.
4. Choose a catalog entry and **Place element**. Point elements use one click. Polygon elements
   (including House) use opposite corners of a footprint rectangle. Line elements use points/Enter.
5. **Select / edit:** click a feature on the map or in the feature list. Drag its interior to move
   it; drag vertices to reshape it. Midpoint handles support adding vertices. Non-point features
   can also be rotated in 15° steps. Name, notes, color, layer and typed properties are editable.
6. Toggle/reorder layers; top of the control list draws above the others. These changes are drafts
   until saved. Hidden-layer features remain in the document and are saved.
7. **Measure distance / Measure area** makes a transient drawing. It never becomes a saved feature.
   Live measurements use Turf geodesic calculations; **Confirm measurement** sends a selected
   feature to PostGIS. A successful save also supplies authoritative measurements.
8. **Save design** (Ctrl/Cmd+S), **Undo** (Ctrl/Cmd+Z), **Redo** (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y).
   Text inputs retain their normal keyboard editing behavior. Leaving a dirty design asks whether
   to keep editing or discard it; browser reload/close uses the browser's unsaved-changes prompt.

## Implementation boundaries

- `entities/planning.ts`: planning API types; still handwritten, unlike the generated imagery type.
- `features/design-editor/api.ts`: API calls and the save coordinator.
- `store.ts`: isolated Zustand document, selection, bounded 100-step history, saved signature and
  persisted feature baseline. Server query data is not used as mutable drawing state.
- `useEditorMap.ts`: Terra Draw adapter and MapLibre document renderer. Terra Draw owns only the
  current draft/selection. The other features render in actual per-plan style layers, so hiding
  or reordering a layer does not require manipulating the drawing adapter's private state.
  The shared map wrapper explicitly packages MapLibre's separate worker through Vite, so saved
  GeoJSON boundaries/features render in production as well as during development.
- `EditorControls.tsx` / `FeatureProperties.tsx`: tools, layer controls and properties UI.
- `DesignEditorPage.tsx`: plan selection/creation, loading, save status and route lifecycle.
- `measure.ts`: pure geodesic estimates, independent of map pixels and the database.

Routes: `/sites/:siteId/design` and `/sites/:siteId/design/:planId`. An editor checks that its plan
belongs to the site in the URL. Backend ownership checks remain authoritative.

Client UUIDs come from Terra Draw's UUID strategy and survive save/reload. Only domain properties
are persisted; adapter handles, temporary vertices and measurement drafts are excluded. Catalog
styles supply color, opacity, line width and point radius; saved user color overrides are retained.
The renderer promotes a separate `_editor_id` property as the MapLibre feature ID; UUIDs must not
be read from the numeric vector-tile ID without promotion. The property is rendering-only and
never added to persisted domain properties.

## Save contract and failure behavior

`POST /api/v1/plans/{id}/features:batch` now accepts:

```json
{"features": [], "deleted_ids": ["11111111-1111-1111-1111-111111111111"]}
```

`deleted_ids` is optional (defaults to empty), unique, limited to 1,000, and cannot overlap feature
upserts. Deletions are scoped to the requested plan. Unknown/already-deleted/foreign-plan IDs are
idempotent no-ops. Feature inserts, updates and deletions commit together; any upsert conflict or
validation failure leaves the original feature set intact. The response contains the upserted
features in input order. This is an additive extension of WP6, not replacement-snapshot semantics.

The editor saves the complete local feature set, plus deletions relative to the last known persisted
baseline. It then PATCHes layer metadata. These PATCHes are separate transactions; feature and layer
changes are **not one aggregate transaction**. A failed layer request leaves the draft dirty and
retains the successful feature baseline, allowing an idempotent retry without orphaning features.
Editing is disabled during a save. Failures retain the local document and expose a retry message.

## Map reliability (precision pass)

`editorModes.ts` configures the Terra Draw modes and the click-to-select logic:

- **Reach.** Terra Draw's default pointer distance is 40 px in every mode. A small plot at low zoom fits
  inside that, so a press near one corner grabs another and a second corner placed near the first closes the
  polygon. Select mode now uses 24 px and the polygon/line draw modes 20 px.
- **Snapping.** Drawing and dragging a vertex snaps onto the corners of every feature on a visible layer and
  of the site boundary (12 px on screen, exact coordinates). It is Terra Draw "custom snapping", so the other
  features need not live inside Terra Draw. The feature being edited is excluded so a corner cannot snap back
  onto itself.
- **Picking.** A click on a feature searches ±6 px (thin paths, shaky or finger clicks); a marker or path wins
  over the zone under it; a click on a corner of the feature being edited is left to Terra Draw instead of
  re-selecting the neighbouring zone that shares that corner.
- Vertex drag, midpoint insertion, coordinate deletion and rotation were already enabled; each finishes with
  one store upsert, i.e. one undo step. "Zoom to boundary" (`ZoomToBoundaryButton`) sits over the map.

## Owner-testing UX pass (Oct 2026)

Fixes from the owner's first run on a real plot in Tanzania:

- **Imagery over-zoom.** Esri World Imagery serves a "Map data not yet available" placeholder (HTTP 200)
  past z18 over rural East Africa, which MapLibre cannot detect. `map/layers/zoomLimits.ts` holds one
  `IMAGERY_MAX_ZOOM = 18`: both raster sources (setup basemap, per-site imagery) declare it as `maxzoom`, so
  MapLibre upscales the deepest real tile; `MAX_FIT_ZOOM` (same value) caps every automatic fit. The setup map
  opens at ~z16 on the coordinate typed in step 1 (`focusPoint` in the setup store) or on a lone corner.
- **Sectors were invisible while selected.** A wedge's tip was the site centroid at full float precision, and
  Terra Draw refuses to select a shape with more than 8 decimals ("This geometry cannot be edited"); a
  just-added sector is selected, so only Terra Draw drew it and nothing appeared. `sectorWedge` rounds the tip
  and `roundGeometry` (`editorModes.ts`) rounds older geometry before it reaches the editor.
- **Sector management.** `focus/SectorOverview.tsx`: a show/hide switch per kind (state lives in the
  workspace and applies in every focus via `createFocusView`), and a list to select/delete each sector, with
  several per kind. "Add the sun's path (today)" adds a sun sector from `sunPath`. Editing a sector's kind or
  bearings keeps its generated name and colour in step (`syncSectorLook`).
- **Functions by default.** `element_types.default_properties` (migration `0007_element_type_defaults`,
  additive) holds each palette entry's typical `needs`/`yields`; placing an element copies them, so a tree
  (needs water) links to a tank (yields water) at once. The Functions step can top older elements up without
  overwriting choices. `seed.ELEMENT_TYPE_CATALOG` is the live catalog; migration 0007 holds a frozen copy and
  a test keeps them equal, so a catalog change ships with a new migration.
- **Clarity.** Boundary has a primary "Looks good → Sectors & terrain"; setup's "Create site" is a sticky
  button that says what is missing. `focus/SaveStatus.tsx` shows Saved / Unsaved / Saving / Not saved, says
  the design autosaves and links to Design plans, and `PlacedNotice` confirms "X added" with a
  place-another button. Not yet done: element icons/widgets on the map and in exports.

## Goals step (grounding the design in what the owner wants)

Permaculture design starts from what the owner wants from the land, not from the map, so **Goals** is the
first step of the rail (before Boundary). It is optional and never a gate: a brand-new plan opens on it,
a plan that already has drawn work does not.

- Data: `plans.goals` (nullable JSONB, migration `0008_plan_goals`, additive) holds
  `{"priorities": [...], "vision": "..."}`. Priorities are `water`, `food`, `income`, `habitat`, `beauty`,
  `shelter`, `education`, `low_maintenance`; the vision is up to 2000 characters. `PlanGoals` in
  `planning/schemas.py` validates it (unknown priorities rejected, duplicates dropped); `PATCH /plans/{id}`
  takes `goals` (omit = untouched, `null` = clear) and plan reads return it. The frontend type
  `entities/generated/plan.ts` is generated by `generate_frontend_contracts.py`.
- Editor: `focus/GoalsPanel.tsx` (toggles plus free text, water first and explained), `focus/goals.ts`
  (options, normalisation) and `focus/useGoals.ts` (state plus its own `PATCH`, autosaved with the shared
  `useAutosave`, flushed on focus change, counted in the save status and the unsaved-changes guard). Goals
  are not part of the feature document, so they never wait for or block the feature save. Other steps show a
  one-line "Your goals: …" reminder with an Edit link.
- Water-first nudges: water is the first and larger toggle with a short explanation; the Sectors nudge
  names water flow and the Elements nudge suggests a tank, pond or well before the house.

## Verification and limits

- Store tests cover geometry/properties/deletion undo/redo, dirty state and deletion payloads.
- `editorModes.test.ts` drives the real Terra Draw draw/select modes through a test adapter with a
  Web-Mercator camera: vertex drag is exact at zoom 8–22, snapping onto other features' corners, reach, picking.
- A save-coordinator regression covers successful feature writes followed by a layer failure.
- Backend tests cover atomic/scoped/idempotent deletion and invalid upsert/delete overlap.
- Chromium covers plan creation, zone drawing, House placement/drag/rotation, path drawing,
  measurement confirmation, undo/redo, save/reload equality and persisted deletion.
- A second Chromium regression covers failed saves, unsaved navigation and layer persistence.

Up to 1,000 features can be saved per plan, matching the backend batch limit. The editor is an
online, single-user drafting UI: there is no durable browser draft recovery, cross-tab conflict
resolution or real-time co-editing. Save before intentionally discarding a draft or closing the page.
Custom icons, extra user-created layers and footprint dimension inputs can
be added later. Hand-drawn sectors only describe the drawn polygon in their bearing properties; the
bearing-wedge and sun-path helpers and the terrain overlays are in [`TERRAIN_VIZ.md`](TERRAIN_VIZ.md)
(WP10). Export/share remains WP11.
