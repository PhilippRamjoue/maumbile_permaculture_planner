import {
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
  addProtocol,
  type RasterTileSource,
  type RequestParameters,
} from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

import type { ImageryMeta } from "../../entities/imagery";
import type { Site } from "../../entities/site";
import type { TerrainRead } from "../../entities/terrain";
import { absoluteApiUrl } from "../../shared/config";
import { apiResource } from "../../shared/api/client";
import { LayerSynchronizer } from "./layers/applyLayers";
import { layerRegistry } from "./layers/defaultRegistry";
import type { LayerRegistry } from "./layers/registry";
import type { MapLayerContext } from "./layers/types";
import { MAX_FIT_ZOOM } from "./layers/zoomLimits";
import { isLayerVisible, useMapLayerStore } from "./store";

// MapLibre 6 ships a separate module worker. Let Vite bundle it as a real JS asset so
// production nginx serves it with the correct URL and MIME type.
setWorkerUrl(mapWorkerUrl);
addProtocol("maumbile", async (request, controller) => {
  const path = decodeURIComponent(request.url.slice("maumbile://".length));
  if (!/^\/sites\/[^/]+\/imagery\/\d+\/\d+\/\d+\.png$/.test(path))
    throw new Error("Invalid map resource");
  return apiResource(path, controller.signal);
});

interface MapViewProps {
  site: Site;
  /** Undefined while `/imagery/meta` is loading. */
  imagery?: ImageryMeta;
  /** Undefined until `/terrain` has answered; the terrain layers draw it once it is ready. */
  terrain?: TerrainRead;
  registry?: LayerRegistry;
  /** Transient interaction state for layers (hover, selection); see `MapLayerContext.ui`. */
  layerUi?: MapLayerContext["ui"];
  /** Hands the live map to feature code (e.g. the design editor) once its style has loaded. */
  onMapReady?: (map: MapLibreMap) => void;
}

const FIT_PADDING = 48;

/** The imagery proxy is behind the session cookie: make sure tile requests carry it. */
function transformRequest(url: string): RequestParameters {
  const base = absoluteApiUrl("");
  return url.startsWith(`${base}/sites/`) && url.includes("/imagery/")
    ? { url: `maumbile://${encodeURIComponent(url.slice(base.length))}` }
    : { url };
}

/**
 * Owns the MapLibre instance for one site, framed on the site's bounding box. What is drawn comes
 * entirely from the layer registry (imagery, boundary, later design layers).
 */
export function MapView({
  site,
  imagery,
  terrain,
  registry = layerRegistry,
  layerUi,
  onMapReady,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [mapError, setMapError] = useState(false);
  const overrides = useMapLayerStore((s) => s.overrides);

  // One map per site; the registry layers are synced onto it by the effect below.
  const siteId = site.id;
  const bbox = site.bbox;
  const onMapReadyRef = useRef(onMapReady);
  onMapReadyRef.current = onMapReady;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const instance = new MapLibreMap({
      container,
      style: { version: 8, sources: {}, layers: [] },
      bounds: bbox,
      fitBoundsOptions: { padding: FIT_PADDING, maxZoom: MAX_FIT_ZOOM },
      attributionControl: false, // credits are always shown by <ImageryAttribution>
      transformRequest,
    });
    instance.addControl(new NavigationControl({ showCompass: false }), "top-right");
    instance.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
    instance.on("error", () => setMapError(true));

    let disposed = false;
    instance.on("load", () => {
      if (disposed) return;
      setMap(instance);
      onMapReadyRef.current?.(instance);
    });

    return () => {
      disposed = true;
      setMap(null);
      instance.remove();
    };
    // Re-create only when the site itself changes; bbox is derived from it.
  }, [siteId]);

  const synchronizerRef = useRef<LayerSynchronizer | null>(null);

  useEffect(() => {
    if (!map) return;
    const synchronizer = new LayerSynchronizer(map, registry);
    synchronizerRef.current = synchronizer;
    return () => {
      synchronizerRef.current = null;
      // The map may already be removed by the effect above; ignore teardown order issues.
      try {
        synchronizer.dispose();
      } catch {
        /* map already gone */
      }
    };
  }, [map, registry]);

  useEffect(() => {
    synchronizerRef.current?.sync({ site, imagery, terrain, ui: layerUi }, (d) =>
      isLayerVisible(d, overrides),
    );
  }, [map, registry, site, imagery, terrain, layerUi, overrides]);

  return (
    <>
      <div
        ref={containerRef}
        className="map-view"
        data-testid="map-view"
        data-map-ready={map ? "true" : "false"}
      />
      {mapError && (
        <div
          className="notice"
          role="alert"
          style={{
            position: "absolute",
            top: "3.5rem",
            left: "0.6rem",
            right: "0.6rem",
            zIndex: 4,
          }}
        >
          Some map data could not load. Check your connection or sign in again if your session
          expired.
          <button
            type="button"
            className="btn"
            onClick={() => {
              setMapError(false);
              const source = map?.getSource("imagery") as RasterTileSource | undefined;
              if (source?.tiles) source.setTiles(source.tiles);
            }}
          >
            Retry map
          </button>
        </div>
      )}
    </>
  );
}
