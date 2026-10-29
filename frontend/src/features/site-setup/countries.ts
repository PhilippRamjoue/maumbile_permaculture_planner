import type { BBox } from "../../entities/site";
import type { LngLat } from "./geometry";

/** All officially assigned ISO-3166-1 alpha-2 codes. Names come from the browser's `Intl`. */
const ISO_CODES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS " +
  "BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE " +
  "EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM " +
  "HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC " +
  "LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA " +
  "NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO " +
  "TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

/** Where the project starts: shown first in the picker. */
const FEATURED_CODES = ["KE", "TZ", "UG", "RW", "BI", "ET"];

export interface Country {
  code: string;
  name: string;
}

let regionNames: Intl.DisplayNames | null | undefined;

export function countryName(code: string): string {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      regionNames = null;
    }
  }
  const upper = code.toUpperCase();
  try {
    return regionNames?.of(upper) ?? upper;
  } catch {
    return upper;
  }
}

const byName = (a: Country, b: Country) => a.name.localeCompare(b.name, "en");

const COUNTRIES: Country[] = ISO_CODES.map((code) => ({ code, name: countryName(code) }));

export const FEATURED_COUNTRIES: Country[] = COUNTRIES.filter((c) =>
  FEATURED_CODES.includes(c.code),
).sort(byName);

export const OTHER_COUNTRIES: Country[] = COUNTRIES.filter(
  (c) => !FEATURED_CODES.includes(c.code),
).sort(byName);

/**
 * Rough bounding boxes (min_lng, min_lat, max_lng, max_lat) used to frame the map before any point
 * is entered and to suggest a country from a coordinate. They are hints, not borders: the user
 * confirms the country, and the server resolves providers from it. Countries without an entry get
 * a world view and no suggestions.
 */
const COUNTRY_BBOX: Record<string, BBox> = {
  KE: [33.9, -4.7, 41.9, 5.5],
  TZ: [29.3, -11.8, 40.5, -0.9],
  UG: [29.5, -1.5, 35.0, 4.3],
  RW: [28.8, -2.9, 30.9, -1.0],
  BI: [28.9, -4.5, 30.9, -2.3],
  ET: [33.0, 3.4, 48.0, 14.9],
  SS: [23.4, 3.5, 35.9, 12.2],
  SO: [40.9, -1.7, 51.4, 12.0],
  DJ: [41.7, 10.9, 43.4, 12.7],
  ER: [36.4, 12.4, 43.1, 18.0],
  MW: [32.7, -17.1, 35.9, -9.4],
  ZM: [22.0, -18.1, 33.7, -8.2],
  MZ: [30.2, -26.9, 40.9, -10.5],
  ZW: [25.2, -22.4, 33.1, -15.6],
  CD: [12.2, -13.5, 31.3, 5.4],
  DE: [5.9, 47.3, 15.0, 55.1],
  FR: [-5.2, 42.3, 8.3, 51.1],
  GB: [-8.7, 49.8, 1.8, 60.9],
  ES: [-9.4, 35.9, 3.4, 43.9],
  IT: [6.6, 36.6, 18.6, 47.1],
  NL: [3.3, 50.7, 7.3, 53.6],
};

export const WORLD_BBOX: BBox = [-170, -55, 170, 75];

export function countryBBox(code: string | null | undefined): BBox {
  return (code && COUNTRY_BBOX[code.toUpperCase()]) || WORLD_BBOX;
}

function inBBox([lng, lat]: LngLat, [w, s, e, n]: BBox): boolean {
  return lng >= w && lng <= e && lat >= s && lat <= n;
}

/** Whether the point lies in the country's rough box; `null` when we have no box to judge by. */
export function countryContains(code: string, point: LngLat): boolean | null {
  const box = COUNTRY_BBOX[code.toUpperCase()];
  return box ? inBBox(point, box) : null;
}

/** Best-guess country for a coordinate among those we have boxes for (smallest box wins). */
export function suggestCountry(point: LngLat): string | null {
  let best: { code: string; area: number } | null = null;
  for (const [code, box] of Object.entries(COUNTRY_BBOX)) {
    if (!inBBox(point, box)) continue;
    const area = (box[2] - box[0]) * (box[3] - box[1]);
    if (!best || area < best.area) best = { code, area };
  }
  return best?.code ?? null;
}
