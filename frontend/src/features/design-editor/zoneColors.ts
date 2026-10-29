import type { DesignFeature } from "../../entities/planning";

/**
 * A zone's colour follows its number, so every Zone 1 looks the same on the map and in the legend.
 * These are the distinct defaults for zones 0–5 — the home at the centre out to the wild edge —
 * so new zones are told apart at a glance. Recolouring a zone recolours every zone of that number
 * together (see {@link recolorZones}), and the choice is stored on the features themselves, so it
 * survives a reload without any new storage.
 */
export const ZONE_COLORS: Record<number, string> = {
  0: "#b91c1c", // home / centre
  1: "#ea580c",
  2: "#f59e0b",
  3: "#65a30d",
  4: "#0891b2",
  5: "#6d28d9", // left wild
};

const FALLBACK = "#f59e0b";
const HEX = /^#[0-9a-f]{6}$/i;

/** The default colour for a zone number (a number outside 0–5 falls back to amber). */
export const zoneColor = (zoneNumber: number): string => ZONE_COLORS[zoneNumber] ?? FALLBACK;

/** The zone number a feature carries; hand-drawn or older zones without one count as 1. */
export const zoneNumberOf = (feature: Pick<DesignFeature, "properties">): number =>
  Number(feature.properties.zone_number ?? 1);

/**
 * The colour a plan is currently using for a zone number: the colour of an existing zone of that
 * number (they are kept in step), or the default when none exists yet.
 */
export function zoneColorOf(features: readonly DesignFeature[], zoneNumber: number): string {
  const existing = features.find(
    (f) =>
      f.feature_type === "zone" &&
      zoneNumberOf(f) === zoneNumber &&
      HEX.test(String(f.properties.color)),
  );
  return existing ? String(existing.properties.color) : zoneColor(zoneNumber);
}

/** Every zone of `zoneNumber` recoloured to `color`; all other features are returned untouched. */
export function recolorZones(
  features: readonly DesignFeature[],
  zoneNumber: number,
  color: string,
): DesignFeature[] {
  return features.map((feature) =>
    feature.feature_type === "zone" && zoneNumberOf(feature) === zoneNumber
      ? { ...feature, properties: { ...feature.properties, color } }
      : feature,
  );
}
