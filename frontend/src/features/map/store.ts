import { create } from "zustand";

import type { MapLayerDefinition } from "./layers/types";

interface MapLayerState {
  /** Explicit user choices; layers not listed fall back to their `defaultVisible`. */
  overrides: Record<string, boolean>;
  setVisible(id: string, visible: boolean): void;
  reset(): void;
}

export const useMapLayerStore = create<MapLayerState>((set) => ({
  overrides: {},
  setVisible: (id, visible) => set((s) => ({ overrides: { ...s.overrides, [id]: visible } })),
  reset: () => set({ overrides: {} }),
}));

export function isLayerVisible(
  definition: MapLayerDefinition,
  overrides: Record<string, boolean>,
): boolean {
  return overrides[definition.id] ?? definition.defaultVisible;
}
