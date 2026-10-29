import { useEffect } from "react";
import { useStore } from "zustand";
import type { ElementType, FeatureType, PlanLayer } from "../../entities/planning";
import type { EditorStore } from "./store";
import type { Tool } from "./useEditorMap";

const LEGACY_NAMES: Record<FeatureType, string> = {
  zone: "Zones",
  sector: "Sectors",
  element: "Elements",
  path: "Paths",
  annotation: "Annotations",
};

export function destinationLayer(layers: PlanLayer[], role: FeatureType) {
  return (
    layers.find((layer) => layer.role === role) ??
    layers.find((layer) => layer.role === undefined && layer.name === LEGACY_NAMES[role])
  );
}

/** Arming a drawing tool reveals its own destination, never reuses a previous tool's layer. */
export function useActiveLayer(store: EditorStore, tool: Tool, element: ElementType | undefined) {
  const layers = useStore(store, (state) => state.document.layers);
  const role =
    tool === "element"
      ? (element?.feature_type ?? "element")
      : tool === "sector-rect"
        ? "sector"
        : tool === "zone" || tool === "sector" || tool === "path"
          ? tool
          : null;
  const layer = role ? destinationLayer(layers, role) : undefined;
  useEffect(() => {
    if (!layer || layer.visible) return;
    const state = store.getState();
    state.commit({
      ...state.document,
      layers: state.document.layers.map((item) =>
        item.id === layer.id ? { ...item, visible: true } : item,
      ),
    });
  }, [layer, store]);
  return layer?.id ?? "";
}
