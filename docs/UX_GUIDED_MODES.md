# Guided planning modes & map-first UX

The product's core is the **design process**, and that process can overwhelm beginners. This document
is the design brief for making the tool *guided and calm* instead of a blank everything-at-once editor.
It is the next priority after WP10/WP11. Pair with [`ARCHITECTURE.md`](ARCHITECTURE.md),
[`DESIGN_EDITOR.md`](DESIGN_EDITOR.md) (the WP9 engine this builds on) and [`CLAUDE.md`](../CLAUDE.md).

## Principle: one focus at a time, over one saved design

Show the user the *right tool at the right moment*. The editor becomes a shell with a **focus switcher**;
each focus edits one layer of the design while the others are faint, toggleable **context**.

**Focus modes (suggested order, not forced):**

0. **Goals** — what do I want from this land? Priorities (water first) and a few words; optional
   and skippable (`plans.goals`, see `DESIGN_EDITOR.md`).
1. **Boundary** — see the land (satellite) and set/adjust the border.
2. **Sectors & terrain** — incoming energies (sun arc, prevailing & cold winds, water flow, fire, views,
   noise) + slope/contours (WP5/WP10). "What is this site subject to?"
3. **Zones** — zones 0–5 by frequency of visit; rough areas over the map.
4. **Elements** — place concrete things (house, beds, trees, pond, swales, paths, fence…).
5. **Functions & connections** — each element's needs/yields; the permaculture check (every function
   met by several elements; every element serving several functions); guild/relationship view.

**Anti-overwhelm rules:**
- Only the current focus is editable; other layers render dimmed and can be toggled on/off for context.
- A gentle suggested order and "next" nudge, but full **back-and-forth** — never a locking wizard.
- Progressive disclosure: advanced options stay hidden until asked for; strong sensible defaults.
- The **map is the workspace**; side panels are minimal and specific to the current focus.

## Everything is saved and reusable (owner's requirement)

Focus modes are **filtered views over one persisted design**, never separate documents:

- The **boundary is the Site** (already persisted). Centroid/bbox/UTM derive from it.
- **Sectors, zones, elements** are persisted **Features** on the site's **Plan**, distinguished by
  `feature_type` (`sector` | `zone` | `element` | `path` | `annotation`) with typed `properties`.
  **Functions/connections** attach to elements via `properties` (and, later, relationship records).
- A focus mode loads the whole plan once, makes its own `feature_type`(s) editable, and shows the rest
  as context. Saving uses the existing batch-upsert; work done in one mode is immediately available in
  every other mode. Moving Boundary → Sectors reuses the same boundary with zero re-entry.

No data-model change is required for this; it is a UI/UX layer over WP6 (planning) + WP9 (editor).

## The map is the game-changer — reliability bar

Map interaction quality is make-or-break. Required behaviors:

- **Satellite under the map everywhere**, including **site setup** — you must see your actual land to
  place corners. (Setup now defaults to Esri World Imagery; street maps hide compounds.)
- **Reliable at every zoom**: zoom in/out must keep drawing, corner placement and editing correct and
  precise; no drift between where you click and where the point lands.
- **Precise corner work**: click to add, **drag to nudge** a corner, snap to existing vertices, delete a
  vertex, and **undo/redo** — on the boundary and on every drawn feature.
- Clear visual feedback (hover, selected vertex, invalid ring in red) and a "zoom to my boundary" action.
- Performance smooth on a modest device and connection (East Africa).

## Scope for the next wave (after WP10/WP11)

- **Map reliability pass** first (**done**; see `frontend/README.md` "Boundary editing on the map" and
  `DESIGN_EDITOR.md` "Map reliability"): satellite setup basemap; precise corner placement, drag, snap,
  select, delete, undo/redo and zoom-to-boundary on the setup map; snapping, tighter reach and tolerant
  picking in the editor; zoom-stable drawing, verified with tests and in real MapLibre. Not done: inserting
  a corner into the middle of the setup ring (the editor has midpoint handles) and snapping to edges.
- **Guided focus-mode shell** over the WP9 editor: focus switcher, per-mode tool palettes, dim-context
  layers, save-on-the-fly, free navigation between modes.
- Keep it lean: start with Boundary / Sectors / Zones solid; Elements and Functions build on the same
  shell. Progressive disclosure throughout.
