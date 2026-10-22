import type { LayerSpecification, SourceSpecification } from "maplibre-gl";

import type { ImageryMeta } from "../../../entities/imagery";
import type { Site } from "../../../entities/site";
import type { TerrainRead } from "../../../entities/terrain";

/** Everything a layer may need to describe itself for the site being viewed. */
export interface MapLayerContext {
  site: Site;
  /** Undefined while `/imagery/meta` is still loading. */
  imagery: ImageryMeta | undefined;
  /** Undefined until `/terrain` has answered; terrain layers draw only once its status is `ready`. */
  terrain?: TerrainRead | undefined;
}

export interface MapLayerSpec {
  sources: Record<string, SourceSpecification>;
  layers: LayerSpecification[];
}

/**
 * A named, independently toggleable group of MapLibre sources + style layers. Later packages
 * (terrain WP10, design editor WP9) add their layers by registering a definition — the map
 * itself never changes.
 */
export interface MapLayerDefinition {
  /** Stable id; also the key for visibility state. */
  id: string;
  label: string;
  /**
   * Layers of one group are toggled by that group's own panel (e.g. terrain) rather than by the
   * generic layer panel.
   */
  group?: string;
  /** Whether the user may hide it from the layer panel. */
  toggleable: boolean;
  defaultVisible: boolean;
  /** The sources/layers for this context, or `null` when it cannot be shown (yet). */
  build(context: MapLayerContext): MapLayerSpec | null;
}
