# Changelog

All notable changes to Maumbile are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Release process: [`docs/RELEASING.md`](docs/RELEASING.md).

## [Unreleased]

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

[Unreleased]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/releases/tag/v0.1.0
