import { useState } from "react";
import type { DesignFeature } from "../../entities/planning";
import type { SectorKind } from "./sectors";
import type { EditorStore } from "./store";
import type { Tool } from "./useEditorMap";

/** Shared add-tool defaults and sector visibility, independent of workspace presentation. */
export function useSectorAdding(store: EditorStore, setTool: (tool: Tool) => void) {
  const [kind, setKind] = useState<SectorKind>("sun");
  const [hiddenKinds, setHiddenKinds] = useState<ReadonlySet<SectorKind>>(() => new Set());
  const toggleKind = (sectorKind: SectorKind, shown: boolean) =>
    setHiddenKinds((previous) => {
      if (previous.has(sectorKind) === !shown) return previous;
      const next = new Set(previous);
      if (shown) next.delete(sectorKind);
      else next.add(sectorKind);
      return next;
    });
  const add = (feature: DesignFeature) => {
    setTool("select");
    const state = store.getState();
    state.commit({
      ...state.document,
      layers: state.document.layers.map((layer) =>
        layer.id === feature.layer_id ? { ...layer, visible: true } : layer,
      ),
    });
    state.upsert(feature);
  };
  return { kind, setKind, hiddenKinds, toggleKind, add };
}
