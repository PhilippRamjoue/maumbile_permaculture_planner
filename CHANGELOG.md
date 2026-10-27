# Changelog

All notable changes to Maumbile are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Release process: [`docs/RELEASING.md`](docs/RELEASING.md).

## [Unreleased]

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

[Unreleased]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.1.4...v0.2.2
[0.1.4]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/PhilippRamjoue/maumbile_permaculture_planner/releases/tag/v0.1.0
