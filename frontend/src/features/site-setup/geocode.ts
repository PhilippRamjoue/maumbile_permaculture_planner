import type { LngLat } from "./geometry";

/**
 * Look up a place name with OpenStreetMap's Nominatim (free, no key). Returns [lng, lat] of the best
 * match, or null. Used sparingly in site setup (resolving a short Plus Code's town, or a place
 * search), biased to the chosen country when one is given. Nominatim asks for low volume and one
 * request per second; this is one lookup on an explicit user action.
 */
export async function geocodePlace(
  query: string,
  countryCode?: string | null,
): Promise<LngLat | null> {
  const trimmed = query.trim();
  if (trimmed === "") return null;
  const params = new URLSearchParams({ format: "jsonv2", limit: "1", q: trimmed });
  if (countryCode) params.set("countrycodes", countryCode.toLowerCase());
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { lat?: string; lon?: string }[];
    const hit = Array.isArray(data) ? data[0] : undefined;
    if (!hit?.lat || !hit?.lon) return null;
    const point: LngLat = [Number(hit.lon), Number(hit.lat)];
    return Number.isFinite(point[0]) && Number.isFinite(point[1]) ? point : null;
  } catch {
    return null;
  }
}
