/**
 * Esri World Imagery (the keyless source behind both the setup basemap and the per-site imagery
 * proxy) stops serving real photos in rural East Africa at z18. Deeper requests return a
 * "Map data not yet available" placeholder with HTTP 200, which MapLibre cannot detect.
 *
 * So imagery sources declare this as their `maxzoom` (MapLibre then *over-zooms*: it upscales the
 * deepest real tile instead of asking for a placeholder) and framing never fits deeper than it.
 * Verified against rural Tanzania, where z19 is the placeholder and z18 is real. One constant, so
 * the sources and the fit limits cannot drift apart.
 */
export const IMAGERY_MAX_ZOOM = 18;

/** The deepest zoom that automatic framing (fit to boundary, to the site) may choose. */
export const MAX_FIT_ZOOM = IMAGERY_MAX_ZOOM;

/** Zoom used to show a single known coordinate, e.g. before a boundary has any corners. */
export const POINT_FOCUS_ZOOM = 16;
