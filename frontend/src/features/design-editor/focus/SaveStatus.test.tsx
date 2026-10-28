import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { SaveStatus, saveStateOf } from "./SaveStatus";

describe("saveStateOf", () => {
  it("puts a running save first, then a failure, then unsaved work", () => {
    expect(saveStateOf({ saving: true, dirty: true, failed: true })).toBe("saving");
    expect(saveStateOf({ saving: false, dirty: true, failed: true })).toBe("failed");
    expect(saveStateOf({ saving: false, dirty: true, failed: false })).toBe("unsaved");
    expect(saveStateOf({ saving: false, dirty: false, failed: false })).toBe("saved");
    expect(saveStateOf({ saving: false, dirty: true, failed: false, invalid: true })).toBe(
      "invalid",
    );
  });
});

describe("SaveStatus", () => {
  const show = (state: Parameters<typeof SaveStatus>[0]["state"]) =>
    render(
      <MemoryRouter>
        <SaveStatus state={state} plansPath="/sites/s1/design" />
      </MemoryRouter>,
    );

  it("says everything is saved and how to come back to it", () => {
    show("saved");
    expect(screen.getByRole("status")).toHaveTextContent("All changes saved");
    expect(screen.getByText(/saves itself as you work/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Design plans" })).toHaveAttribute(
      "href",
      "/sites/s1/design",
    );
  });

  it.each([
    ["unsaved", /Unsaved changes — saving automatically/],
    ["saving", /Saving…/],
    ["failed", /Not saved yet/],
  ] as const)("shows the %s state", (state, text) => {
    show(state);
    expect(screen.getByRole("status")).toHaveTextContent(text);
  });
});
