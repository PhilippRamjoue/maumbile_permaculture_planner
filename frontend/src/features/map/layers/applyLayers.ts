import type { LayerSpecification, SourceSpecification } from "maplibre-gl";

import type { LayerRegistry } from "./registry";
import type { MapLayerContext, MapLayerDefinition, MapLayerSpec } from "./types";

/** The slice of the MapLibre `Map` API this module needs (also makes it testable with a fake). */
export interface MapLike {
  getSource(id: string): unknown;
  addSource(id: string, source: SourceSpecification): unknown;
  removeSource(id: string): unknown;
  getLayer(id: string): unknown;
  addLayer(layer: LayerSpecification): unknown;
  removeLayer(id: string): unknown;
  moveLayer(id: string, beforeId?: string): unknown;
  setLayoutProperty(layerId: string, name: string, value: unknown): unknown;
}

/** What is currently on the map for one registry layer, so changes can be diffed. */
interface Applied {
  /** The built spec minus the contents of its GeoJSON sources. */
  structure: string;
  /** GeoJSON source id → serialized data. */
  data: Map<string, string>;
  sourceIds: string[];
  layerIds: string[];
}

interface Serialized {
  structure: string;
  data: Map<string, string>;
}

/**
 * Splits a spec into what needs layers re-created when it changes (structure) and what a
 * GeoJSON source can swap in place (its data). A live edit then moves vertices without removing
 * and re-adding layers, which flickers and would lose any pointer state tied to them.
 */
function serialize(spec: MapLayerSpec): Serialized {
  const data = new Map<string, string>();
  const sources: Record<string, unknown> = {};
  for (const [id, source] of Object.entries(spec.sources)) {
    if (source.type === "geojson") {
      data.set(id, JSON.stringify(source.data ?? null));
      sources[id] = { ...source, data: null };
    } else sources[id] = source;
  }
  return { structure: JSON.stringify({ sources, layers: spec.layers }), data };
}

interface GeoJSONSourceLike {
  setData(data: unknown): unknown;
}

const isGeoJSONSource = (source: unknown): source is GeoJSONSourceLike =>
  typeof (source as GeoJSONSourceLike | undefined)?.setData === "function";

/**
 * Keeps a MapLibre map in sync with a layer registry: adds, replaces and removes the sources and
 * style layers of each definition as the context changes, and applies visibility. Only layers whose
 * built spec actually changed are touched, so e.g. imagery tiles aren't reloaded when an unrelated
 * layer or the visibility of another layer changes. When only GeoJSON data changed, the data is
 * swapped on the existing source.
 */
export class LayerSynchronizer {
  private readonly applied = new Map<string, Applied>();

  constructor(
    private readonly map: MapLike,
    private readonly registry: LayerRegistry,
  ) {}

  sync(context: MapLayerContext, isVisible: (definition: MapLayerDefinition) => boolean): void {
    const definitions = this.registry.list();
    const live = new Set(definitions.map((d) => d.id));
    let changed = false;

    for (const id of [...this.applied.keys()]) {
      if (!live.has(id)) {
        this.remove(id);
        changed = true;
      }
    }

    for (const definition of definitions) {
      const spec = definition.build(context);
      const serialized = spec ? serialize(spec) : null;
      const existing = this.applied.get(definition.id);

      if (existing && serialized && existing.structure === serialized.structure) {
        if (this.updateData(existing, serialized.data)) {
          this.setVisibility(existing, isVisible(definition));
          continue;
        }
      }
      if (!existing && !spec) continue;
      if (existing) this.remove(definition.id);
      changed = true;
      if (!spec || !serialized) continue;

      for (const [id, source] of Object.entries(spec.sources)) this.map.addSource(id, source);
      for (const layer of spec.layers) this.map.addLayer(layer);

      const applied: Applied = {
        structure: serialized.structure,
        data: serialized.data,
        sourceIds: Object.keys(spec.sources),
        layerIds: spec.layers.map((l) => l.id),
      };
      this.applied.set(definition.id, applied);
      this.setVisibility(applied, isVisible(definition));
    }
    if (changed) this.restack(definitions);
  }

  /**
   * Swaps changed GeoJSON data in place. Returns false when a source cannot take it, in which case
   * the caller replaces the whole layer instead.
   */
  private updateData(applied: Applied, next: Map<string, string>): boolean {
    const stale = [...next].filter(([id, json]) => applied.data.get(id) !== json);
    const sources = stale.map(([id]) => this.map.getSource(id));
    if (!sources.every(isGeoJSONSource)) return false;
    stale.forEach(([id, json], index) => {
      (sources[index] as GeoJSONSourceLike).setData(JSON.parse(json));
      applied.data.set(id, json);
    });
    return true;
  }

  /** Detach everything this synchronizer added (map is about to be reused or torn down). */
  dispose(): void {
    for (const id of [...this.applied.keys()]) this.remove(id);
  }

  private remove(definitionId: string): void {
    const applied = this.applied.get(definitionId);
    if (!applied) return;
    for (const id of applied.layerIds) if (this.map.getLayer(id)) this.map.removeLayer(id);
    for (const id of applied.sourceIds) if (this.map.getSource(id)) this.map.removeSource(id);
    this.applied.delete(definitionId);
  }

  private setVisibility(applied: Applied, visible: boolean): void {
    for (const id of applied.layerIds) {
      this.map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    }
  }

  /**
   * A layer re-added after its siblings would sit on top of them; registry order is draw order,
   * so move each layer to the top in turn, which leaves the stack in registry order.
   */
  private restack(definitions: MapLayerDefinition[]): void {
    for (const definition of definitions) {
      for (const id of this.applied.get(definition.id)?.layerIds ?? []) this.map.moveLayer(id);
    }
  }
}
