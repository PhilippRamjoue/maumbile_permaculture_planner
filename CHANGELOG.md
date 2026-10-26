# Changelog

All notable changes to Maumbile are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Release process: [`docs/RELEASING.md`](docs/RELEASING.md).

## [Unreleased]

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

[Unreleased]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.1.4...HEAD
[0.1.4]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/releases/tag/v0.1.0
