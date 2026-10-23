import { glyphFor, inkOn } from "./icons";

/**
 * An element icon as inline SVG: the same glyph the map and the export use, on a coloured disc.
 * Renders nothing for an entry without an icon (lines, overlays).
 */
export function GlyphIcon({
  icon,
  color,
  size = 22,
}: {
  icon: string | null | undefined;
  color: string;
  size?: number;
}) {
  const glyph = glyphFor(icon);
  if (!glyph) return null;
  const ink = inkOn(color);
  return (
    <svg
      className="glyph-icon"
      width={size}
      height={size}
      viewBox="-3 -3 30 30"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="14" fill={color} stroke="#1c2a21" strokeWidth="1.6" />
      <g stroke={ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {glyph.map((op, i) => {
          const fill = op.fill ? ink : "none";
          return "circle" in op ? (
            <circle key={i} cx={op.circle[0]} cy={op.circle[1]} r={op.circle[2]} fill={fill} />
          ) : (
            <path
              key={i}
              d={
                op.path.map(([x, y], j) => `${j === 0 ? "M" : "L"}${x} ${y}`).join(" ") +
                (op.closed ? " Z" : "")
              }
              fill={fill}
            />
          );
        })}
      </g>
    </svg>
  );
}
