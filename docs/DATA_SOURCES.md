# Data Sources & Rights

This is the canonical record of every external data source Maumbile (the Permaculture Planner) can use, its
license, the attribution we must show, whether we may cache it, and where to verify the terms.

The app surfaces this information live (map attribution control + a "Data sources & credits" page)
generated from each provider adapter's metadata (`attribution`, `license`, `terms_url`, `cacheable`),
so what users see cannot drift from this table. **When you add a provider adapter, add a row here.**

> **Project stance:** this is a free, non-commercial, open tool for everyone — built to help people
> design permaculture, especially in lower-income regions. We use only sources we can use at no cost
> without a paid plan or API key in the default config, and we always display their attribution.
>
> **Third-party data stays under its own license.** Maumbile's code is AGPL-3.0, but the imagery and
> elevation it displays belongs to the providers below and is *not* relicensed by this project. We
> keep Esri World Imagery as the default for its resolution in our target regions, under the
> free, non-commercial public-good stance. **Anyone using Maumbile or its outputs commercially is
> responsible for obtaining the appropriate licenses from these providers** (Esri imagery in
> particular needs its own license for commercial use). See [`TERMS.md`](TERMS.md) §5.

## Imagery

| Provider (`key`) | License | Attribution shown | Key? | Cacheable | Terms |
|---|---|---|---|---|---|
| Esri World Imagery (`esri_world_imagery`) | Esri Terms of Use (grey for commercial; used here for a free/non-commercial deployment with attribution) | "Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community" | No | **No** (ToS) | https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9 |
| Sentinel-2 cloudless — EOX (`sentinel2_cloudless`) | CC-BY-4.0 | "Sentinel-2 cloudless — https://s2maps.eu by EOX IT Services GmbH (contains modified Copernicus Sentinel data)" | No | Yes | https://s2maps.eu |

- **Esri** is the East-Africa default for resolution; **Sentinel-2 cloudless** is the license-clean,
  keyless fallback/alternative (coarser, ~10 m) and the recommended default if the project ever
  becomes commercial, or if you self-host for a commercial purpose.
- Future (expansion): national open orthophotos (e.g. Europe) are typically open-licensed **and**
  higher-resolution; add them per region with their own attribution rows.

## Elevation

| Provider (`key`) | License | Attribution shown | Key? | Cacheable | Terms |
|---|---|---|---|---|---|
| Copernicus DEM GLO-30 (`copernicus_dem_glo30`) | Free for general public under the Copernicus DEM licence | "Copernicus DEM © ESA (produced from ©Airbus DS and others)" | No (anonymous AWS Open Data) | Yes | https://registry.opendata.aws/copernicus-dem/ |

- Read anonymously from the public AWS bucket `copernicus-dem-30m` (eu-central-1), unsigned requests.
- Coverage caveats: a few countries' tiles are not yet publicly released; ocean areas have no tiles
  (assume elevation 0). Self-hosted OpenTopoData (keyless, Docker) is the documented alternative.

## Base map / labels

| Provider (`key`) | License | Attribution shown | Key? | Cacheable | Terms |
|---|---|---|---|---|---|
| OpenStreetMap (`osm_standard`) | Map data ODbL 1.0; map tiles © OpenStreetMap Foundation (tile usage policy) | "© OpenStreetMap contributors" | No | Yes (cached to respect the OSMF tile usage policy) | https://www.openstreetmap.org/copyright |

- A selectable basemap in the editor (streets & roads, sharp to zoom 19) alongside the aerial
  sources — handy for tracing roads and boundaries. Proxied with a descriptive User-Agent and
  cached to keep within the [OSMF tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

## Attribution rules (implementation)

1. The active imagery provider's credit line is **always visible** on the map.
2. Every source actually used for a site appears on the **"Data sources & credits"** page with its
   license and a clickable terms link.
3. The proxy caches a provider's responses **only if** its adapter sets `cacheable = True`.
4. Removing/replacing a provider must update its adapter metadata; this table and the in-app page
   follow automatically.
