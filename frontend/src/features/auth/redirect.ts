/** Where to go after signing in: the page the guard bounced the user from, else the dashboard. */
export function redirectTarget(locationState: unknown): string {
  const from = (locationState as { from?: unknown } | null)?.from;
  // Only same-app absolute paths: never follow an external or protocol-relative target.
  if (typeof from === "string" && from.startsWith("/") && !from.startsWith("//")) return from;
  return "/";
}
