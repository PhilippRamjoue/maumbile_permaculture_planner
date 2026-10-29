import { useEffect, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

/** The map's bearing, kept current while it turns or moves (0 is north up). */
function useBearing(map: MapLibreMap | null) {
  const [bearing, setBearing] = useState(() => map?.getBearing() ?? 0);
  useEffect(() => {
    if (!map) return;
    const update = () => setBearing(map.getBearing());
    update();
    map.on("rotate", update);
    map.on("move", update);
    return () => {
      map.off("rotate", update);
      map.off("move", update);
    };
  }, [map]);
  return bearing;
}

const LETTERS = [
  { letter: "N", x: 0, y: -26 },
  { letter: "E", x: 26, y: 0 },
  { letter: "S", x: 0, y: 26 },
  { letter: "W", x: -26, y: 0 },
] as const;

/**
 * A small compass rose over the map, marked N, E, S and W. The rose turns against the map's
 * bearing, so N always points to true north on the ground, whichever way the map is turned (it is
 * north up unless something rotates it). A view aid like the grid: it is never saved.
 */
export function CompassControl({ map }: { map: MapLibreMap | null }) {
  const bearing = useBearing(map);
  const turned = Math.round(((bearing % 360) + 360) % 360);
  return (
    <div
      className="editor-compass"
      role="img"
      aria-label={turned === 0 ? "Compass: north is up" : `Compass: north is ${turned}° off up`}
    >
      <svg viewBox="-36 -36 72 72" width="64" height="64" aria-hidden="true">
        <circle r="34" className="editor-compass__disc" />
        <g transform={`rotate(${-bearing})`}>
          <path d="M0 -20 L5 0 L0 4 L-5 0 Z" className="editor-compass__north" />
          <path d="M0 20 L5 0 L0 4 L-5 0 Z" className="editor-compass__south" />
          {LETTERS.map(({ letter, x, y }) => (
            <text
              key={letter}
              x={x}
              y={y}
              className={letter === "N" ? "editor-compass__n" : "editor-compass__letter"}
              textAnchor="middle"
              dominantBaseline="central"
              // Keep each letter upright while the rose turns.
              transform={`rotate(${bearing} ${x} ${y})`}
            >
              {letter}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
}
