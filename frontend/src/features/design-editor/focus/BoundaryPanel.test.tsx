import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { site } from "../../../shared/testing/fixtures";
import { createBoundaryDraft } from "./boundaryDraft";
import { BoundaryPanel } from "./BoundaryPanel";

function setup() {
  const draft = createBoundaryDraft(site.boundary);
  const onContinue = vi.fn();
  render(
    <BoundaryPanel
      draft={draft}
      saving={false}
      error={null}
      onSave={vi.fn()}
      onContinue={onContinue}
    />,
  );
  return { draft, onContinue, user: userEvent.setup() };
}

describe("BoundaryPanel", () => {
  it("offers one prominent way on to the next step", async () => {
    const { onContinue, user } = setup();
    const next = screen.getByRole("button", { name: /Looks good → Sectors & terrain/ });
    expect(next).toHaveClass("btn--primary");
    expect(next).toBeEnabled();

    await user.click(next);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("keeps Save border secondary so there is a single primary action", () => {
    setup();
    expect(screen.getByRole("button", { name: "Save border" })).not.toHaveClass("btn--primary");
  });
});
