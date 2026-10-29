import type { Feature, LineString, Position } from "geojson";

import type { DesignFeature, ElementType } from "../../../entities/planning";

/**
 * Functions and connections of an element. They are plain lists of function names in the element's
 * `properties` (`needs` / `yields`) — no new storage. A connection is not stored either: it is
 * derived, "A yields what B needs".
 */
export type FunctionKey = "needs" | "yields";

/** Familiar permaculture functions offered as one-tap suggestions. */
export const FUNCTION_PRESETS: readonly string[] = [
  "water",
  "shade",
  "windbreak",
  "shelter",
  "food",
  "fodder",
  "fertility",
  "mulch",
  "pollination",
  "habitat",
  "pest control",
  "fuel",
  "heat",
  "privacy",
  "security",
  "access",
  "income",
];

const MAX_FUNCTIONS = 20;
const MAX_FUNCTION_LENGTH = 40;

/** A function name as stored: trimmed, lower case, single-spaced, bounded. Empty when unusable. */
export function normalizeFunction(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, MAX_FUNCTION_LENGTH);
}

/** The element's list for `key`, read defensively (hand-edited or older data may be anything). */
export function functionsOf(
  feature: Pick<DesignFeature, "properties">,
  key: FunctionKey,
): string[] {
  const value = feature.properties[key];
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const name = normalizeFunction(item);
    if (name) seen.add(name);
  }
  return [...seen];
}

/** The feature with `name` added to (or removed from) its list; unchanged when nothing changes. */
export function toggleFunction(
  feature: DesignFeature,
  key: FunctionKey,
  raw: string,
  on: boolean,
): DesignFeature {
  const name = normalizeFunction(raw);
  const current = functionsOf(feature, key);
  if (!name || current.includes(name) === on) return feature;
  if (on && current.length >= MAX_FUNCTIONS) return feature;
  const next = on ? [...current, name] : current.filter((n) => n !== name);
  return { ...feature, properties: { ...feature.properties, [key]: next } };
}

/**
 * The `needs` / `yields` a palette entry starts with, ready to merge into a new element's
 * properties. Empty for entries without functions (zones, sectors, notes).
 */
export function typicalFunctions(
  type: Pick<ElementType, "default_properties"> | undefined,
): Partial<Record<FunctionKey, string[]>> {
  if (!type) return {};
  // An older server has no `default_properties` yet; then nothing is pre-filled.
  const holder = { properties: type.default_properties ?? {} };
  const needs = functionsOf(holder, "needs");
  const yields = functionsOf(holder, "yields");
  return needs.length > 0 || yields.length > 0 ? { needs, yields } : {};
}

/**
 * The palette entry an element was made from: by its type id, else (for elements placed before
 * types were recorded) by a matching name such as "Tree".
 */
export function typeOfElement(
  element: DesignFeature,
  types: readonly ElementType[],
): ElementType | undefined {
  const byId = types.find((t) => t.id === element.element_type_id);
  if (byId) return byId;
  const name = String(element.properties.name ?? "")
    .trim()
    .toLowerCase();
  return name ? types.find((t) => t.name.toLowerCase() === name) : undefined;
}

/**
 * The element with its typical needs / yields filled in where it has none of its own. Anything
 * already chosen is kept; unchanged (same object) when there is nothing to add.
 */
export function withTypicalFunctions(
  element: DesignFeature,
  types: readonly ElementType[],
): DesignFeature {
  const typical = typicalFunctions(typeOfElement(element, types));
  const fill = (key: FunctionKey) =>
    functionsOf(element, key).length === 0 && (typical[key]?.length ?? 0) > 0
      ? { [key]: typical[key] }
      : {};
  const additions = { ...fill("needs"), ...fill("yields") };
  return Object.keys(additions).length === 0
    ? element
    : { ...element, properties: { ...element.properties, ...additions } };
}

const carriesFunctions = (f: DesignFeature) =>
  f.feature_type === "element" || f.feature_type === "path";

export const displayName = (f: DesignFeature) => String(f.properties.name ?? f.feature_type);

