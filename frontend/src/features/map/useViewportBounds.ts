import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useState } from "react";

import type { ViewBounds } from "./layers/gridLayer";

const round = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * The map's current viewport once the map has settled (not on every frame of a pan), or null
 * while `active` is false. Switching off drops the bounds so nothing is tracked or rebuilt.
 */
export function useViewportBounds(map: MapLibreMap | null, active: boolean): ViewBounds | null {
  const [bounds, setBounds] = useState<ViewBounds | null>(null);
  useEffect(() => {
    if (!map || !active) {
      setBounds(null);
      return;
    }
    const read = () => {
      const view = map.getBounds();
      const next: ViewBounds = [
        round(view.getWest()),
        round(view.getSouth()),
        round(view.getEast()),
        round(view.getNorth()),
      ];
      setBounds((previous) =>
        previous && previous.every((value, index) => value === next[index]) ? previous : next,
      );
    };
    read();
    map.on("moveend", read);
    map.on("resize", read);
    return () => {
      map.off("moveend", read);
      map.off("resize", read);
    };
  }, [map, active]);
  return bounds;
}
