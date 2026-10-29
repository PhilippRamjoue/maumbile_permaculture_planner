import { layerRegistry } from "../../map/layers/defaultRegistry";
import { gridLayer } from "../../map/layers/gridLayer";
import { createLayerRegistry } from "../../map/layers/registry";
import type { MapLayerContext, MapLayerDefinition } from "../../map/layers/types";
import {
  DRAFT_BOUNDARY_LAYER_ID,
  draftBoundaryLayer,
  type DraftBoundaryUi,
} from "../../site-setup/map/draftBoundaryLayer";
import type { LngLat } from "../../site-setup/geometry";

export const EDITOR_BOUNDARY_LAYER_ID = "editor-boundary";

/** The border being adjusted in the Boundary focus, as handed to the layer through `ui`. */
export interface EditorBoundaryUi extends DraftBoundaryUi {
  /** The corners as an open ring. */
  points: LngLat[];
}

/**
 * Corner handles, outline and (red when invalid) fill of the border draft, drawn over the saved
 * border so you can see how far you moved it. It is the setup flow's own layer fed from the
 * editor's draft; with no draft in the context (every other focus) it draws nothing.
 */
const editorBoundaryLayer: MapLayerDefinition = {
  id: EDITOR_BOUNDARY_LAYER_ID,
  label: "Boundary corners",
  toggleable: false,
  defaultVisible: true,
  build(context: MapLayerContext) {
    const ui = context.ui?.[EDITOR_BOUNDARY_LAYER_ID] as EditorBoundaryUi | undefined;
    if (!ui || ui.points.length === 0) return null;
    const { points, ...state } = ui;
    return draftBoundaryLayer.build({
      ...context,
      site: { ...context.site, boundary: { type: "Polygon", coordinates: [points] } },
      ui: { [DRAFT_BOUNDARY_LAYER_ID]: state },
    });
  },
};

/** The app-wide layers, the optional distance grid, and the border-editing layer on top. */
export const editorLayerRegistry = createLayerRegistry([
  ...layerRegistry.list(),
  gridLayer,
  editorBoundaryLayer,
]);
