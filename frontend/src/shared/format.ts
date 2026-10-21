/** Human-friendly land area: hectares from 1 ha up, otherwise square metres. */
export function formatArea(areaM2: number): string {
  if (areaM2 >= 10_000) {
    return `${(areaM2 / 10_000).toLocaleString("en", { maximumFractionDigits: 2 })} ha`;
  }
  return `${Math.round(areaM2).toLocaleString("en")} m²`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" });
}
