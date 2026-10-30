# Changelog

All notable changes to Maumbile are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Release process: [`docs/RELEASING.md`](docs/RELEASING.md).

## [Unreleased]

## [0.7.1] - 2026-10-30

### Added

- **The plan PDF export has more pages and is easier to navigate.** A dedicated **Zones** page joins
  the sectors, elements and terrain pages; every page is named as a bookmark in the PDF outline so a
  reader can jump straight to a view; and a footer note tells the reader when hidden layers have been
  left out of the export.
- **Choose how many labels the PNG/PDF export prints.** A new control offers **Tidy** (the default —
  each distinct name shown once, so a plan with ten "Garden bed"s stops piling labels on top of each
  other), **All** (every feature labelled, as before) and **Icons only** (no labels).

### Changed

- Renamed the **Noise** sector to **Nuisance**, its standard permaculture name (the stored data key
  is unchanged, so existing plans keep working).

## [0.7.0] - 2026-10-30

### Added

- **A richer element palette.** Twelve new elements for smallholder plots — banana circle, keyhole
  garden, orchard, goat pen, cattle shed, pig pen, rabbit hutch, fish pond, borehole, dam, grain
  store and biogas digester — each with its own map icon, a to-scale footprint and sensible default
  needs/yields drawn from the existing function vocabulary (additive migration `0016_more_elements`).
- **The plan export (PDF) is split into readable pages.** Instead of one crowded page, the PDF now
  has a page each for the overview, the sectors, the elements and — new — the terrain, with slope
  shading, contour lines and an elevation/slope summary. Each page is framed to its own content so
  the detail is legible. The PNG stays a single overview image.

### Fixed

- **The terrain toggle (slope and contours) now appears in every editor step**, including the
  Sectors & terrain step, matching the rest of the map tools.

## [0.6.0] - 2026-10-29

### Added

- **Export and import a whole site between accounts.** Download a site — its boundary and every
  plan (layers, features, goals) — as a portable `.maumbile.json` file, and import that file into
  another account to recreate it there as an **independent, editable copy** (fresh ids, owned by the
  importer). Element types are mapped by their stable key and layer roles are preserved; the import
  is validated as untrusted input. There is no live link between the two copies.

## [0.5.2] - 2026-10-29

Supersedes the never-released 0.5.1, whose build missed the matching `uv.lock` version bump.

### Fixed

- **Zones are coloured by their number.** Every Zone 1 (2, 3, …) now shares one colour, new zones
  get distinct defaults (home-red through wild-purple instead of all-orange), and recolouring a
  zone recolours every zone of that number at once — so the map legend always matches what's drawn.

## [0.5.0] - 2026-10-29

A maintainability and robustness pass (no new user-facing features): editor restructure, stable
layer roles, more faithful exports, and stronger CI guardrails.

### Fixed

- Keep unsaved editor drafts open after failed refreshes or an expired session.
- Route drawing to stable layer roles even when a destination is renamed or hidden; preserve
  those roles when duplicating plans (additive migration `0015_layer_roles`).
- Export one consistent design revision, preserve path widths in metres and planting rows in
  PNG/PDF, and match the editor's layer stacking order.

### Changed

- Separate editor persistence, recovery UI, keyboard handling, imagery/sector policies and map
  controls; update design sources incrementally rather than rebuilding them for each edit.
- Enforce React Hooks rules, unused-code checks, backend module boundaries and stronger Python
  typing in CI. Declare previously transitive test/type dependencies and remove unused exports.
- Close pooled resources on shutdown, isolate terrain repository/session ownership, align source
  versions and stamp both release images from their tag.
- Add a complete local release preflight using a unique disposable browser-test stack. Backend
  image package downloads use HTTPS with bounded timeouts/retries.

## [0.4.1] - 2026-10-29

Follow-ups from live testing of 0.3.0: one consistent way to add sectors, and a basemap switcher.
(Supersedes the never-released 0.4.0, whose build failed its backend verify gate.)

### Changed

- **Unified, kind-first sector adding.** Every sector kind (sun included, no longer a privileged
  button) is a chip in one chooser: pick a kind, then add it in one click — a wedge dropped at the
  site centre to drag into place — or draw it by hand, as a rectangle, or from bearings. A drawn
  sector now takes the chosen kind and colour instead of always defaulting to wind.
- **The Layers control is simpler** — visibility and draw order only. New shapes file into their
  own kind's layer automatically, so the confusing "new shapes go into" selector is gone.

### Added

- **A basemap switcher over the map** (Google-Maps style): flip between the layers that cover the
  site. Alongside Esri (sharpest aerial) and Sentinel-2 (cloud-free context) there is now an
  **OpenStreetMap streets layer**, sharp to zoom 19 and handy for tracing roads and boundaries.
  Switching only changes the picture — lines, areas and measurements are computed from coordinates
  and never move. A note flags when a low-resolution layer (Sentinel ~10 m) is active.

