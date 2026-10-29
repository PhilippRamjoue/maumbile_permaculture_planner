import { useState } from "react";

import type { DesignFeature } from "../../entities/planning";
import {
  footprintOf,
  footprintReadout,
  normalizeDegrees,
  sizeProblem,
  switchShape,
  withFootprint,
  type Footprint,
} from "./footprint";

/** A decimal typed by hand: "1.5" or "1,5" (many keyboards have only the comma). */
const parse = (text: string) => (text.trim() === "" ? Number.NaN : Number(text.replace(",", ".")));
const show = (value: number) => String(Number(value.toFixed(2)));

export function NumberField({
  label,
  value,
  problem,
  onCommit,
}: {
  label: string;
  value: number;
  problem(value: number): string | null;
  onCommit(value: number): void;
}) {
  // The text being typed, while a field is being edited; otherwise the saved number is shown.
  const [draft, setDraft] = useState<string | null>(null);
  const error = draft === null ? null : problem(parse(draft));
  return (
    <label className="editor-footprint__field">
      {label}
      <input
        inputMode="decimal"
        autoComplete="off"
        value={draft ?? show(value)}
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          setDraft(event.target.value);
          const typed = parse(event.target.value);
          if (problem(typed) === null) onCommit(typed);
        }}
        onBlur={() => setDraft(null)}
      />
      {error && (
        <span className="editor-footprint__error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

const rotationProblem = (degrees: number) =>
  Number.isFinite(degrees) ? null : "Enter a number of degrees.";

/**
 * The exact size of a to-scale element: its diameter, or its width and length and the turn of its
 * rectangle. Placing an element never asks for these; they are here when a plan needs the real
 * numbers. Editing one redraws the footprint around the same centre, and so does switching
 * between a round and a rectangular shape (the larger dimension carries over).
 */
export function FootprintFields({
  selected,
  onChange,
}: {
  selected: DesignFeature;
  onChange(feature: DesignFeature): void;
}) {
  const footprint = footprintOf(selected);
  if (!footprint) return null;
  const change = (next: Footprint) => onChange(withFootprint(selected, next));
  return (
    <fieldset className="editor-footprint">
      <legend>Exact size</legend>
      <div className="editor-tools" role="group" aria-label="Shape">
        {(["round", "rect"] as const).map((shape) => (
          <button
            key={shape}
            type="button"
            className="btn"
            aria-pressed={footprint.shape === shape}
            onClick={() => footprint.shape !== shape && change(switchShape(footprint, shape))}
          >
            {shape === "round" ? "Round" : "Rectangle"}
          </button>
        ))}
      </div>
      <p className="editor-footprint__readout">{footprintReadout(selected)}</p>
      {footprint.shape === "round" ? (
        <NumberField
          label="Diameter (m)"
          value={footprint.diameter_m}
          problem={sizeProblem}
          onCommit={(diameter_m) => change({ ...footprint, diameter_m })}
        />
      ) : (
        <>
          <NumberField
            label="Width (m)"
            value={footprint.width_m}
            problem={sizeProblem}
            onCommit={(width_m) => change({ ...footprint, width_m })}
          />
          <NumberField
            label="Length (m)"
            value={footprint.length_m}
            problem={sizeProblem}
            onCommit={(length_m) => change({ ...footprint, length_m })}
          />
          <NumberField
            label="Rotation (°)"
            value={footprint.rotation_deg}
            problem={rotationProblem}
            onCommit={(degrees) =>
              change({ ...footprint, rotation_deg: normalizeDegrees(degrees) })
            }
          />
        </>
      )}
      <p className="muted">Width is east–west and length north–south, before rotating.</p>
    </fieldset>
  );
}