export interface PermacultureCheck {
  /** Elements considered (placed elements and paths). */
  count: number;
  /** Functions somebody needs that no other element yields. */
  unmet: { fn: string; needers: DesignFeature[] }[];
  /** Functions that exactly one element provides: fragile, since a single failure loses it. */
  fragile: { fn: string; provider: DesignFeature }[];
  /** Elements that yield fewer than two functions. */
  underused: DesignFeature[];
  /** Elements with neither needs nor yields filled in yet. */
  undescribed: DesignFeature[];
  /** Nothing to flag, and there is something to check. */
  ok: boolean;
}

/**
 * The permaculture check: every function should be met by several elements, and every element
 * should serve several functions. Pure, so the panel and the tests share one definition.
 */
export function permacultureCheck(features: readonly DesignFeature[]): PermacultureCheck {
  const elements = features.filter(carriesFunctions);
  const providers = new Map<string, DesignFeature[]>();
  const needers = new Map<string, DesignFeature[]>();
  for (const element of elements) {
    for (const fn of functionsOf(element, "yields")) {
      providers.set(fn, [...(providers.get(fn) ?? []), element]);
    }
    for (const fn of functionsOf(element, "needs")) {
      needers.set(fn, [...(needers.get(fn) ?? []), element]);
    }
  }

  const unmet = [...needers]
    .map(([fn, list]) => ({
      fn,
      needers: list.filter((n) => !(providers.get(fn) ?? []).some((p) => p.id !== n.id)),
    }))
    .filter((entry) => entry.needers.length > 0)
    .sort((a, b) => a.fn.localeCompare(b.fn));

  const fragile = [...providers]
    .filter(([, list]) => list.length === 1)
    .map(([fn, list]) => ({ fn, provider: list[0] }))
    .sort((a, b) => a.fn.localeCompare(b.fn));

  const undescribed = elements.filter(
    (e) => functionsOf(e, "needs").length === 0 && functionsOf(e, "yields").length === 0,
  );
  const underused = elements.filter(
    (e) => functionsOf(e, "yields").length < 2 && !undescribed.includes(e),
  );

  return {
    count: elements.length,
    unmet,
    fragile,
    underused,
    undescribed,
    ok:
      elements.length > 0 &&
      unmet.length === 0 &&
      fragile.length === 0 &&
      underused.length === 0 &&
      undescribed.length === 0,
  };
}

export interface Connection {
  fn: string;
  other: DesignFeature;
  /** "supplies": the other element yields what `selected` needs; "uses": the reverse. */
  direction: "supplies" | "uses";
}

/** The elements linked to `selected` through a need they meet or a yield they use. */
export function connectionsOf(
  selected: DesignFeature,
  features: readonly DesignFeature[],
): Connection[] {
  const others = features.filter((f) => carriesFunctions(f) && f.id !== selected.id);
  const out: Connection[] = [];
  for (const fn of functionsOf(selected, "needs")) {
    for (const other of others) {
      if (functionsOf(other, "yields").includes(fn)) out.push({ fn, other, direction: "supplies" });
    }
  }
  for (const fn of functionsOf(selected, "yields")) {
    for (const other of others) {
      if (functionsOf(other, "needs").includes(fn)) out.push({ fn, other, direction: "uses" });
    }
  }
  return out;
}

/** A representative point of a feature: the point itself, else the mean of its vertices. */
export function anchorOf(feature: Pick<DesignFeature, "geometry">): Position {
  const g = feature.geometry;
  if (g.type === "Point") return g.coordinates;
  const ring: Position[] = g.type === "Polygon" ? g.coordinates[0].slice(0, -1) : g.coordinates;
  const n = Math.max(ring.length, 1);
  return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
}

/** Lines from `selected` to every linked element, for the map. */
export function connectionLines(
  selected: DesignFeature | undefined,
  features: readonly DesignFeature[],
): Feature<LineString>[] {
  if (!selected || !carriesFunctions(selected)) return [];
  const from = anchorOf(selected);
  const seen = new Set<string>();
  const lines: Feature<LineString>[] = [];
  for (const { other, fn, direction } of connectionsOf(selected, features)) {
    if (seen.has(other.id)) continue;
    seen.add(other.id);
    lines.push({
      type: "Feature",
      properties: { fn, direction },
      geometry: { type: "LineString", coordinates: [from, anchorOf(other)] },
    });
  }
  return lines;
}
