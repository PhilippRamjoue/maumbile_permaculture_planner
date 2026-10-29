import type { ComponentProps } from "react";
import { ZoomToBoundaryButton } from "../map/ZoomToBoundaryButton";
import { TerrainControl } from "../terrain";
import { MapLegend } from "./MapLegend";
import { LayersControl } from "./LayersControl";
import { BasemapSwitcher } from "./BasemapSwitcher";
import { MapToolsControl } from "./MapToolsControl";

/** Whole-map controls stay together while feature panels own their own editing state. */
export function MapControlBar(props: {
  zoom: ComponentProps<typeof ZoomToBoundaryButton>;
  legend: ComponentProps<typeof MapLegend>;
  layers: ComponentProps<typeof LayersControl>;
  basemap: ComponentProps<typeof BasemapSwitcher>;
  terrain?: ComponentProps<typeof TerrainControl>;
  tools: ComponentProps<typeof MapToolsControl>;
}) {
  return (
    <div className="map-tools map-tools--bottom">
      <ZoomToBoundaryButton {...props.zoom} />
      <MapLegend {...props.legend} />
      <LayersControl {...props.layers} />
      <BasemapSwitcher {...props.basemap} />
      {props.terrain && <TerrainControl {...props.terrain} />}
      <MapToolsControl {...props.tools} />
    </div>
  );
}
