import type { LayerSpecification, SourceSpecification } from "maplibre-gl";

import type { LayerRegistry } from "./registry";
import type { MapLayerContext, MapLayerDefinition } from "./types";

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
  signature: string;
  sourceIds: string[];
  layerIds: string[];
}

/**
 * Keeps a MapLibre map in sync with a layer registry: adds, replaces and removes the sources and
 * style layers of each definition as the context changes, and applies visibility. Only layers whose
 * built spec actually changed are touched, so e.g. imagery tiles aren't reloaded when an unrelated
 * layer or the visibility of another layer changes.
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
      const signature = JSON.stringify(spec);
      const existing = this.applied.get(definition.id);

      if (existing && existing.signature === signature) {
        this.setVisibility(existing, isVisible(definition));
        continue;
      }
      if (!existing && !spec) continue;
      if (existing) this.remove(definition.id);
      changed = true;
      if (!spec) continue;

      for (const [id, source] of Object.entries(spec.sources)) this.map.addSource(id, source);
      for (const layer of spec.layers) this.map.addLayer(layer);

      const applied: Applied = {
        signature,
        sourceIds: Object.keys(spec.sources),
        layerIds: spec.layers.map((l) => l.id),
      };
      this.applied.set(definition.id, applied);
      this.setVisibility(applied, isVisible(definition));
    }
    if (changed) this.restack(definitions);
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
