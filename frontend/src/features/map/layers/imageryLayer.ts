import { absoluteApiUrl } from "../../../shared/config";
import type { MapLayerDefinition } from "./types";

/** Fallback when `/imagery/meta` has not answered (or does not say) — tiles don't need it. */
const DEFAULT_MAX_ZOOM = 19;

/** XYZ template for the backend imagery proxy (docs/ARCHITECTURE.md §6). */
export function imageryTileUrl(siteId: string): string {
  return absoluteApiUrl(`/sites/${encodeURIComponent(siteId)}/imagery/{z}/{x}/{y}.png`);
}

export const IMAGERY_LAYER_ID = "imagery";

/** The site's aerial imagery, served by the backend proxy (provider chosen server-side). */
export const imageryLayer: MapLayerDefinition = {
  id: IMAGERY_LAYER_ID,
  label: "Aerial imagery",
  toggleable: false,
  defaultVisible: true,
  build({ site, imagery }) {
    if (imagery && !imagery.available) return null;
    return {
      sources: {
        [IMAGERY_LAYER_ID]: {
          type: "raster",
          tiles: [imageryTileUrl(site.id)],
          tileSize: 256,
          maxzoom: imagery?.max_zoom ?? DEFAULT_MAX_ZOOM,
          // Credit line is rendered by <ImageryAttribution>, which is always visible.
        },
      },
      layers: [{ id: IMAGERY_LAYER_ID, type: "raster", source: IMAGERY_LAYER_ID }],
    };
  },
};
