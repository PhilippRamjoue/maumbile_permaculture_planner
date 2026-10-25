import { useState } from "react";

import type { Tool } from "./useEditorMap";

const MEASURE_TOOLS: { tool: Tool; label: string; text: string }[] = [
  { tool: "measure-line", label: "Measure distance", text: "Distance" },
  { tool: "measure-area", label: "Measure area", text: "Area" },
];

/**
 * The map's measuring tools: one small "Measure" button that unfolds, inline, into distance and
 * area, plus a switch for the optional distance grid (off by default). Measuring is a transient
 * drawing and the grid a visual aid, so neither is saved; both work in every focus. Render it
 * inside the map's `.map-tools` row.
 */
export function MapToolsControl({
  tool,
  choose,
  disabled,
  grid,
  gridStep,
  onGridChange,
}: {
  tool: Tool;
  choose(tool: Tool): void;
  disabled: boolean;
  /** Whether the optional distance grid is on. */
  grid: boolean;
  /** The grid's spacing in metres at the current zoom, once known. */
  gridStep: number | null;
  onGridChange(on: boolean): void;
}) {
  const [open, setOpen] = useState(false);
  const measuring = tool.startsWith("measure");
  return (
    <div className="map-tool-group" role="group" aria-label="Measure">
      <button
        type="button"
        className="btn"
        aria-expanded={open}
        aria-pressed={measuring}
        disabled={disabled}
        onClick={() => setOpen((previous) => !previous)}
      >
        Measure
      </button>
      {open &&
        MEASURE_TOOLS.map(({ tool: option, label, text }) => (
          <button
            key={option}
            type="button"
            className="btn"
            aria-label={label}
            aria-pressed={tool === option}
            disabled={disabled}
            // A second click puts the tool down again.
            onClick={() => choose(tool === option ? "select" : option)}
          >
            {text}
          </button>
        ))}
      {open && (
        <button
          type="button"
          className="btn"
          aria-pressed={grid}
          title="Metre lines over the map, counted from the plot's south-west corner"
          onClick={() => onGridChange(!grid)}
        >
          {grid && gridStep ? `Grid · ${gridStep} m` : "Grid"}
        </button>
      )}
    </div>
  );
}
