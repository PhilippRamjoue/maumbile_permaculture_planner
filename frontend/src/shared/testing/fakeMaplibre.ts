/**
 * Minimal stand-in for `maplibre-gl` — jsdom has no WebGL. Use with:
 *
 *   vi.mock("maplibre-gl", async () => (await import("<path>/shared/testing/fakeMaplibre")).fakeMaplibreModule);
 *
 * Besides style/source/layer bookkeeping it carries a real Web-Mercator camera (`project`,
 * `unproject`, `jumpTo`, `fitBounds`) like MapLibre's, so tests can click a *pixel*, change the
 * zoom, and check where the resulting coordinate lands on screen.
 */
export interface FakeLngLat {
  lng: number;
  lat: number;
}
export interface FakePoint {
  x: number;
  y: number;
}
/** Payload of simulated pointer events (see {@link FakeMap.trigger}). Give a pixel, a position, or both. */
export interface FakeMapEvent {
  lngLat?: FakeLngLat;
  /** Container pixels; derived from `lngLat` when omitted. */
  point?: FakePoint;
  /** Set by `trigger`. */
  type?: string;
  /** True once a handler called `preventDefault()`. */
  defaultPrevented?: boolean;
  originalEvent?: unknown;
  preventDefault?: () => void;
}
type Handler = (event: FakeMapEvent) => void;
type PointLike = FakePoint | [number, number];

/** Size of the fake map's container in CSS pixels. */
export const FAKE_MAP_SIZE = { width: 800, height: 600 };

const TILE_SIZE = 512;
const MAX_ZOOM = 22;
const worldSize = (zoom: number) => TILE_SIZE * 2 ** zoom;
const mercatorX = (lng: number) => (lng + 180) / 360;
const mercatorY = (lat: number) => {
  const sin = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
};
const lngOf = (x: number) => x * 360 - 180;
const latOf = (y: number) =>
  (360 / Math.PI) * Math.atan(Math.exp(((180 - y * 360) * Math.PI) / 180)) - 90;

const asPoint = (p: PointLike): FakePoint => (Array.isArray(p) ? { x: p[0], y: p[1] } : p);

/** An interaction handler (dragPan, doubleClickZoom, …) that only remembers its state. */
class FakeHandler {
  enabled = true;
  enable() {
    this.enabled = true;
  }
  disable() {
    this.enabled = false;
  }
  disableRotation() {}
}

export class FakeMap {
  static instances: FakeMap[] = [];

  readonly sources = new Map<string, Record<string, unknown>>();
  readonly layers = new Map<string, { id: string; layout: Record<string, unknown> }>();
  removed = false;
  /** Arguments of every `fitBounds` call. */
  fits: { bounds: unknown; options: unknown }[] = [];
  readonly canvas = { style: {} as Record<string, string> };
  readonly dragPan = new FakeHandler();
  readonly doubleClickZoom = new FakeHandler();
  readonly dragRotate = new FakeHandler();
  readonly touchZoomRotate = new FakeHandler();
  private handlers: Record<string, Handler[]> = {};
  private center = { lng: 0, lat: 0 };
  private zoom = 0;

  constructor(readonly options: Record<string, unknown>) {
    FakeMap.instances.push(this);
    const center = options.center as [number, number] | undefined;
    if (center) this.center = { lng: center[0], lat: center[1] };
    if (typeof options.zoom === "number") this.zoom = options.zoom;
    if (options.bounds) this.frame(options.bounds, options.fitBoundsOptions);
    queueMicrotask(() => this.emit("load"));
  }

  static reset() {
    FakeMap.instances = [];
  }

  on(event: string, handler: Handler) {
    (this.handlers[event] ??= []).push(handler);
    return this;
  }
  off(event: string, handler: Handler) {
    this.handlers[event] = (this.handlers[event] ?? []).filter((h) => h !== handler);
    return this;
  }
  private emit(event: string, payload?: FakeMapEvent) {
    [...(this.handlers[event] ?? [])].forEach((h) => h(payload as FakeMapEvent));
  }

  /**
   * Simulate a map pointer event, e.g. `map.trigger("click", { lngLat: { lng: 36.8, lat: -1.2 } })`
   * or `map.trigger("mousedown", { point: { x: 400, y: 300 } })`. Whichever of `lngLat` / `point`
   * is missing is derived from the other through the camera. Returns the event, so a test can
   * check `defaultPrevented`.
   */
  trigger(event: string, payload: FakeMapEvent = {}): FakeMapEvent {
    const full: FakeMapEvent = { ...payload, type: event };
    if (!full.point && full.lngLat) full.point = this.project([full.lngLat.lng, full.lngLat.lat]);
    if (!full.lngLat && full.point) full.lngLat = this.unproject(full.point);
    full.defaultPrevented = false;
    full.preventDefault = () => {
      full.defaultPrevented = true;
    };
    this.emit(event, full);
    return full;
  }

