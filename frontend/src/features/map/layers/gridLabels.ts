/** Prefix of the map image names made for grid numbers: `gridlabel|<text>`. */
export const GRID_LABEL_PREFIX = "gridlabel|";
export const gridLabelName = (text: string) => `${GRID_LABEL_PREFIX}${text}`;
export const parseGridLabelName = (name: string) =>
  name.startsWith(GRID_LABEL_PREFIX) ? name.slice(GRID_LABEL_PREFIX.length) : null;

export const GRID_LABEL_PIXEL_RATIO = 2;

/**
 * A short number as a small image: white text with a dark outline, which reads on satellite
 * imagery. Labels are images because the map style has no font server to fetch glyphs from (no
 * external requests, works offline), the same way the element icons are made. Null where there
 * is no canvas (tests).
 */
export function renderGridLabel(text: string): ImageData | null {
  if (typeof document === "undefined") return null;
  const ratio = GRID_LABEL_PIXEL_RATIO;
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return null;
  const font = `600 ${12 * ratio}px system-ui, sans-serif`;
  probe.font = font;
  const width = Math.ceil(probe.measureText(text).width) + 8 * ratio;
  const height = 18 * ratio;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3 * ratio;
  ctx.strokeStyle = "rgba(20, 30, 24, 0.85)";
  ctx.strokeText(text, width / 2, height / 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, width / 2, height / 2);
  return ctx.getImageData(0, 0, width, height);
}
