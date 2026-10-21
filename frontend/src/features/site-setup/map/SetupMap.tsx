import type { Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef } from "react";

import type { Site } from "../../../entities/site";
import { MapView } from "../../map/MapView";
import { countryBBox } from "../countries";
import { bboxOf, type LngLat } from "../geometry";
import { setupLayerRegistry } from "./setupRegistry";

interface SetupMapProps {
  countryCode: string | null;
  /** Corners typed so far (open ring). */
  points: LngLat[];
  /** Called with [lng, lat] when the user clicks the map. */
  onAddPoint(point: LngLat): void;
  /** Re-frame the map on the points whenever this changes (not on first render). */
  fitToken: number;
}

const FIT_PADDING = 64;
const MAX_FIT_ZOOM = 19;
const DRAFT_SITE_ID = "draft";

/**
 * A stand-in `Site` so the shared `<MapView>` can show a boundary that doesn't exist yet. Its id is
 * constant (the map instance is created once, framed on the country); only `boundary` changes, which
 * re-syncs the layers. See `draftBoundaryLayer` for how the corners travel.
 */
function draftSite(countryCode: string | null, points: LngLat[]): Site {
  const [lng, lat] = points[0] ?? [0, 0];
  return {
    id: DRAFT_SITE_ID,
    owner_id: null,
    name: "",
    country_code: countryCode,
    boundary: { type: "Polygon", coordinates: [points] },
    centroid: { type: "Point", coordinates: [lng, lat] },
    bbox: countryBBox(countryCode),
    area_m2: 0,
    utm_epsg: 0,
    created_at: "",
    updated_at: "",
  };
}

/** The shared map, set up for drawing a boundary: country framing, click-to-add, live preview. */
export function SetupMap({ countryCode, points, onAddPoint, fitToken }: SetupMapProps) {
  const mapRef = useRef<MapLibreMap | null>(null);
  const onAddPointRef = useRef(onAddPoint);
  onAddPointRef.current = onAddPoint;
  const pointsRef = useRef(points);
  pointsRef.current = points;

  // The map is created once per mount, so the country only frames the first view; `points` and
  // the country change the draft site's content, not its identity.
  const site = useMemo(() => draftSite(countryCode, points), [countryCode, points]);

  const fitToPoints = useCallback((map: MapLibreMap) => {
    const box = bboxOf(pointsRef.current);
    if (box) map.fitBounds(box, { padding: FIT_PADDING, maxZoom: MAX_FIT_ZOOM, duration: 0 });
  }, []);

  const handleReady = useCallback(
    (map: MapLibreMap) => {
      mapRef.current = map;
      map.getCanvas().style.cursor = "crosshair";
      map.on("click", (event) => {
        onAddPointRef.current([event.lngLat.lng, event.lngLat.lat]);
      });
      fitToPoints(map);
    },
    [fitToPoints],
  );

  const lastFit = useRef(fitToken);
  useEffect(() => {
    if (fitToken === lastFit.current) return;
    lastFit.current = fitToken;
    if (mapRef.current) fitToPoints(mapRef.current);
  }, [fitToken, fitToPoints]);

  return <MapView site={site} registry={setupLayerRegistry} onMapReady={handleReady} />;
}
