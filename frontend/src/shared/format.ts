/** Human-friendly land area: hectares from 1 ha up, otherwise square metres. */
export function formatArea(areaM2: number): string {
  if (areaM2 >= 10_000) {
    return `${(areaM2 / 10_000).toLocaleString("en", { maximumFractionDigits: 2 })} ha`;
  }
  return `${Math.round(areaM2).toLocaleString("en")} m²`;
}

/** Human-friendly distance: metres (one decimal below 100 m), kilometres from 1 km up. */
export function formatLength(lengthM: number): string {
  if (lengthM >= 1000) {
    return `${(lengthM / 1000).toLocaleString("en", { maximumFractionDigits: 2 })} km`;
  }
  return `${lengthM < 100 ? lengthM.toFixed(1) : Math.round(lengthM)} m`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" });
}
