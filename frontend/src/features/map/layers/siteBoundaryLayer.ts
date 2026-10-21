import type { MapLayerDefinition } from "./types";

export const SITE_BOUNDARY_LAYER_ID = "site-boundary";

/** Outline of the site's land, drawn over the imagery. */
export const siteBoundaryLayer: MapLayerDefinition = {
  id: SITE_BOUNDARY_LAYER_ID,
  label: "Site boundary",
  toggleable: true,
  defaultVisible: true,
  build({ site }) {
    return {
      sources: {
        [SITE_BOUNDARY_LAYER_ID]: {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: site.boundary },
        },
      },
      layers: [
        {
          id: `${SITE_BOUNDARY_LAYER_ID}-fill`,
          type: "fill",
          source: SITE_BOUNDARY_LAYER_ID,
          paint: { "fill-color": "#ffd23f", "fill-opacity": 0.08 },
        },
        {
          id: `${SITE_BOUNDARY_LAYER_ID}-line`,
          type: "line",
          source: SITE_BOUNDARY_LAYER_ID,
          paint: { "line-color": "#ffd23f", "line-width": 2.5 },
        },
      ],
    };
  },
};
