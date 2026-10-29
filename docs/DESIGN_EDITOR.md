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
7. **Measure** (a small button over the map, beside Zoom to boundary and Legend, in every focus) unfolds
   into **Distance**, **Area** and **Grid**. Distance / Area make a transient drawing that never becomes a
   saved feature; the live geodesic readout (Turf) shows in the map hint, and the measurement panel appears
   while measuring. A selected zone, bed or path also shows its size there, with no tool (see "Map tools"
   below); **Confirm measurement** sends the selected feature to PostGIS, and a successful save also
   supplies authoritative measurements.
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

**Updated 2026-10-26:** the browser editor now uses the atomic, revision-guarded `GET/PUT
/plans/{id}/design` contract described in [`ARCHITECTURE.md`](ARCHITECTURE.md). The older batch
contract below remains for initial legacy/API writes, but unversioned feature/layer/goal writes
are rejected once a plan has entered protected saving. The editor sends changed features and
layer metadata in one transaction; it no longer performs separate layer PATCHes. Goals use the
same revision queue. Valid boundaries autosave through a timestamp-guarded site update. Conflicts
and failures retain the local document and offer a draft download. Downloads save first, and the
navigation dialog offers **Save and leave** as well as keeping or discarding the draft.

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
- **Parametric sector handles.** A selected parametric wedge (sun / from-bearings — it carries an origin,
  radius and two bearings) is edited on the map by `useSectorHandles.ts`: a circle layer draws handles at the
  origin (move), each edge tip (open/close) and the arc midpoint (resize); dragging recomputes the spec
  (`moveSectorOrigin` / `setSectorBearing` / `setSectorRadius` in `sectors.ts`, opening clamped to
  `[MIN_SECTOR_SPAN, MAX_SECTOR_SPAN]`) and upserts on each animation frame. Parametric wedges are kept out of
  Terra Draw vertex editing (`editedFeature`); hand-drawn sectors have no origin/radius and stay by-vertex.
- **Rectangle / freehand sectors.** Besides the wedge, "Draw sector by hand" is Terra Draw polygon mode and
  "Rectangle sector" (`tool: "sector-rect"`) is its rectangle mode; both finish as an ordinary hand-drawn
  sector (kind defaults to wind, set it afterwards). A wedge suits directional influences, a rectangle a
  straight edge such as a road.
- **Functions by default.** `element_types.default_properties` (migration `0007_element_type_defaults`,
  additive) holds each palette entry's typical `needs`/`yields`; placing an element copies them, so a tree
  (needs water) links to a tank (yields water) at once. The Functions step can top older elements up without
  overwriting choices. `seed.ELEMENT_TYPE_CATALOG` is the live catalog; migration 0007 holds a frozen copy and
  a test keeps them equal, so a catalog change ships with a new migration.
- **Clarity.** Boundary has a primary "Looks good → Sectors & terrain"; setup's "Create site" is a sticky
  button that says what is missing. `focus/SaveStatus.tsx` shows Saved / Unsaved / Saving / Not saved, says
  the design autosaves and links to Design plans. Element icons are done: see "Element icons" below.
- **Master–detail panels.** Every step (`ElementsPanel`, `SectorsPanel`, `ZonesPanel`, `FunctionsPanel`)
  is one flow: with nothing selected it shows the "add" tools and a `FeatureList` of what is placed; drawing
  or placing auto-selects the new feature, which drills into just its editor (`FeatureProperties`) with a
  `BackToList` breadcrumb ("← All sectors", …) back up. There is no separate "added, place another" box.
  Adding a sector is kind-first (the sun's-path shortcut and compass-bearings adder are secondary/folded).
  A self-intersecting polygon's save failure is caught in `Workspace` and shown as plain guidance.

## Map tools (measuring, grid, sizes)

All optional, folded away until asked for, and never saved with the design.

- **Measure control.** `MapToolsControl.tsx` sits in the `.map-tools` row over the editor map. One
  "Measure" button unfolds, inline, into Distance, Area (the existing `measure-line` / `measure-area`
  tools in `useEditorMap.ts`; a second click puts the tool down) and Grid. The scale bar stays. The old
  "Measure & layers" section is now just "Layers". The live number is shown in the map hint
  (`36.3 m — not saved`); `focus/MeasurementPanel.tsx` shows only while measuring or with a selected
  shape.
- **Distance grid.** `map/layers/gridLayer.ts` is a `MapLayerDefinition` (registered in the editor
  registry only, drawn under the design) that is given the viewport through `MapLayerContext.ui`. It
  builds north-aligned lines for that view only (`useViewportBounds` rebuilds it when the map settles
  after a move or zoom): spacing is the smallest of 1, 2, 5, 10, 25, 50, 100, 250 m... that leaves at
  most ~12 lines across the longer side. Numbers count metres from the plot's south-west corner (its bbox
  corner), on the top and left edges, at most six per edge. Off by default; while it is on the Grid button
  names the spacing ("Grid · 25 m"). The numbers are canvas images made on demand through the same
  `setMissingStyleImageResolver` as the element icons (`gridLabels.ts`), so the map style needs no font
  server and nothing is fetched. The layer's structure is the same for every view, so a pan only swaps
  GeoJSON data; the editor's `overlays` key includes whether the grid is present so design layers stay on
  top when it is added.
