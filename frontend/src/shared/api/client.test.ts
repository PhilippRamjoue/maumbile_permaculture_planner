import { describe, expect, it } from "vitest";

import { mockApi, problem, requestedRoutes } from "../testing/mockApi";
import { ApiError, apiFetch } from "./client";

async function failure(request: Promise<unknown>): Promise<ApiError> {
  try {
    await request;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error("expected the request to fail");
}

describe("apiFetch", () => {
  it("calls /api/v1 with credentials included and parses JSON", async () => {
    const fetchMock = mockApi({ "GET /sites": { json: { items: [] } } });

    await expect(apiFetch("/sites", { query: { limit: 5 } })).resolves.toEqual({ items: [] });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/sites?limit=5");
    expect(init.credentials).toBe("include");
  });

  it("sends JSON bodies", async () => {
    const fetchMock = mockApi({ "POST /auth/login": { json: { id: "u1" } } });
    await apiFetch("/auth/login", { method: "POST", body: { email: "a@b.c" } });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe('{"email":"a@b.c"}');
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("returns undefined for 204", async () => {
    mockApi({ "POST /auth/logout": { status: 204 } });
    await expect(apiFetch("/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("raises ApiError carrying the problem+json title", async () => {
    mockApi({ "POST /auth/register": problem(409, "Email already registered") });

    const error = await failure(apiFetch("/auth/register", { method: "POST", body: {} }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.userMessage).toBe("Email already registered");
  });

  it("surfaces the first field-level validation error", async () => {
    mockApi({
      "POST /sites": problem(422, "Validation error", {
        errors: [{ loc: ["body", "name"], msg: "String should have at least 1 character" }],
      }),
    });

    const error = await failure(apiFetch("/sites", { method: "POST", body: {} }));

    expect(error.userMessage).toBe("name: String should have at least 1 character");
  });

  it("refreshes the session once on 401 and replays the request", async () => {
    let calls = 0;
    const fetchMock = mockApi({
      "GET /sites": () => (++calls === 1 ? problem(401, "Not authenticated") : { json: { ok: 1 } }),
      "POST /auth/refresh": { json: {} },
    });

    await expect(apiFetch("/sites")).resolves.toEqual({ ok: 1 });
    expect(requestedRoutes(fetchMock)).toEqual(["GET /sites", "POST /auth/refresh", "GET /sites"]);
  });

  it("shares one refresh between concurrent 401s", async () => {
    const seen = new Set<string>();
    const fetchMock = mockApi({
      "GET /a": () => (seen.has("a") ? { json: 1 } : (seen.add("a"), problem(401, "no"))),
      "GET /b": () => (seen.has("b") ? { json: 2 } : (seen.add("b"), problem(401, "no"))),
      "POST /auth/refresh": { json: {} },
    });

    await expect(Promise.all([apiFetch("/a"), apiFetch("/b")])).resolves.toEqual([1, 2]);
    expect(requestedRoutes(fetchMock).filter((r) => r === "POST /auth/refresh")).toHaveLength(1);
  });

  it("gives up with the original 401 when the refresh fails", async () => {
    const fetchMock = mockApi({
      "GET /sites": problem(401, "Not authenticated"),
      "POST /auth/refresh": problem(401, "Invalid refresh token"),
    });

    const error = await failure(apiFetch("/sites"));

    expect(error.status).toBe(401);
    expect(requestedRoutes(fetchMock)).toEqual(["GET /sites", "POST /auth/refresh"]);
  });

  it("never tries to refresh around login", async () => {
    const fetchMock = mockApi({ "POST /auth/login": problem(401, "Invalid email or password") });

    await expect(apiFetch("/auth/login", { method: "POST", body: {} })).rejects.toMatchObject({
      status: 401,
    });
    expect(requestedRoutes(fetchMock)).toEqual(["POST /auth/login"]);
  });
});