## [0.3.0] - 2026-10-29

A round of design-editor improvements from hands-on feedback: more direct shaping and placing,
planting shown as rows, path widths drawn to scale, and an optional satellite source per site.

### Added

- **A toggleable compass** on the map (N/E/S/W), a view aid alongside the distance grid.
- **Per-site satellite source.** Esri stays the default; where another basemap covers the site
  (e.g. Sentinel-2 cloudless) you can switch to it — useful for tracing borders under tree cover.
  The choice is remembered per site and does not affect measurements, which are computed from the
  geometry, not the imagery.
- **Round or rectangular footprints.** Any footprint element (water tank, house, shed, …) can be
  switched between a circle and a rectangle, and its editor now spells out the shape, the exact size
  and the resulting area — so a Ø5 m tank reading ~19.6 m² (not 25) is no longer surprising.
- **Free-form element shapes.** A footprint element can be reshaped freely into a custom polygon —
  drag corners, add or remove points — with a way back to a plain rectangle.
- **Path and road width in metres.** Paths and roads carry a real-world width (e.g. a 1 m path, a
  4 m road) and are drawn to scale on the map, holding that width across zoom.
- **Rows of icons along a line.** A line can repeat a chosen icon (tree, shrub, …) at an adjustable
  spacing — so a windbreak or hedge shows as a row of trees, and drawing a line then setting an icon
  and spacing places evenly spaced trees as a single editable object.
- **In-editor plan switcher and "Duplicate plan".** Switch between a site's plans without leaving
  the editor, and save the current design as a new plan to explore variants.
- Additive migrations `0013_path_widths` and `0014_row_icons` add the path/road width and
  line-row defaults to the element catalogue. Existing plans and features are retained.

### Changed

- **A clearer add → edit → done flow** in every step: a prominent banner while placing something
  (with an explicit "Stop placing") and a plain "Done" when editing an item, so it is always obvious
  what the next click will do.
- **The sector panel is rebalanced** — its add options (Sun path, Draw by hand, Rectangle, From
  bearings) read as equal choices instead of the sun dominating.

## [0.2.4] - 2026-10-28

Clearer editor panels and map controls, from more hands-on testing.

### Changed

- **One consistent "list is home" flow** in every step (Elements, Sectors, Zones, Functions):
  the panel shows how to add at the top and the list of what you have placed below; selecting an
  item (in the list or on the map) drills into just that item's editor, with a plain "← All …"
  breadcrumb back to the list. The floating "added — place another / Done" box is gone, so adding
  and editing no longer overlap.
- **Adding a sector is kind-first**, not sun-first: pick wind, water, fire, sun, … and add. The
  sun's-path shortcut and the compass-bearings adder are still there, folded so the sector list
  sits near the top.

### Added

- A **"Layers" control on the map** (beside Legend and Terrain) for layer visibility, draw order
  and which layer new shapes go into — whole-map settings now live in one place instead of being
  repeated inside every step as "Layers & context".

### Fixed

- A self-crossing shape now shows a plain "this shape crosses itself — drag the corner back or
  press Undo" instead of a raw save error.

## [0.2.3] - 2026-10-28

Terrain and sectors become hands-on, from more online testing.

### Added

- **Drag a sector on the map.** A sun or from-bearings sector now has handles: drag the centre to
  move the whole wedge, drag an edge to open or close it, and drag the arc to resize it — the same
  shape the panel edits by number. Hand-drawn sectors keep their by-vertex editing.
- **Rectangle sectors.** Besides the wedge (good for what radiates from a direction, like sun and
  wind) and freehand drawing, a sector can be drawn as a clean rectangle — a band along a road,
  fence or other straight edge — and set to any sector kind.
- **A Terrain control over the map**, in every step and in both simple and guided modes: show or
  hide the slope fill and contour lines while you place things (without recomputing), recompute the
  terrain after moving the border, and jump straight to editing the land boundary.

### Changed

- The slope legend is compact — one line per class (colour, range and its share of the mapped
  slope) — so it no longer wraps and crowds the panel.

## [0.2.2] - 2026-10-27

A reliability and UX pass: safer saves and operational hardening (audit), plus editor and
site-setup improvements from hands-on testing. (0.2.0 and 0.2.1 were superseded before release by CI test fixes.)

### Fixed

- Stale editor tabs cannot overwrite newer changes or restore deleted features. Document writes
  use a revision check and atomically save changed features, deletions, layers and goals.
- Boundary autosave and global save feedback now include invalid/failed border changes. Exports
  save pending work first; conflicts offer an unsaved-draft download and navigation offers Save and leave.
- Protected map tiles renew expired sessions; concurrent tabs coordinate session refresh.
- Interrupted terrain jobs offer a retry. Slope statistics clearly describe available bbox data.
- Share secrets are redacted in backend logs and excluded from nginx share-route diagnostics.
- Missing hashed assets return 404, entry pages revalidate and hashed assets use immutable caching.
- Sites and plan lists have Load more controls beyond the first 100 records.

