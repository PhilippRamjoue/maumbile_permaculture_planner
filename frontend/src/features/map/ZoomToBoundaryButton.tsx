import type { Map as MapLibreMap } from "maplibre-gl";

import type { BBox } from "../../entities/site";

interface ZoomToBoundaryButtonProps {
  map: MapLibreMap | null;
  /** [west, south, east, north] of the boundary; the button is disabled without one. */
  bounds: BBox | null;
  padding?: number;
}

const MAX_FIT_ZOOM = 19;

/**
 * "Zoom to my boundary": the way back after panning or zooming away from the land. Place it in a
 * `.map-tools` container over the map.
 */
export function ZoomToBoundaryButton({ map, bounds, padding = 48 }: ZoomToBoundaryButtonProps) {
  return (
    <button
      type="button"
      className="btn"
      disabled={!map || !bounds}
      onClick={() => {
        if (map && bounds) map.fitBounds(bounds, { padding, maxZoom: MAX_FIT_ZOOM, duration: 400 });
      }}
    >
      Zoom to boundary
    </button>
  );
}