- **Selected size.** `measure.ts` `orientedSize` is the smallest enclosing rectangle of a polygon (rotating
  calipers over its convex hull in a local metric projection), so a bed turned by the rotate tool still
  reads "4.2 × 1.2 m", unlike a north-aligned bounding box. The panel shows that, the area and the
  perimeter for polygons, and the length for paths; points have none.

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
- Water-first nudges: water is the first and larger toggle with a short explanation. When water is one of
  the goals, the rail's nudge in Sectors and Elements wonders aloud where water comes from and where it could
  be held, until a water sector or an element that yields water exists (`focus/modes.ts`, `nudgeFor` with a
  `NudgeContext`). It is phrased as a question and never blocks anything; without the goal, or once water is
  on the map, the generic nudges apply.

## Map legend

A toggleable **Legend** button sits beside "Zoom to boundary" over the editor map (open/closed is
remembered per browser). `legend.ts` builds it from the plan's own features: one entry per zone number,
sector kind and element type with the colour of its first feature, in that order. Features on hidden
layers or switched off by the current focus are left out, so it explains exactly what the map shows.
`MapLegend.tsx` renders it. The PNG/PDF export has its own server-side legend of the same kinds
(`export/render.py`, see `EXPORT.md`) and now also prints the plan's goals under the title.

## Terrain control

`terrain/TerrainControl.tsx` is a compact popover in the `.map-tools` row, shown in every focus **except**
Sectors & terrain (whose sidebar `TerrainPanel` already covers terrain). It toggles the slope fill and
contour overlays via the shared `useMapLayerStore` (visibility only — `MapView` applies the overrides),
recomputes terrain after a border change, and jumps to the Boundary step (`onEditBoundary`, omitted when
already there). The slope legend (`SlopeLegend`) is one compact line per class. This is what makes changing
the boundary and recomputing slope reachable from the simple editor and while placing elements.

## Layers control

`LayersControl.tsx` is a popover in the `.map-tools` row (every focus) holding the whole-map layer
settings — per-layer visibility, draw order (↑/↓) and which layer new shapes go into. These were once
repeated inside each step as a "Layers & context" disclosure (`AdvancedTools` + `ContextToggles`), which is
gone; other feature families now always render as faint context. Plan-layer state lives in the editor
document (`state.commit`); the terrain overlays and site boundary are registry layers, controlled from the
Terrain control, not here.

## Element icons

Point and footprint elements are marked with a simple glyph instead of a plain dot, on the map, in
the palette, in the legend and in the PNG/PDF export.

- **One definition.** `backend/app/modules/planning/icons.py` holds the glyphs (strokes and a few solid
  shapes on a 24 x 24 grid; hand-made, so no icon font, no licence, no external fetch) and the
  palette-entry to glyph mapping. `generate_frontend_contracts.py` emits them as
  `frontend/src/entities/generated/icons.ts`; Pillow draws the same geometry for the export.
- **Catalog.** `element_types.icon` (column already existed, nothing used it) now names a glyph, `NULL` for
  lines (swale, stream, fence, hedge, windbreak, path, road) and overlays (zone, sector), which stay styled
  lines and areas. Migration `0009_element_type_icons` (data only) sets it; `seed.ELEMENT_TYPE_CATALOG` is the
  live source and the catalog test compares the icon too.