### Added

- Editor **add-vs-edit panel modes**: with nothing selected the panel shows the palette and the list
  of placed items; select one and it shows just that item, with a "← Back to adding" control, so
  adding, browsing and editing no longer mix (Elements, Zones, Sectors, Functions).
- **Flexible coordinate paste** in site setup: decimal, hemisphere letters, degrees/minutes/seconds,
  and Plus Codes — full codes decode locally, and a short code with its town ("9R6P+HQ, Kilifi") is
  resolved via OpenStreetMap Nominatim (free, keyless).
- **Clearer next-step guidance**: a "Next, design it" banner on the site map and a plain explanation
  of plans on the plans list.
- Site rename/deletion controls, account-scoped unfinished-site recovery in the current tab,
  clearer placement actions, and a land boundary in GeoJSON exports.
- Optional SMTP password recovery with hashed one-time tokens and immediate session invalidation.
- Bounded expensive work and auth-throttle state, shorter database read scopes, expired-row
  maintenance tooling, and a verification gate before release image publication.
- Additive migrations `0011_plan_revision` and `0012_password_recovery`. Existing plans/accounts
  are retained. Older frontend tabs must reload before editing a plan that has used protected saving.

## [0.1.4] - 2026-10-26

More fixes from online testing.

### Added

- Plans can be **renamed** and **deleted** from the plans list.
- An obvious segmented **Simple / Guided** switch above the editor (replacing the faint text link).

### Changed

- The **Save design** button is no longer permanently greyed out: the design autosaves, so the
  button appears only when there is something to save or a failed save to retry — otherwise the
  status line confirms everything is saved.

### Fixed

- Measuring: **Esc** now clears the measurement, including a finished line (which the draw engine
  leaves on the map and never saves).

## [0.1.3] - 2026-10-26

Fixes from online testing.

### Added

- The footer shows the running app version (next to Terms · Privacy), stamped from the release tag.
- Press **Delete** (or Backspace) to remove the selected feature; **right-click a point** to delete
  that vertex. Once something is selected, the map hint explains both.

### Fixed

- Measuring a distance no longer blanks out after the second click. Terra Draw emits a helper point
  carrying the line's mode once a line has two points; the live reading now matches on geometry type,
  so the distance stays visible as you keep clicking.

## [0.1.2] - 2026-10-25

A simpler, less-jargon design editor, from a hands-on beginner walkthrough.

### Added

- A **simple editor mode**: new plans open straight to placing things on the map — the element palette
  and the map — with a one-line switch to the full guided method. The choice is remembered per browser.
- Plain-language glosses under every guided step (Sectors "sun · wind · water", Zones "how often you
  visit", Functions "needs & gives", …) and one-line hints for specialist palette items (swale, herb
  spiral, food forest, windbreak, …).

### Changed

- The element palette drops the Zone and Sector entries (they have their own steps) and groups the rest
  under tidy, capitalized categories.
- On phones the satellite map now leads the editor instead of being pushed below the controls.

## [0.1.1] - 2026-10-25

Editor UX refinements from hands-on testing.

### Fixed

- Measuring a distance no longer blinks away after the second click: the live reading now follows the
  line (or area) being drawn instead of whichever shape was last in the drawing snapshot, and clears
  only when the tool changes.

### Changed

- Sun and from-bearings sectors are reshaped from the panel — kind, bearings, a new **Radius** field
  and rotate, all of which redraw the wedge — instead of exposing every arc vertex as a drag handle.
  Hand-drawn sectors stay freely editable.
- The step sidebar is calmer: the "also show faintly" context toggles and the layer controls are
  folded into one collapsed "Layers & context" disclosure, so each step shows its question, its panel
  and the map by default.

## [0.1.0] - 2026-10-25

First public release.

### Added

- Accounts: register, sign in/out, httpOnly-cookie sessions, login throttling.
- Sites: country-first site setup, editable boundaries, per-site aerial imagery with visible
  attribution and a "Data sources & credits" page.
- Terrain: Copernicus DEM GLO-30 elevation, contours and slope/aspect overlays.
- Planning and design editor: zones, sectors, elements, layers, a measuring ruler, an optional
  metric distance grid and live feature dimensions.
- Export: GeoJSON (round-trippable), scaled A4 PNG/PDF plans and read-only share links.
- Deployment: production-shaped Docker Compose stack (database, backend, frontend) with required
  secrets, Secure cookies and migrate-then-serve; smoke-test script; Coolify runbook.
- Released under AGPL-3.0. All instance configuration and secrets live in the environment, never
  in the repository.

[Unreleased]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.7.1...HEAD
[0.7.1]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.5.0...v0.5.2
[0.5.0]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.3.0...v0.4.1
[0.3.0]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.2.4...v0.3.0
[0.2.4]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.1.4...v0.2.2
[0.1.4]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/releases/tag/v0.1.0
