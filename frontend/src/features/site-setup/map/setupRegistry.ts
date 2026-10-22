import { createLayerRegistry } from "../../map/layers/registry";
import type { MapLayerDefinition } from "../../map/layers/types";
import { draftBoundaryLayer } from "./draftBoundaryLayer";

export const SETUP_BASEMAP_LAYER_ID = "setup-basemap";

/**
 * Before a site exists there is no per-site imagery proxy to draw from, so the setup map uses a
 * global basemap to help the user find their land. It defaults to **Esri World Imagery** (satellite):
 * a street map hides compounds, so you need to *see* your land to place corners precisely. Esri is
 * keyless and global; its tiles use `{z}/{y}/{x}` order. Override with `VITE_SETUP_BASEMAP_URL`,
 * `VITE_SETUP_BASEMAP_ATTRIBUTION` and `VITE_SETUP_BASEMAP_ATTRIBUTION_URL` (e.g. to use OpenStreetMap
 * instead). The credit is always shown by `<SetupAttribution>`; see "Imagery" in docs/DATA_SOURCES.md.
 */
export const SETUP_BASEMAP_URL: string =
  import.meta.env.VITE_SETUP_BASEMAP_URL ??
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export const SETUP_BASEMAP_ATTRIBUTION: string =
  import.meta.env.VITE_SETUP_BASEMAP_ATTRIBUTION ?? "Esri, Maxar, Earthstar Geographics";

export const SETUP_BASEMAP_ATTRIBUTION_URL: string =
  import.meta.env.VITE_SETUP_BASEMAP_ATTRIBUTION_URL ??
  "https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9";

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
