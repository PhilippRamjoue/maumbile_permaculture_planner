import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { DesignEditorPage } from "./DesignEditorPage";
import { planningKeys, planningApi } from "./api";
import { siteKeys, sitesApi } from "../../entities/siteQueries";
import { site, user } from "../../shared/testing/fixtures";
import { RequireAuth } from "../../app/guards";
import { ME_QUERY_KEY } from "../auth/hooks";
import { authApi } from "../auth/api";
import { ApiError } from "../../shared/api/client";

// Isolate the route lifetime from WebGL: this state belongs to the mounted editor instance.
vi.mock("./Workspace", () => ({
  Workspace: function DraftProbe() {
    const [draft, setDraft] = useState("saved value");
    return <input aria-label="Draft" value={draft} onChange={(e) => setDraft(e.target.value)} />;
  },
}));

afterEach(() => vi.restoreAllMocks());

it.each(["design", "site", "catalogue", "session", "expired session"])(
  "preserves an unsaved draft when a %s refresh fails",
  async (domain) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(ME_QUERY_KEY, user);
    client.setQueryData(siteKeys.detail(site.id), site);
    client.setQueryData(planningKeys.design("p1"), {
      plan: { id: "p1", site_id: site.id, revision: 1, layers: [] },
      features: { type: "FeatureCollection", features: [] },
    });
    client.setQueryData(planningKeys.types, []);
    const router = createMemoryRouter(
      [
        {
          element: <RequireAuth />,
          children: [{ path: "/sites/:siteId/design/:planId", element: <DesignEditorPage /> }],
        },
      ],
      { initialEntries: [`/sites/${site.id}/design/p1`] },
    );
    const view = render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    const input = screen.getByLabelText("Draft");
    fireEvent.change(input, { target: { value: "unsaved work" } });
    const failure = new Error("temporary outage");
    let key: readonly string[];
    if (domain === "design") {
      key = planningKeys.design("p1");
      vi.spyOn(planningApi, "design").mockRejectedValue(failure);
    } else if (domain === "site") {
      key = siteKeys.detail(site.id);
      vi.spyOn(sitesApi, "get").mockRejectedValue(failure);
    } else if (domain === "catalogue") {
      key = planningKeys.types;
      vi.spyOn(planningApi, "types").mockRejectedValue(failure);
    } else {
      key = ME_QUERY_KEY;
      vi.spyOn(authApi, "me").mockRejectedValue(
        domain === "expired session" ? new ApiError(401, "Expired") : failure,
      );
    }
    await act(async () => {
      await client.refetchQueries({ queryKey: key });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Your draft is still here");
    expect(screen.getByLabelText("Draft")).toBe(input);
    expect(input).toHaveValue("unsaved work");
    view.unmount();
    client.clear();
  },
);
