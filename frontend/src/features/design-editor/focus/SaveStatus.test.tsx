import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { PlacedNotice, SaveStatus, saveStateOf } from "./SaveStatus";

describe("saveStateOf", () => {
  it("puts a running save first, then a failure, then unsaved work", () => {
    expect(saveStateOf({ saving: true, dirty: true, failed: true })).toBe("saving");
    expect(saveStateOf({ saving: false, dirty: true, failed: true })).toBe("failed");
    expect(saveStateOf({ saving: false, dirty: true, failed: false })).toBe("unsaved");
    expect(saveStateOf({ saving: false, dirty: false, failed: false })).toBe("saved");
    expect(saveStateOf({ saving: false, dirty: true, failed: false, invalid: true })).toBe("invalid");
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

describe("PlacedNotice", () => {
  it("confirms the new feature and offers to place another or finish", async () => {
    const onAnother = vi.fn();
    const onDone = vi.fn();
    render(
      <PlacedNotice
        name="Tree"
        saveState="unsaved"
        anotherLabel="Place another tree"
        onAnother={onAnother}
        onDone={onDone}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Tree added");
    expect(screen.getByRole("status")).toHaveTextContent(/saved automatically/i);

    await userEvent.click(screen.getByRole("button", { name: "Place another tree" }));
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onAnother).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("says it is saved once it is", () => {
    render(
      <PlacedNotice
        name="Tree"
        saveState="saved"
        anotherLabel="x"
        onAnother={vi.fn()}
        onDone={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Saved to your design");
  });
});
