import type { MapLayerDefinition } from "./types";
import { slopeOverlayGeoJSON } from "./slopeOverlay";

/** Layers of this group are toggled from the terrain panel (see `features/terrain`). */
export const TERRAIN_GROUP = "terrain";
export const TERRAIN_SLOPE_LAYER_ID = "terrain-slope";
export const TERRAIN_CONTOURS_LAYER_ID = "terrain-contours";

/** Slope classes as translucent colour fill, drawn straight from the backend's slope grid. */
export const terrainSlopeLayer: MapLayerDefinition = {
  id: TERRAIN_SLOPE_LAYER_ID,
  label: "Slope",
  group: TERRAIN_GROUP,
  toggleable: true,
  // The fill hides the imagery it explains, so the user opts in.
  defaultVisible: false,
  build({ terrain }) {
    if (terrain?.status !== "ready" || !terrain.slope || !terrain.slope_grid) return null;
    return {
      sources: {
        [TERRAIN_SLOPE_LAYER_ID]: {
          type: "geojson",
          data: slopeOverlayGeoJSON(terrain.slope_grid, terrain.slope.legend),
        },
      },
      layers: [
        {
          id: `${TERRAIN_SLOPE_LAYER_ID}-fill`,
          type: "fill",
          source: TERRAIN_SLOPE_LAYER_ID,
          // Adjacent cells share edges; anti-aliasing would draw faint seams between them.
          paint: { "fill-color": ["get", "color"], "fill-opacity": 0.5, "fill-antialias": false },
        },
      ],
    };
  },
};

/** Elevation contours; every fifth ("index") line is drawn heavier, as on topographic maps. */
export const terrainContoursLayer: MapLayerDefinition = {
  id: TERRAIN_CONTOURS_LAYER_ID,
  label: "Contour lines",
  group: TERRAIN_GROUP,
  toggleable: true,
  defaultVisible: true,
  build({ terrain }) {
    if (terrain?.status !== "ready" || !terrain.contours?.features.length) return null;
    return {
      sources: {
        [TERRAIN_CONTOURS_LAYER_ID]: {
          type: "geojson",
          // The contract types GeoJSON geometry loosely (`Record<string, unknown>`).
          data: terrain.contours as unknown as GeoJSON.FeatureCollection,
        },
      },
      layers: [
        {
          id: `${TERRAIN_CONTOURS_LAYER_ID}-line`,
          type: "line",
          source: TERRAIN_CONTOURS_LAYER_ID,
          filter: ["!=", ["get", "index"], true],
          layout: { "line-join": "round" },
          paint: { "line-color": "#e0f7fa", "line-width": 1, "line-opacity": 0.85 },
        },
        {
          id: `${TERRAIN_CONTOURS_LAYER_ID}-index`,
          type: "line",
          source: TERRAIN_CONTOURS_LAYER_ID,
          filter: ["==", ["get", "index"], true],
          layout: { "line-join": "round" },
          paint: { "line-color": "#4dd0e1", "line-width": 2.25, "line-opacity": 0.95 },
        },
      ],
    };
  },
};
