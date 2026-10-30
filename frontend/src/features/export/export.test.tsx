import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mockApi, problem, requestedRoutes } from "../../shared/testing/mockApi";
import { ExportMenu } from "./ExportMenu";
import { SharedPlanPage } from "./SharedPlanPage";
import { sharedExportUrl } from "./api";
import { exportApi } from "./api";

const PLAN = "11111111-1111-1111-1111-111111111111";

function renderMenu(unsaved = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ExportMenu planId={PLAN} unsaved={unsaved} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("ExportMenu", () => {
  it("does not export an older document when saving the latest changes fails", async () => {
    mockApi({ [`GET /plans/${PLAN}/share`]: { json: { shared: false, created_at: null } } });
    const download = vi.spyOn(exportApi, "download");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ExportMenu
          planId={PLAN}
          unsaved
          beforeDownload={async () => {
            throw new Error("Border could not be saved");
          }}
        />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save and download: Image (PNG)" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Border could not be saved");
    expect(download).not.toHaveBeenCalled();
    download.mockRestore();
  });
  it("downloads the chosen format with the server's filename", async () => {
    const saved: string[] = [];
    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download);
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/share")) return Response.json({ shared: false, created_at: null });
      return new Response(new Blob(["png-bytes"]), {
        headers: { "Content-Disposition": 'attachment; filename="master-plan.png"' },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderMenu();
    await userEvent.click(screen.getByRole("button", { name: "Image (PNG)" }));

    await waitFor(() => expect(saved).toEqual(["master-plan.png"]));
    const exportCall = fetchMock.mock.calls.find(([u]) => String(u).includes("/export"));
    // The label density rides along; "tidy" (one label per name) is the default.
    expect(String(exportCall![0])).toBe(`/api/v1/plans/${PLAN}/export?format=png&labels=tidy`);
    click.mockRestore();
  });

  it("warns that unsaved edits are not exported", () => {
    mockApi({ [`GET /plans/${PLAN}/share`]: { json: { shared: false, created_at: null } } });
    renderMenu(true);
    expect(screen.getByText(/unsaved changes are not included/i)).toBeInTheDocument();
  });

  it("creates a link, shows it once, and can stop sharing", async () => {
    let shared = false;
    const fetchMock = mockApi({
      [`GET /plans/${PLAN}/share`]: () => ({
        json: { shared, created_at: shared ? "2026-10-22T10:00:00Z" : null },
      }),
      [`POST /plans/${PLAN}/share`]: () => {
        shared = true;
        return { status: 201, json: { token: "secret-token", created_at: "2026-10-22T10:00:00Z" } };
      },
      [`DELETE /plans/${PLAN}/share`]: () => {
        shared = false;
        return { status: 204 };
      },
    });
    renderMenu();

    await userEvent.click(await screen.findByRole("button", { name: "Create link" }));
    const field = await screen.findByLabelText("Share link");
    expect(field).toHaveValue(`${window.location.origin}/shared/secret-token`);

    await userEvent.click(await screen.findByRole("button", { name: "Stop sharing" }));
    await waitFor(() => expect(screen.queryByLabelText("Share link")).not.toBeInTheDocument());
    expect(requestedRoutes(fetchMock)).toContain(`DELETE /plans/${PLAN}/share`);
    expect(await screen.findByRole("button", { name: "Create link" })).toBeInTheDocument();
  });

  it("shows API errors", async () => {
    mockApi({
      [`GET /plans/${PLAN}/share`]: problem(403, "You do not own this site"),
    });
    renderMenu();
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not own this site");
  });
});

describe("SharedPlanPage", () => {
  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={["/shared/tok en"]}>
        <Routes>
          <Route path="/shared/:token" element={<SharedPlanPage />} />
        </Routes>
      </MemoryRouter>,
    );

  it("embeds the public image and offers downloads, without any API call from the app", () => {
    renderPage();
    expect(screen.getByRole("img", { name: /plan with legend/i })).toHaveAttribute(
      "src",
      "/api/v1/shared/tok%20en/export?format=png&download=false",
    );
    expect(screen.getByRole("link", { name: "PDF" })).toHaveAttribute(
      "href",
      sharedExportUrl("tok en", "pdf"),
    );
  });

  it("explains a dead link when the image fails to load", async () => {
    renderPage();
    screen.getByRole("img").dispatchEvent(new Event("error"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer valid/i);
  });
});
