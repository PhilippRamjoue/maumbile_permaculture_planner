import { API_BASE } from "../config";

/** RFC 7807 problem+json body as emitted by the backend (`app/core/errors.py`). */
interface Problem {
  title?: string;
  detail?: string;
  errors?: { loc?: (string | number)[]; msg?: string }[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly problem: Problem | null;

  constructor(status: number, message: string, problem: Problem | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }

  /** Human-friendly message; includes the first field-level validation error if present. */
  get userMessage(): string {
    const first = this.problem?.errors?.[0];
    if (first?.msg) {
      const field = first.loc?.filter((p) => p !== "body").join(".");
      return field ? `${field}: ${first.msg}` : first.msg;
    }
    return this.problem?.detail ?? this.message;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
  /** Try `POST /auth/refresh` once on a 401 and replay the request. Default true. */
  refreshOn401?: boolean;
}

const NO_REFRESH_PATHS = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"];

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = `${API_BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const init: RequestInit = {
    method: options.method ?? "GET",
    credentials: "include",
    signal: options.signal,
    headers: { Accept: "application/json" },
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { ...init.headers, "Content-Type": "application/json" };
  }
  return fetch(buildUrl(path, options.query), init);
}

// Concurrent 401s share one refresh round-trip.
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshInFlight ??= send("/auth/refresh", { method: "POST" })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

async function toError(res: Response): Promise<ApiError> {
  let problem: Problem | null = null;
  try {
    problem = (await res.json()) as Problem;
  } catch {
    // Non-JSON error body (e.g. a proxy error page): fall through to the status text.
  }
  return new ApiError(res.status, problem?.title ?? res.statusText ?? "Request failed", problem);
}

async function request(path: string, options: RequestOptions): Promise<Response> {
  let res = await send(path, options);

  const canRefresh = (options.refreshOn401 ?? true) && !NO_REFRESH_PATHS.includes(path);
  if (res.status === 401 && canRefresh && (await refreshSession())) {
    res = await send(path, options);
  }

  if (!res.ok) throw await toError(res);
  return res;
}

/** Typed JSON request against `/api/v1`. Throws {@link ApiError} on non-2xx. */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await request(path, options);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Binary request (e.g. an export file) with the same session handling as {@link apiFetch}. */
export async function apiBlob(
  path: string,
  options: RequestOptions = {},
): Promise<{ blob: Blob; filename: string | null }> {
  const res = await request(path, options);
  const disposition = res.headers.get("Content-Disposition") ?? "";
  return { blob: await res.blob(), filename: /filename="([^"]+)"/.exec(disposition)?.[1] ?? null };
}
