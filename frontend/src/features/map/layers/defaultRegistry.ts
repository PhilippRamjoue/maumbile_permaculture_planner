import { imageryLayer } from "./imageryLayer";
import { createLayerRegistry } from "./registry";
import { siteBoundaryLayer } from "./siteBoundaryLayer";
import { terrainContoursLayer, terrainSlopeLayer } from "./terrainLayers";

/**
 * The app-wide registry. Later packages register their layers here (or via `.register()` at
 * startup). Registration order is draw order: the slope fill sits on the imagery, the site boundary
 * and contours over it. Design layers (WP9) are drawn by the editor on top of all of these.
 */
export const layerRegistry = createLayerRegistry([
  imageryLayer,
  terrainSlopeLayer,
  siteBoundaryLayer,
  terrainContoursLayer,
]);
