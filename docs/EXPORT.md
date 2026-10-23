# Export & share (WP11)

Gets a plan out of the app: GeoJSON data, a scaled PNG/PDF plan with legend, and an optional
read-only share link. Backend: `backend/app/modules/export/`. Frontend: `frontend/src/features/export/`.

## API

| Route | Auth | Purpose |
|-------|------|---------|
| `GET /api/v1/plans/{id}/export?format=geojson\|png\|pdf` | owner | Download the saved plan. Default `geojson`. `download=false` serves png/pdf inline. |
| `POST /api/v1/plans/{id}/share` | owner | Create a read-only link. Returns `{token, created_at}`; the token is shown **once**. Replaces (revokes) the previous link. |
| `GET /api/v1/plans/{id}/share` | owner | `{shared, created_at}`. Never returns the token. |
| `DELETE /api/v1/plans/{id}/share` | owner | Revoke the link (idempotent). |
| `GET /api/v1/shared/{token}/export?format=...` | **none** (token) | Same export, default `png`, through a share token. |

Errors follow the planning module: 404 for a missing/deleted plan or an invalid share token,
403 when a signed-in user does not own the plan's site, 401 when not signed in, 422 for an unknown
`format`. Responses are `Cache-Control: no-store`.

## Formats

- **GeoJSON** (`application/geo+json`): a `FeatureCollection` of every feature, including those on
  hidden layers. Each feature carries `id`, `layer_id`, `feature_type`, `element_type_id` and its
  `properties` exactly as `POST /plans/{id}/features:batch` accepts them, so `features` can be posted
  back unchanged (same plan) or with `layer_id` remapped by layer name using the top-level `layers`
  list (another plan). `plan` holds name/description/site/CRS. Measurements are not exported; the
  server derives them again on save.
- **PNG / PDF**: A4 landscape at 200 dpi (2339x1654 px), rendered with Pillow in
  `render.py` (pure functions over `PlanDocument`). It shows the site boundary, features of
  **visible** layers (top layer drawn on top; polygons under lines under points), feature names,
  a north arrow, a scale bar, the printed scale ratio (`1:N` when printed on A4), a legend of what
  is drawn (zone numbers, sector kinds, element types, with the same icon badge as the map for marked types), the owner's goals (priorities and vision, when
  set) under the title, and an attribution/footer line. The map is
  drawn in a local equirectangular projection centred on the plan (error well below 0.1 % at parcel
  scale; tested against haversine and by measuring a drawn 100 m square in pixels). The PDF is one
  page holding the same image, Flate-compressed (lossless), written by a ~40 line PDF writer to avoid
  a PDF dependency.

Only **saved** data is exported. The editor shows a hint when the design has unsaved changes.

## Share links

A link is a 256-bit random token (`secrets.token_urlsafe(32)`); only its SHA-256 is stored in
`plan_shares` (migration `0006_plan_shares`, one active row per plan, cascade-deleted with the plan).
The link acts with its grantor's **read** access: `plan_shares.owner_id` is the user who created
it, and the export loads the plan as that user. The link therefore stops working (404) when the
plan or site is deleted or the site changes owner, and it never grants write access or any other
endpoint. The public page is `/shared/:token` (image plus PNG/PDF/GeoJSON download links).

Trade-offs: the token is a path segment, so it can appear in access logs of whatever serves the
app; treat links as secrets and revoke via **Stop sharing**. There is no rate limiting on the public
endpoint (the token is unguessable and rendering runs in a worker thread).

## Deliberate deferrals

- **No aerial imagery in the render.** Compositing Esri tiles would need per-provider licensing and
  caching decisions (Esri tiles are `cacheable = False`), so the footer says no imagery is included.
  A later option is an opt-in `imagery=true` for providers whose licence allows it, adding the
  provider attribution from the registry.
- No GeoJSON *import* endpoint yet; round-tripping is by posting `features` to `features:batch`.
- Terrain overlays (WP10) are not rendered into the image.
- Vector PDF (fonts/lines as PDF operators) would need a PDF library; the raster page is lossless.
- Text uses Pillow's bundled font; non-Latin scripts render as boxes.
- Link expiry and multiple links per plan.

## Tests

- `export/tests/test_render.py` (no Docker): size/dpi, scale correctness, draw order, legend, styles,
  dashes, PDF structure (xref offsets, page size, decompressed pixel count), GeoJSON shape, filenames.
- `export/tests/test_export_api.py` (PostGIS): GeoJSON round trip through `features:batch`, hidden
  layers, PNG/PDF, ownership (403/401/404), share create/replace/revoke, hash-only storage, token
  tampering, dead link after site transfer or plan deletion.
- Frontend `features/export/export.test.tsx`: download with server filename, link creation/revocation,
  one-time link display, public page.
