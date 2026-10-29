import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { Plan, PlanDetail } from "../../entities/planning";
import { mockApi, problem, requestedRoutes } from "../../shared/testing/mockApi";
import { PlanSwitcher } from "./PlanSwitcher";

const SITE = "site-1";
const plan = (id: string, name: string): Plan => ({
  id,
  site_id: SITE,
  name,
  description: null,
  goals: null,
  created_at: "2026-10-01T08:00:00Z",
  updated_at: "2026-10-01T08:00:00Z",
});
const page = (items: Plan[], total = items.length, offset = 0) => ({
  items,
  total,
  limit: 100,
  offset,
});
const A = plan("plan-a", "Food forest");
const B = plan("plan-b", "Food forest (copy)");
const LIST = `GET /sites/${SITE}/plans`;

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}</p>;
}

function show(flush: () => Promise<void> = () => Promise.resolve(), disabled = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/sites/${SITE}/design/plan-a`]}>
        <Routes>
          <Route
            path="/sites/:siteId/design/:planId"
            element={
              <>
                <PlanSwitcher siteId={SITE} planId="plan-a" flush={flush} disabled={disabled} />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), queryClient };
}

const where = () => screen.getByTestId("where").textContent;

describe("PlanSwitcher", () => {
  it("lists every plan of the site, with the open one chosen", async () => {
    mockApi({ [LIST]: { json: page([B, A]) } });
    show();
    const select = await screen.findByRole("combobox", { name: "Switch plan" });
    await waitFor(() => expect(select).toBeEnabled());
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.text)).toEqual([
      "Food forest (copy)",
      "Food forest",
    ]);
    expect(select).toHaveValue("plan-a");
  });

  it("opens the chosen plan", async () => {
    mockApi({ [LIST]: { json: page([B, A]) } });
    const { user } = show();
    const select = await screen.findByRole("combobox", { name: "Switch plan" });
    await waitFor(() => expect(select).toBeEnabled());
    await user.selectOptions(select, "plan-b");
    expect(where()).toBe(`/sites/${SITE}/design/plan-b`);
  });

  it("keeps fetching pages until every plan is listed", async () => {
    const fetchMock = mockApi({
      [LIST]: (request) =>
        request.query.get("offset") === "0" ? { json: page([B], 2, 0) } : { json: page([A], 2, 1) },
    });
    show();
    await waitFor(() =>
      expect(
        Array.from(
          (screen.getByRole("combobox", { name: "Switch plan" }) as HTMLSelectElement).options,
        ).map((o) => o.text),
      ).toEqual(["Food forest (copy)", "Food forest"]),
    );
    expect(requestedRoutes(fetchMock)).toEqual([LIST, LIST]);
  });
});

describe("Duplicate plan", () => {
  const copy: PlanDetail = { ...B, revision: 0, layers: [] };

  it("saves what is pending first, then copies the plan and opens the copy", async () => {
    const order: string[] = [];
    const flush = vi.fn(async () => {
      order.push("flush");
    });
    const fetchMock = mockApi({
      [LIST]: () => {
        order.push("list");
        return { json: page([A]) };
      },
      "POST /plans/plan-a/duplicate": () => {
        order.push("duplicate");
        return { json: copy, status: 201 };
      },
    });
    const { user } = show(flush);
    await screen.findByRole("combobox", { name: "Switch plan" });
    await waitFor(() => expect(order).toEqual(["list"]));

    await user.click(screen.getByRole("button", { name: "Duplicate plan" }));

    await waitFor(() => expect(where()).toBe(`/sites/${SITE}/design/plan-b`));
    expect(flush).toHaveBeenCalledOnce();
    // The unsaved work is written before the copy is made, so the copy includes it; the list is
    // refetched afterwards so the new plan shows up in every switcher.
    expect(order.slice(0, 3)).toEqual(["list", "flush", "duplicate"]);
    expect(order).toContain("list");
    expect(requestedRoutes(fetchMock)).toContain("POST /plans/plan-a/duplicate");
    expect(order.filter((step) => step === "list").length).toBeGreaterThanOrEqual(2);
  });

  it("does not copy anything when saving first fails, and says why", async () => {
    const flush = vi.fn(async () => {
      throw new Error("Fix the invalid border before saving or exporting.");
    });
    const fetchMock = mockApi({ [LIST]: { json: page([A]) } });
    const { user } = show(flush);
    await screen.findByRole("combobox", { name: "Switch plan" });

    await user.click(screen.getByRole("button", { name: "Duplicate plan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Fix the invalid border");
    expect(requestedRoutes(fetchMock).some((route) => route.startsWith("POST"))).toBe(false);
    expect(where()).toBe(`/sites/${SITE}/design/plan-a`);
    expect(screen.getByRole("button", { name: "Duplicate plan" })).toBeEnabled(); // can retry
  });

  it("stays on the plan and shows the server's complaint when the copy fails", async () => {
    mockApi({
      [LIST]: { json: page([A]) },
      "POST /plans/plan-a/duplicate": problem(404, "Plan not found"),
    });
    const { user } = show();
    await screen.findByRole("combobox", { name: "Switch plan" });
    await user.click(screen.getByRole("button", { name: "Duplicate plan" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(where()).toBe(`/sites/${SITE}/design/plan-a`);
  });

  it("waits while a save is running", async () => {
    mockApi({ [LIST]: { json: page([A]) } });
    show(() => Promise.resolve(), true);
    await screen.findByRole("combobox", { name: "Switch plan" });
    expect(screen.getByRole("button", { name: "Duplicate plan" })).toBeDisabled();
  });
});
