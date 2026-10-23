import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";

import { attachBoundaryEditing } from "../../site-setup/map/boundaryEditing";
import type { BoundaryDraftStore } from "./boundaryDraft";
import { EDITOR_BOUNDARY_LAYER_ID, type EditorBoundaryUi } from "./boundaryLayer";

/**
 * Wires the setup flow's reliable corner editing (drag with grab offset, snap, select; reach in
 * screen pixels) onto the editor map while `active`, and returns the `layerUi` that draws the
 * draft's corners. Clicking empty map does *not* add a corner here: an existing border is nudged,
 * and corners are inserted deliberately (see `BoundaryDraftState.insertAfter`).
 */
export function useBoundaryEditing(
  map: MapLibreMap | null,
  active: boolean,
  store: BoundaryDraftStore,
  frozen: boolean,
) {
  const vertices = useStore(store, (s) => s.vertices);
  const selectedId = useStore(store, (s) => s.selectedId);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [snapId, setSnapId] = useState<number | null>(null);

  useEffect(() => {
    if (!map || !active || frozen) return;
    const detach = attachBoundaryEditing(map, {
      vertices: () => store.getState().vertices,
      onSelect: (id) => store.getState().select(id),
      onMove: (id, point, gesture) => store.getState().move(id, point, gesture),
      onHover: setHoverId,
      onSnap: setSnapId,
      idleCursor: "",
    });
    return () => {
      detach();
      setHoverId(null);
      setSnapId(null);
      try {
        map.getCanvas().style.cursor = "";
      } catch {
        /* map already removed */
      }
    };
  }, [map, active, frozen, store]);

  return useMemo(() => {
    if (!active) return undefined;
    const indexOf = (id: number | null) => {
      const index = vertices.findIndex((v) => v.id === id);
      return index < 0 ? null : index;
    };
    const state: EditorBoundaryUi = {
      points: vertices.map((v) => v.point),
      hoverIndex: indexOf(hoverId),
      selectedIndex: indexOf(selectedId),
      snapIndex: indexOf(snapId),
    };
    return { [EDITOR_BOUNDARY_LAYER_ID]: state };
  }, [active, vertices, hoverId, selectedId, snapId]);
}