- **Map.** `renderableFeatures` stamps `_icon` (`glyph|<key>|<colour>`) on features whose type has a glyph.
  A `symbol` layer draws the badge (point, or the middle of a footprint), a `circle` ring marks a selected
  icon point, and plain dots remain for point types without a glyph. Badges are drawn on a canvas on demand
  through `map.setMissingStyleImageResolver` (`icons.ts`), one per glyph and colour, with a white halo and dark
  rim so they read on satellite imagery. A footprint being reshaped is drawn by Terra Draw, without its badge on purpose: the map only
  updates on commit, so a badge kept on screen would sit at the old place during a drag.
- **Palette, legend.** `GlyphIcon` (inline SVG) previews the chosen entry beside the palette and is the
  legend swatch for marked types.
- **Export.** `render.py` draws each badge after all fills and lines (radius 22 px, smaller on small
  footprints, ink chosen for contrast, dark rim for black-and-white prints); a footprint's name moves below
  its badge; legend rows use the badge too.

## Elements to scale

Round and rectangular palette entries are placed at their real size with **one click**; nothing
asks for a number. The catalog (`element_types`, migration `0010_element_type_footprints`) gives
each entry a `shape` (`point` | `line` | `area` | `round` | `rect`) and a default size in metres:
`default_diameter_m` for round entries (tank 2, pond 3, tree 4, shrub 1.5, herb spiral 2, well 1),
`default_width_m` (east-west) by `default_length_m` (north-south) for rectangular ones (bed 1.2 x 4,
house 8 x 6, shed 3 x 3, greenhouse 3 x 6, coop 2 x 3, compost 1 x 1, nursery 3 x 3, toilet
1.5 x 1.5). Lines, hand-drawn areas (zone, sector, paddock, food forest) and points (beehive, note)
are placed as before. The seed (`planning/seed.py`) is the live source; a test keeps the migrated
rows in step with it. `ElementTypeRead` is generated into `entities/generated/elements.ts`.

On the click, `design-editor/footprint.ts` builds the polygon in true metres (a 32-point circle, or
four corners at +-W/2, +-L/2, north-aligned) around the click and stores
`properties.footprint = {shape, diameter_m | width_m, length_m, rotation_deg}` beside it. The
polygon is always drawn *from* that record and its centre is the middle of its bounding box, so a
drag-move needs no bookkeeping. The icon badge stays centred on it, also while it is selected.
Footprints load into Terra Draw as `rectangle` features (move only, no vertex handles), so a corner
can never be dragged out of true.

The selected element shows an **Exact size** section (`FootprintFields`): *Diameter (m)*, or
*Width (m)*, *Length (m)* and *Rotation (deg)*. Values from 0.1 to 1000 m are accepted (a comma
works as the decimal mark); editing one redraws the footprint around the same centre. The rotate
buttons turn clockwise for "right" and the rotation field reads the angle back from the geometry.
The size also shows in the Size readout and in the PNG/PDF export, where footprints are ordinary
polygons drawn at scale with their icon. Features placed before this change (a tree as a point)
keep their geometry; a new one of the same type is a footprint.

A **Round / Rectangle** switch in the same section converts the footprint, carrying the dominant
dimension over (a circle's diameter becomes both sides of a square; a rectangle's longer side becomes
the diameter), and a readout such as `Ø 5 m · circle · 19.5 m²` or `5 × 5 m · 25 m²` states the shape,
exact size and area (a circle covers less than the square of its diameter). **Reshape freely** drops
`properties.footprint`, so the element is a plain polygon that Terra Draw edits with vertex handles
(add, move, remove); the Exact size section disappears while Rotate stays. **Back to rectangle**
re-fits a rectangle footprint to its bounding box.

## Path and road width

A feature with `feature_type === "path"` carries `properties.width_m` (metres, 0.1-100), set from the
palette entry's `default_style.width_m` when drawn (path 1 m, road 4 m; migration
`0013_path_widths`; a hand-drawn path defaults to 1 m) and edited as *Width (m)* in the properties
panel. `focus/view.ts` surfaces it as `_width_m` and `lineWidthExpression` (`lineWidth.ts`) drives the
map's `line-width` from it: pixels per metre double with every zoom level, so an
`["interpolate", ["exponential", 2], ["zoom"], ...]` expression anchored at the site latitude is exact
and the line stays true to scale. A selected line is two pixels wider. Features without `width_m`
(everything drawn before) keep their pixel `style.stroke_width`; the PNG/PDF export still uses that
pixel width.

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
