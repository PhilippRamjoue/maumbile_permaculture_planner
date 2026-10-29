import { GLYPHS, type Glyph } from "../../entities/generated/icons";

/** The ink that reads on `color`: dark on light colours, white on dark ones. */
export function inkOn(color: string): string {
  const value = /^#[0-9a-f]{6}$/i.test(color) ? color : "#2f855a";
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#1c2a21" : "#ffffff";
}

/** The glyph for an element type's `icon` key, or undefined for lines, overlays and unknown keys. */
export const glyphFor = (key: string | null | undefined): Glyph | undefined =>
  key ? GLYPHS[key] : undefined;

/** Prefix of the map image names made for icons: `glyph|<key>|<#rrggbb>`. */
const BADGE_PREFIX = "glyph|";
export const badgeName = (key: string, color: string) => `${BADGE_PREFIX}${key}|${color}`;
export const parseBadgeName = (name: string) => {
  if (!name.startsWith(BADGE_PREFIX)) return null;
  const [key, color] = name.slice(BADGE_PREFIX.length).split("|");
  return key && color && glyphFor(key) ? { key, color } : null;
};

/** CSS pixel size of a badge on the map; the bitmap is drawn at twice this for sharpness. */
const BADGE_SIZE = 34;
export const BADGE_PIXEL_RATIO = 2;

/** Strokes a glyph centred in a `size`-pixel square at (cx, cy) on a 2D canvas. */
function drawGlyph(
  ctx: CanvasRenderingContext2D,
  glyph: Glyph,
  cx: number,
  cy: number,
  size: number,
  ink: string,
) {
  const k = size / 24;
  const ox = cx - size / 2;
  const oy = cy - size / 2;
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 2 * k;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const op of glyph) {
    ctx.beginPath();
    if ("circle" in op) {
      const [x, y, r] = op.circle;
      ctx.arc(ox + x * k, oy + y * k, r * k, 0, Math.PI * 2);
    } else {
      op.path.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(ox + x * k, oy + y * k);
        else ctx.lineTo(ox + x * k, oy + y * k);
      });
      if (op.closed) ctx.closePath();
    }
    if (op.fill) ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A map marker for one icon in one colour: the glyph on a coloured disc with a dark rim and a
 * white halo, so it reads on satellite imagery and stays distinguishable in a black-and-white
 * print. Returns null where no canvas exists (tests).
 */
export function renderBadge(key: string, color: string): ImageData | null {
  const glyph = glyphFor(key);
  if (!glyph || typeof document === "undefined") return null;
  const px = BADGE_SIZE * BADGE_PIXEL_RATIO;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const c = px / 2;
  const disc = (radius: number, fill: string) => {
    ctx.beginPath();
    ctx.arc(c, c, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  };
  disc(c - 1, "#ffffff");
  disc(c - 4, "#1c2a21");
  disc(c - 7, color);
  drawGlyph(ctx, glyph, c, c, (c - 7) * 1.3, inkOn(color));
  return ctx.getImageData(0, 0, px, px);
}
