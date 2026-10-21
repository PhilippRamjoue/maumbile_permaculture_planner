import { createLayerRegistry } from "../../map/layers/registry";
import type { MapLayerDefinition } from "../../map/layers/types";
import { draftBoundaryLayer } from "./draftBoundaryLayer";

export const SETUP_BASEMAP_LAYER_ID = "setup-basemap";

/**
 * Before a site exists there is no per-site imagery proxy to draw from, so the setup map uses a
 * plain street basemap to help the user find their land. Defaults to OpenStreetMap (ODbL, listed
 * under "Base map" in docs/DATA_SOURCES.md); override with `VITE_SETUP_BASEMAP_URL` (a `{z}/{x}/{y}`
 * template) and `VITE_SETUP_BASEMAP_ATTRIBUTION`. Its credit is always shown by `<SetupAttribution>`.
 */
export const SETUP_BASEMAP_URL: string =
  import.meta.env.VITE_SETUP_BASEMAP_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const SETUP_BASEMAP_ATTRIBUTION: string =
  import.meta.env.VITE_SETUP_BASEMAP_ATTRIBUTION ?? "© OpenStreetMap contributors";

export const setupBasemapLayer: MapLayerDefinition = {
  id: SETUP_BASEMAP_LAYER_ID,
  label: "Base map",
  toggleable: false,
  defaultVisible: true,
  build() {
    return {
      sources: {
        [SETUP_BASEMAP_LAYER_ID]: {
          type: "raster",
          tiles: [SETUP_BASEMAP_URL],
          tileSize: 256,
          maxzoom: 19,
        },
      },
      layers: [{ id: SETUP_BASEMAP_LAYER_ID, type: "raster", source: SETUP_BASEMAP_LAYER_ID }],
    };
  },
};

/** The layers of the setup map, bottom → top. Separate from the app-wide registry on purpose. */
export const setupLayerRegistry = createLayerRegistry([setupBasemapLayer, draftBoundaryLayer]);
