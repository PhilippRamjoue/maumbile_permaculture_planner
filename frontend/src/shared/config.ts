/** Base path of the backend API. Same-origin by default (Vite dev proxy / nginx in production). */
export const API_BASE: string = (import.meta.env.VITE_API_BASE_URL ?? "/api/v1").replace(
  /\/+$/,
  "",
);

/**
 * Absolute URL for an API path, usable where relative URLs are not (e.g. MapLibre workers).
 * Built by concatenation, not `new URL()`, which would percent-encode tile templates'
 * `{z}/{x}/{y}` placeholders.
 */
export function absoluteApiUrl(path: string): string {
  const base = /^https?:\/\//.test(API_BASE) ? API_BASE : `${window.location.origin}${API_BASE}`;
  return `${base}${path}`;
}
