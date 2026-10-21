# Frontend

React + TypeScript + Vite SPA. Map engine: **MapLibre GL**. State: Zustand (UI/editor) +
TanStack Query (server). See [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) §8.

```
src/
├── main.tsx                 # entry
├── app/                     # shell: routes, providers (query client), auth guards, layout
├── entities/                # typed domain models (mirror backend schemas) + shared site queries
├── shared/                  # API client, config, formatting, UI atoms, test helpers
└── features/
    ├── auth/                # login / register pages, current-user + login/logout hooks
    ├── sites-dashboard/     # "My sites" list (+ "New site" entry point)
    ├── site-setup/          # country-first site creation flow (`/sites/new`)
    ├── map/                 # <MapView>, layer registry, always-on attribution, site map page
    └── credits/             # "Data sources & credits" page
```

## How it fits together

- **API client** (`shared/api/client.ts`): every call goes to `/api/v1` with `credentials: "include"`
  (auth is httpOnly cookies). Errors are `ApiError`s parsed from RFC 7807 problem+json. A 401 triggers
  one shared `POST /auth/refresh` and a replay.
- **Auth** (`features/auth`, `app/guards.tsx`): `GET /auth/me` is the source of truth. `RequireAuth`
  redirects anonymous visitors to `/login` (and back afterwards); `GuestOnly` bounces signed-in users.
  The backend's `/register` does not start a session, so registering logs in right after.
- **Routes** (`app/routes.tsx`): `/login`, `/register`, `/credits` (public), `/` (dashboard),
  `/sites/new` (setup flow, code-split), `/sites/:siteId` (map), `/sites/:siteId/credits` (that site's sources). The map page is
  code-split so MapLibre only loads when a site is opened.
- **Map layers** (`features/map/layers`): a layer is a `MapLayerDefinition` (`build(ctx) → sources +
style layers`) registered in `defaultRegistry.ts`. Registration order is draw order. A
  `LayerSynchronizer` diffs the registry against the live map, so a later package adds a layer by
  registering one definition — `MapView` does not change. Built-ins: `imagery` (raster source on
  `/api/v1/sites/{id}/imagery/{z}/{x}/{y}.png`) and `site-boundary`.
- **Attribution** (`features/map/ImageryAttribution.tsx`): rendered unconditionally over the map from
  `GET /sites/{id}/imagery/meta` (MapLibre's own control is off), with a link to the credits page.
- **Credits** (`features/credits`): `/credits` lists `GET /regions/attribution`; a site's page uses the
  imagery meta and completes license/terms from `/regions/attribution?keys=<provider>` if the meta
  only names the provider.

- **Site setup** (`features/site-setup`, `/sites/new`): step 1 picks the ISO-3166 country (native select,
  East Africa first; a pasted coordinate can suggest one), step 2 collects ≥3 corners by map click, pasted
  list (lat,lng or lng,lat) or an editable table, validates the ring client-side (`geometry.ts`: closable,
  no self-intersection, non-zero area) and `POST /sites {name, country_code, coordinates}`, then opens
  `/sites/:id`. The draft lives in a Zustand store (`store.ts`). The live preview is a
  `MapLayerDefinition` (`map/draftBoundaryLayer.ts`) in its own registry (`map/setupRegistry.ts`) passed to
  the unchanged `<MapView>`; there is no per-site imagery before the site exists, so that map uses a plain
  base map (OpenStreetMap by default; `VITE_SETUP_BASEMAP_URL` / `VITE_SETUP_BASEMAP_ATTRIBUTION`) with its
  credit always visible. Country boxes in `countries.ts` only frame the map and drive suggestions.

## Commands

```bash
npm install
npm run dev          # http://localhost:5173 (proxies /api -> http://localhost:8000)
npm run lint
npm run typecheck
npm test             # Vitest + Testing Library (MapLibre and fetch are faked)
npm run build
npm run format       # prettier

# Optional end-to-end (needs backend + db + `npm run dev`, and WP4's imagery endpoints):
npx playwright install chromium
E2E=1 npm run e2e
```

`VITE_API_BASE_URL` overrides the API base (default `/api/v1`, same-origin).
