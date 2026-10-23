import type { DesignFeature, ElementType, PlanLayer } from "../../entities/planning";
import { kindLabel, sectorKindOf, SECTOR_COLORS } from "./sectors";

export type LegendShape = "point" | "line" | "polygon";

export interface LegendEntry {
  /** Stable identity of the kind of thing (zone number, sector kind, element type). */
  key: string;
  label: string;
  color: string;
  shape: LegendShape;
  group: "Zones" | "Sectors" | "Elements";
  /** Number of features of this kind in the plan. */
  count: number;
}

const HEX = /^#[0-9a-f]{6}$/i;
const shapeOf = (feature: DesignFeature): LegendShape =>
  feature.geometry.type === "Point"
    ? "point"
    : feature.geometry.type === "LineString"
      ? "line"
      : "polygon";

/**
 * What the map currently shows, as one entry per kind of thing: each zone number, each sector
 * kind, each element type, with the colour of its first feature. It is derived from the plan's own
 * features, so it only ever explains what is really there — and skips what is hidden.
 */
export function buildLegend(
  features: readonly DesignFeature[],
  types: readonly ElementType[],
  layers: readonly PlanLayer[],
  isShown: (feature: DesignFeature) => boolean = () => true,
): LegendEntry[] {
  const visible = new Set(layers.filter((l) => l.visible).map((l) => l.id));
  const entries = new Map<string, LegendEntry>();
  for (const feature of features) {
    if (!visible.has(feature.layer_id) || !isShown(feature)) continue;
    const own = String(feature.properties.color);
    const type = types.find((t) => t.id === feature.element_type_id);
    const fill = type?.default_style.fill ?? type?.default_style.stroke;
    let entry: Omit<LegendEntry, "count">;
    if (feature.feature_type === "zone") {
      const number = Number(feature.properties.zone_number ?? 1);
      entry = {
        key: `zone:${number}`,
        label: `Zone ${number}`,
        color: HEX.test(own) ? own : "#f59e0b",
        shape: "polygon",
        group: "Zones",
      };
    } else if (feature.feature_type === "sector") {
      const kind = sectorKindOf(feature);
      entry = {
        key: `sector:${kind}`,
        label: kindLabel(kind),
        color: HEX.test(own) ? own : SECTOR_COLORS[kind],
        shape: "polygon",
        group: "Sectors",
      };
    } else {
      const label =
        type?.name ?? (feature.feature_type === "annotation" ? "Note" : feature.feature_type);
      entry = {
        key: `element:${type?.id ?? feature.feature_type}`,
        label: label[0]!.toUpperCase() + label.slice(1),
        color: HEX.test(own) ? own : typeof fill === "string" ? fill : "#2f855a",
        shape: shapeOf(feature),
        group: "Elements",
      };
    }
    const existing = entries.get(entry.key);
    if (existing) existing.count += 1;
    else entries.set(entry.key, { ...entry, count: 1 });
  }
  const order = { Zones: 0, Sectors: 1, Elements: 2 } as const;
  return [...entries.values()].sort(
    (a, b) =>
      order[a.group] - order[b.group] ||
      a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
}
