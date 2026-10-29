import { absoluteApiUrl } from "../../../shared/config";
import type { MapLayerDefinition } from "./types";
import { IMAGERY_MAX_ZOOM } from "./zoomLimits";

/** XYZ template for the backend imagery proxy (docs/ARCHITECTURE.md §6). */
export function imageryTileUrl(siteId: string): string {
  return absoluteApiUrl(`/sites/${encodeURIComponent(siteId)}/imagery/{z}/{x}/{y}.png`);
}

const IMAGERY_LAYER_ID = "imagery";

/** The site's aerial imagery, served by the backend proxy (provider chosen server-side). */
export const imageryLayer: MapLayerDefinition = {
  id: IMAGERY_LAYER_ID,
  label: "Aerial imagery",
  toggleable: false,
  defaultVisible: true,
  build({ site, imagery }) {
    if (imagery && !imagery.covered) return null;
    return {
      sources: {
        [IMAGERY_LAYER_ID]: {
          type: "raster",
          tiles: [
            imagery?.tile_url_template
              ? new URL(imagery.tile_url_template, absoluteApiUrl("/")).href.replace(
                  /%7B([zxy])%7D/gi,
                  "{$1}",
                )
              : imageryTileUrl(site.id),
          ],
          tileSize: 256,
          // Never request tiles past real coverage (Esri serves a 200 placeholder there); a provider
          // with less depth than that (e.g. 13) still wins.
          maxzoom: Math.min(imagery?.max_zoom ?? IMAGERY_MAX_ZOOM, IMAGERY_MAX_ZOOM),
          // Credit line is rendered by <ImageryAttribution>, which is always visible.
        },
      },
      layers: [{ id: IMAGERY_LAYER_ID, type: "raster", source: IMAGERY_LAYER_ID }],
    };
  },
};
