/**
 * Minimal stand-in for `maplibre-gl` — jsdom has no WebGL. Use with:
 *
 *   vi.mock("maplibre-gl", async () => (await import("<path>/shared/testing/fakeMaplibre")).fakeMaplibreModule);
 */
type Handler = () => void;

export class FakeMap {
  static instances: FakeMap[] = [];

  readonly sources = new Map<string, unknown>();
  readonly layers = new Map<string, { id: string; layout: Record<string, unknown> }>();
  removed = false;
  private handlers: Record<string, Handler[]> = {};

  constructor(readonly options: Record<string, unknown>) {
    FakeMap.instances.push(this);
    queueMicrotask(() => this.emit("load"));
  }

  static reset() {
    FakeMap.instances = [];
  }

  on(event: string, handler: Handler) {
    (this.handlers[event] ??= []).push(handler);
    return this;
  }
  private emit(event: string) {
    (this.handlers[event] ?? []).forEach((h) => h());
  }
  addControl() {}
  addSource(id: string, source: unknown) {
    this.sources.set(id, source);
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
  default: { Map: FakeMap, NavigationControl: FakeControl, ScaleControl: FakeControl },
};
