import type { MapLayerDefinition } from "./types";

/** Ordered collection of layer definitions; registration order is draw order (bottom → top). */
export interface LayerRegistry {
  register(definition: MapLayerDefinition): void;
  unregister(id: string): void;
  list(): MapLayerDefinition[];
  get(id: string): MapLayerDefinition | undefined;
}

export function createLayerRegistry(initial: MapLayerDefinition[] = []): LayerRegistry {
  const definitions = new Map<string, MapLayerDefinition>();

  const registry: LayerRegistry = {
    register(definition) {
      if (definitions.has(definition.id)) {
        throw new Error(`Map layer "${definition.id}" is already registered`);
      }
      definitions.set(definition.id, definition);
    },
    unregister(id) {
      definitions.delete(id);
    },
    list: () => [...definitions.values()],
    get: (id) => definitions.get(id),
  };

  initial.forEach(registry.register);
  return registry;
}
