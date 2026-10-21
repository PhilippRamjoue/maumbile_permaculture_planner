import { imageryLayer } from "./imageryLayer";
import { createLayerRegistry } from "./registry";
import { siteBoundaryLayer } from "./siteBoundaryLayer";

/**
 * The app-wide registry. Later packages register their layers here (or via `.register()` at
 * startup): terrain overlays (WP10), design layers — zones, sectors, elements, paths (WP9).
 */
export const layerRegistry = createLayerRegistry([imageryLayer, siteBoundaryLayer]);
