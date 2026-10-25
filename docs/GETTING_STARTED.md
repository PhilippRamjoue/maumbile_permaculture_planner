# Getting started with Maumbile

Maumbile helps you design a permaculture site **on a real satellite map of your land** — calmly,
one step at a time. This page gets you from zero to a first design.

## 1. Open it

- **Hosted (easiest):** go to the public instance (e.g. `https://maumbile.ecosoul.tech`) and create
  an account — nothing to install.
- **Run it yourself:** see the [5‑minute quickstart in the README](../README.md) (Docker Compose:
  copy one file, set two secrets, `docker compose up`). Full server/Coolify steps are in
  [`DEPLOY.md`](DEPLOY.md).

Either way you end up at the same app in your browser.

## 2. Create your site (your land)

1. **Register / log in.**
2. Click **New site**.
3. **Pick your country** (this chooses the right map imagery and units).
4. **Outline your land:** on the satellite map, click each corner of your plot, or paste the
   coordinates (lat, lng — one corner per line), or type them into the table. Drag a corner to nudge
   it; the area updates live.
5. **Name it and create.** You land on your site, framed on your plot, with the real area shown.

> Tip: to place corners precisely, zoom in on the satellite image until you can see your boundaries.

## 3. Design it, step by step

Open **Design plans → new plan**. The editor is a guided set of **focus steps** across the top — do
them in order or jump around freely; everything is one saved design and nothing is lost between steps:

1. **Goals** — what do you want from this land? (water, food, income, habitat, beauty…). Optional, but
   it keeps the design pointed at what matters to you. Water first.
2. **Boundary** — check the yellow border follows your land; drag corners to adjust.
3. **Sectors & terrain** — mark where **sun, wind, water, fire, views** come from, and view the slope
   and contour lines. "What is this site subject to?" Toggle sectors on/off as context.
4. **Zones** — sketch rough areas by how often you visit them (zone 0 = the house, zone 5 = wild).
5. **Elements** — place the concrete things: house, beds, trees, pond, water tank, paths, fences.
6. **Functions & connections** — say what each element **needs** and **gives** (a tree needs water and
   gives shade); Maumbile flags needs nothing provides yet, so you can add the element that supplies it.

In every step the other layers stay visible as faint context, and you can hide/show them.

## 4. The map tools (what paper can't do)

- **Real measurements:** a **ruler** (measure distance/area) and a toggleable **distance grid** (labelled
  every few metres) — switch them on when you want to judge spacing, off otherwise.
- **Elements to scale:** one click drops an element at a sensible real size (a water tank ≈ a 5 m circle,
  a bed ≈ 1.2 m wide). Select it to set the **exact diameter** or **width × length + rotation**.
- **Zoom to boundary** re‑frames on your plot anytime.

## 5. Save, resume, share

- Your design **autosaves** ("Saved ✓"). Come back later and reopen it from **Design plans**.
- **Export** a clean, printable plan as **PNG or PDF** (with a legend), or **GeoJSON** for other tools —
  from the **Export & share** menu. You can also create a read‑only share link.

## That's it

Start rough and to‑scale, then refine. For the ideas behind the steps (zones, sectors, functions) see
[`UX_GUIDED_MODES.md`](UX_GUIDED_MODES.md); for the design/architecture see
[`ARCHITECTURE.md`](ARCHITECTURE.md); for your rights and data, [`TERMS.md`](TERMS.md) and
[`PRIVACY.md`](PRIVACY.md).
