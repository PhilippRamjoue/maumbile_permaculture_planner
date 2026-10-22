import imageryContract from "./imagery-contract.json";
import terrainContract from "./terrain-contract.json";

import type { DataSource, ImageryMeta } from "../../entities/imagery";
import type { Site } from "../../entities/site";
import type { TerrainRead } from "../../entities/terrain";
import type { User } from "../../entities/user";

export const user: User = {
  id: "u1",
  email: "wanjiru@example.org",
  display_name: "Wanjiru",
  country_code: "KE",
};

export const site: Site = {
  id: "11111111-1111-1111-1111-111111111111",
  owner_id: "u1",
  name: "Kiambu shamba",
  country_code: "KE",
  boundary: {
    type: "Polygon",
    coordinates: [
      [
        [36.8, -1.2],
        [36.81, -1.2],
        [36.81, -1.21],
        [36.8, -1.21],
        [36.8, -1.2],
      ],
    ],
  },
  centroid: { type: "Point", coordinates: [36.805, -1.205] },
  bbox: [36.8, -1.21, 36.81, -1.2],
  area_m2: 12_345,
  utm_epsg: 32737,
  created_at: "2026-10-01T08:00:00Z",
  updated_at: "2026-10-01T08:00:00Z",
};

export const esri: DataSource = {
  key: "esri_world_imagery",
  category: "imagery",
  attribution: "Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
  license: "Esri Terms of Use",
  terms_url: "https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9",
  cacheable: false,
};

export const sentinel: DataSource = {
  key: "sentinel2_cloudless",
  category: "imagery",
  attribution: "Sentinel-2 cloudless — https://s2maps.eu by EOX IT Services GmbH",
  license: "CC-BY-4.0",
  terms_url: "https://s2maps.eu",
  cacheable: true,
};

export const imageryMeta = imageryContract satisfies ImageryMeta;

/** A `ready` terrain response generated from the backend model (see imagery above). */
// JSON widens the status literal to `string`, hence the cast; every other key is checked by it.
export const terrainReady = terrainContract as TerrainRead;
/** What `GET /terrain` returns before anything was computed: no results, same envelope. */
export const terrainEmpty: TerrainRead = {
  ...terrainReady,
  status: "not_requested",
  contour_interval_m: null,
  dem_source: null,
  attribution: null,
  resolution_m: null,
  requested_at: null,
  computed_at: null,
  contours: null,
  slope: null,
  slope_grid: null,
};