  // --- camera -------------------------------------------------------------------------------

  getContainer() {
    return { clientWidth: FAKE_MAP_SIZE.width, clientHeight: FAKE_MAP_SIZE.height };
  }
  getZoom() {
    return this.zoom;
  }
  getCenter(): FakeLngLat {
    return { ...this.center };
  }
  /** Move the camera without animation; emits `move` and `zoom` like MapLibre. */
  jumpTo(options: { center?: [number, number]; zoom?: number }) {
    if (options.center) this.center = { lng: options.center[0], lat: options.center[1] };
    if (options.zoom !== undefined) this.zoom = Math.max(0, Math.min(MAX_ZOOM, options.zoom));
    this.emit("move");
    this.emit("zoom");
    return this;
  }
  setZoom(zoom: number) {
    return this.jumpTo({ zoom });
  }
  /** Container pixel of a coordinate (`map.project`). */
  project(lngLat: [number, number] | FakeLngLat): FakePoint {
    const [lng, lat] = Array.isArray(lngLat) ? lngLat : [lngLat.lng, lngLat.lat];
    const world = worldSize(this.zoom);
    return {
      x: (mercatorX(lng) - mercatorX(this.center.lng)) * world + FAKE_MAP_SIZE.width / 2,
      y: (mercatorY(lat) - mercatorY(this.center.lat)) * world + FAKE_MAP_SIZE.height / 2,
    };
  }
  /** Coordinate under a container pixel (`map.unproject`). */
  unproject(pixel: PointLike): FakeLngLat {
    const { x, y } = asPoint(pixel);
    const world = worldSize(this.zoom);
    return {
      lng: lngOf(mercatorX(this.center.lng) + (x - FAKE_MAP_SIZE.width / 2) / world),
      lat: latOf(mercatorY(this.center.lat) + (y - FAKE_MAP_SIZE.height / 2) / world),
    };
  }
  fitBounds(bounds: unknown, options?: unknown) {
    this.fits.push({ bounds, options });
    this.frame(bounds, options);
  }
  /** Centre and zoom the camera on `bounds` ([west, south, east, north]) like MapLibre does. */
  private frame(bounds: unknown, options: unknown) {
    const [west, south, east, north] = bounds as [number, number, number, number];
    const { padding = 0, maxZoom = MAX_ZOOM } = (options ?? {}) as {
      padding?: number;
      maxZoom?: number;
    };
    const dx = mercatorX(east) - mercatorX(west);
    const dy = mercatorY(south) - mercatorY(north);
    const fit = (extent: number, size: number) =>
      extent > 0 ? Math.log2((size - 2 * padding) / (extent * TILE_SIZE)) : Infinity;
    const zoom = Math.min(
      maxZoom,
      MAX_ZOOM,
      fit(dx, FAKE_MAP_SIZE.width),
      fit(dy, FAKE_MAP_SIZE.height),
    );
    this.center = {
      lng: lngOf((mercatorX(west) + mercatorX(east)) / 2),
      lat: latOf((mercatorY(south) + mercatorY(north)) / 2),
    };
    this.zoom = Math.max(0, zoom);
  }

  // --- style --------------------------------------------------------------------------------

  getCanvas() {
    return this.canvas;
  }
  addControl() {}
  addSource(id: string, source: Record<string, unknown>) {
    const stored: Record<string, unknown> = { ...source };
    // Like MapLibre's GeoJSONSource, whose data can be swapped in place.
    if (source.type === "geojson") {
      stored.setData = (data: unknown) => {
        stored.data = data;
      };
    }
    this.sources.set(id, stored);
  }
  removeSource(id: string) {
    this.sources.delete(id);
  }
  getSource(id: string) {
    return this.sources.get(id);
  }
  addLayer(layer: { id: string }) {
    this.layers.set(layer.id, { id: layer.id, layout: {} });
  }
  removeLayer(id: string) {
    this.layers.delete(id);
  }
  getLayer(id: string) {
    return this.layers.get(id);
  }
  moveLayer() {}
  setLayoutProperty(id: string, name: string, value: unknown) {
    const layer = this.layers.get(id);
    if (layer) layer.layout[name] = value;
  }
  remove() {
    this.removed = true;
  }
}

class FakeControl {}

export const fakeMaplibreModule = {
  Map: FakeMap,
  NavigationControl: FakeControl,
  ScaleControl: FakeControl,
  setWorkerUrl: () => {},
};
