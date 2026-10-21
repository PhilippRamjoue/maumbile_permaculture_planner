import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderApp } from "../../shared/testing/renderApp";
import { user } from "../../shared/testing/fixtures";
import { mockApi, problem, requestedRoutes } from "../../shared/testing/mockApi";
import { redirectTarget } from "./redirect";

const emptySites = { json: { items: [], total: 0, limit: 100, offset: 0 } };

describe("auth guard", () => {
  it("sends anonymous visitors to the login page", async () => {
    mockApi({
      "GET /auth/me": problem(401, "Not authenticated"),
      "POST /auth/refresh": problem(401, "x"),
    });
    const { router } = renderApp("/");

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
  });

  it("remembers where the visitor was heading", async () => {
    mockApi({
      "GET /auth/me": problem(401, "Not authenticated"),
      "POST /auth/refresh": problem(401, "x"),
    });
    const { router } = renderApp("/sites/abc/credits");

    await screen.findByRole("heading", { name: "Sign in" });
    expect(router.state.location.state).toEqual({ from: "/sites/abc/credits" });
  });

  it("lets a signed-in user through", async () => {
    mockApi({ "GET /auth/me": { json: user }, "GET /sites": emptySites });
    renderApp("/");

    expect(await screen.findByRole("heading", { name: "My sites" })).toBeInTheDocument();
    expect(screen.getByTestId("current-user")).toHaveTextContent("Wanjiru");
  });

  it("keeps signed-in users away from the login page", async () => {
    mockApi({ "GET /auth/me": { json: user }, "GET /sites": emptySites });
    const { router } = renderApp("/login");

    expect(await screen.findByRole("heading", { name: "My sites" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });

  it("offers a retry when the server cannot be reached", async () => {
    mockApi({ "GET /auth/me": problem(500, "Internal Server Error") });
    renderApp("/");

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the server/i);
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});

describe("login", () => {
  it("signs in and lands on the dashboard", async () => {
    let signedIn = false;
    const fetchMock = mockApi({
      "GET /auth/me": () => (signedIn ? { json: user } : problem(401, "Not authenticated")),
      "POST /auth/refresh": problem(401, "no refresh cookie"),
      "POST /auth/login": () => {
        signedIn = true;
        return { json: user };
      },
      "GET /sites": emptySites,
    });
    renderApp("/");

    await userEvent.type(await screen.findByLabelText("Email"), " wanjiru@example.org ");
    await userEvent.type(screen.getByLabelText("Password"), "s3cret-pass");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "My sites" })).toBeInTheDocument();
    const login = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/auth/login"));
    expect(JSON.parse(login![1].body)).toEqual({
      email: "wanjiru@example.org",
      password: "s3cret-pass",
    });
  });

  it("shows the server's message on bad credentials", async () => {
    mockApi({
      "GET /auth/me": problem(401, "Not authenticated"),
      "POST /auth/refresh": problem(401, "no refresh cookie"),
      "POST /auth/login": problem(401, "Invalid email or password"),
    });
    renderApp("/login");

    await userEvent.type(await screen.findByLabelText("Email"), "a@b.co");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
  });

  it("explains rate limiting", async () => {
    mockApi({
      "GET /auth/me": problem(401, "Not authenticated"),
      "POST /auth/refresh": problem(401, "no refresh cookie"),
      "POST /auth/login": problem(429, "Too many login attempts. Try again later."),
    });
    renderApp("/login");

    await userEvent.type(await screen.findByLabelText("Email"), "a@b.co");
    await userEvent.type(screen.getByLabelText("Password"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/too many attempts/i);
  });
});

describe("register", () => {
  it("creates the account, signs in and lands on the dashboard", async () => {
    let signedIn = false;
    const fetchMock = mockApi({
      "GET /auth/me": () => (signedIn ? { json: user } : problem(401, "Not authenticated")),
      "POST /auth/refresh": problem(401, "no refresh cookie"),
      "POST /auth/register": { status: 201, json: user },
      "POST /auth/login": () => {
        signedIn = true;
        return { json: user };
      },
      "GET /sites": emptySites,
    });
    renderApp("/register");

    await userEvent.type(await screen.findByLabelText("Email"), "wanjiru@example.org");
    await userEvent.type(screen.getByLabelText("Password"), "s3cret-pass");
    await userEvent.type(screen.getByLabelText(/^Name/), "Wanjiru");
    await userEvent.type(screen.getByLabelText(/^Country code/), "ke");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "My sites" })).toBeInTheDocument();
    const register = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/auth/register"));
    expect(JSON.parse(register![1].body)).toEqual({
      email: "wanjiru@example.org",
      password: "s3cret-pass",
      display_name: "Wanjiru",
      country_code: "KE",
    });
    expect(requestedRoutes(fetchMock).indexOf("POST /auth/login")).toBeGreaterThan(
      requestedRoutes(fetchMock).indexOf("POST /auth/register"),
    );
  });

  it("reports an already-registered email", async () => {
    mockApi({
      "GET /auth/me": problem(401, "Not authenticated"),
      "POST /auth/refresh": problem(401, "no refresh cookie"),
      "POST /auth/register": problem(409, "Email already registered"),
    });
    renderApp("/register");

    await userEvent.type(await screen.findByLabelText("Email"), "a@b.co");
    await userEvent.type(screen.getByLabelText("Password"), "long-enough-pw");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email already registered");
  });
});

describe("logout", () => {
  it("signs out and returns to the login page", async () => {
    let signedIn = true;
    mockApi({
      "GET /auth/me": () => (signedIn ? { json: user } : problem(401, "Not authenticated")),
      "POST /auth/refresh": problem(401, "no refresh cookie"),
      "POST /auth/logout": () => {
        signedIn = false;
        return { status: 204 };
      },
      "GET /sites": emptySites,
    });
    const { router } = renderApp("/");

    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });
});

describe("redirectTarget", () => {
  it("returns same-app paths", () => {
    expect(redirectTarget({ from: "/sites/1" })).toBe("/sites/1");
  });

  it.each([
    undefined,
    null,
    {},
    { from: 5 },
    { from: "https://evil.example" },
    { from: "//evil.example" },
  ])("falls back to the dashboard for %j", (state) => {
    expect(redirectTarget(state)).toBe("/");
  });
});
