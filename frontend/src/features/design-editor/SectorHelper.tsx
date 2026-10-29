import { useMemo, useState } from "react";

import type { DesignFeature } from "../../entities/planning";
import {
  SECTOR_KINDS,
  dayOfYear,
  sectorFeature,
  sectorProblem,
  sunPath,
  type SectorKind,
} from "./sectors";

const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/**
 * Adds sun/wind/... sectors from compass bearings instead of by hand: a wedge from the site
 * centre sweeping clockwise between two bearings. For sun sectors, the sunrise/sunset azimuths
 * for a date at the site's latitude can fill the bearings in.
 */
export function SectorHelper({
  origin,
  defaultRadiusM,
  layerId,
  disabled,
  initialKind = "wind",
  onAdd,
}: {
  /** [lng, lat] the wedge radiates from (the site centre). */
  origin: [number, number];
  defaultRadiusM: number;
  /** The visible "Sectors" layer to add into; the helper is disabled without one. */
  layerId: string | undefined;
  disabled: boolean;
  /** The kind to start on, so it matches the kind chosen in the panel. */
  initialKind?: SectorKind;
  onAdd(feature: DesignFeature): void;
}) {
  const [kind, setKind] = useState<SectorKind>(initialKind);
  const [from, setFrom] = useState("315");
  const [to, setTo] = useState("45");
  const [radius, setRadius] = useState(String(defaultRadiusM));
  const [date, setDate] = useState(() => isoDate(new Date()));
  const [problem, setProblem] = useState<string | null>(null);

  const latitude = origin[1];
  const day = dayOfYear(date);
  const sun = useMemo(() => (day === null ? null : sunPath(latitude, day)), [latitude, day]);

  const applySunPath = () => {
    if (!sun) return;
    setKind("sun");
    setFrom(String(sun.from));
    setTo(String(sun.to));
    setProblem(null);
  };
  const preset = (month: number) => {
    const year = Number(date.slice(0, 4)) || new Date().getFullYear();
    setDate(`${year}-${String(month).padStart(2, "0")}-21`);
  };

  const add = () => {
    const spec = { kind, from: Number(from), to: Number(to), origin, radiusM: Number(radius) };
    const error = sectorProblem(spec);
    setProblem(error);
    if (error || !layerId) return;
    onAdd(sectorFeature(spec, crypto.randomUUID(), layerId));
  };

  return (
    <fieldset className="sector-helper" disabled={disabled}>
      <legend>Sector from bearings</legend>
      <p className="muted">
        Draws a wedge from the site centre, sweeping clockwise from the first bearing to the second
        (0° = north, 90° = east). For wind, give the directions it blows from.
      </p>
      <label>
        Sector kind
        <select value={kind} onChange={(e) => setKind(e.target.value as SectorKind)}>
          {SECTOR_KINDS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <label>
        From bearing (°)
        <input type="number" step="1" value={from} onChange={(e) => setFrom(e.target.value)} />
      </label>
      <label>
        To bearing (°)
        <input type="number" step="1" value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
      <label>
        Radius (m)
        <input
          type="number"
          min={5}
          step="5"
          value={radius}
          onChange={(e) => setRadius(e.target.value)}
        />
      </label>
      <details>
        <summary>Sun path for a date</summary>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="editor-tools">
          <button type="button" className="btn" onClick={() => preset(6)}>
            21 June
          </button>
          <button type="button" className="btn" onClick={() => preset(12)}>
            21 December
          </button>
        </div>
        {day === null ? (
          <p className="muted">Pick a valid date.</p>
        ) : sun ? (
          <p role="status">
            At {latitude.toFixed(2)}° latitude the sun rises at {sun.sunrise}° and sets at{" "}
            {sun.sunset}°.
          </p>
        ) : (
          <p role="status">The sun does not rise or set on this date at this latitude.</p>
        )}
        <button type="button" className="btn" disabled={!sun} onClick={applySunPath}>
          Use this sun path
        </button>
        <p className="muted">
          Approximate (±1°, no terrain or horizon): enough to place a sector, not a shading survey.
        </p>
      </details>
      <button type="button" className="btn btn--primary" disabled={!layerId} onClick={add}>
        Add sector
      </button>
      {!layerId && <p className="muted">Show the Sectors layer to add sectors.</p>}
      {problem && <p role="alert">{problem}</p>}
    </fieldset>
  );
}
