import { vi, type Mock } from "vitest";

import { API_BASE } from "../config";

export interface MockRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

export interface MockReply {
  status?: number;
  json?: unknown;
}

export type MockHandler = MockReply | ((request: MockRequest) => MockReply);

/**
 * Stubs `fetch` for the API. Handlers are keyed `"METHOD /path"` relative to `/api/v1`
 * (query string excluded). Unhandled requests fail loudly so tests can't pass by accident.
 */
export function mockApi(handlers: Record<string, MockHandler>): Mock {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname.startsWith(API_BASE)
      ? url.pathname.slice(API_BASE.length)
      : url.pathname;
    const handler = handlers[`${method} ${path}`];
    if (!handler) throw new Error(`Unhandled API request: ${method} ${path}`);

    const request: MockRequest = {
      method,
      path,
      query: url.searchParams,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    const reply = typeof handler === "function" ? handler(request) : handler;
    const status = reply.status ?? 200;
    const headers = {
      "Content-Type": status >= 400 ? "application/problem+json" : "application/json",
    };
    return new Response(status === 204 ? null : JSON.stringify(reply.json ?? {}), {
      status,
      headers,
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Paths (with method) the app has requested so far, e.g. `["GET /auth/me"]`. */
export function requestedRoutes(fetchMock: Mock): string[] {
  return fetchMock.mock.calls.map(([input, init]) => {
    const url = new URL(String(input), "http://localhost");
    const path = url.pathname.startsWith(API_BASE)
      ? url.pathname.slice(API_BASE.length)
      : url.pathname;
    return `${((init as RequestInit | undefined)?.method ?? "GET").toUpperCase()} ${path}`;
  });
}

export const problem = (status: number, title: string, extra: object = {}): MockReply => ({
  status,
  json: { type: "about:blank", title, status, ...extra },
});
