import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { PlanGoals } from "../../../entities/generated/plan";
import { GOAL_OPTIONS, goalsSignature, labelOf, normaliseGoals } from "./goals";
import { GoalsPanel, GoalsReminder } from "./GoalsPanel";

function Harness({ onContinue = vi.fn(), onChange = vi.fn() }) {
  const [goals, setGoals] = useState<PlanGoals>({ priorities: [], vision: "" });
  return (
    <GoalsPanel
      goals={goals}
      onChange={(next) => {
        onChange(next);
        setGoals(next);
      }}
      onContinue={onContinue}
    />
  );
}

describe("GoalsPanel", () => {
  it("offers every priority, with water first and explained", () => {
    render(<Harness />);
    const toggles = screen.getAllByRole("button", { pressed: false });
    expect(toggles).toHaveLength(GOAL_OPTIONS.length);
    expect(toggles[0]).toHaveTextContent("Water");
    expect(screen.getByText(/Water first/)).toBeInTheDocument();
  });

  it("toggles priorities and keeps the free text", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /Food/ }));
    await user.click(screen.getByRole("button", { name: /Water/ }));
    expect(screen.getByRole("button", { name: /Food/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /Food/ }));
    await user.type(screen.getByLabelText("In your own words"), "Shady");
    expect(onChange).toHaveBeenLastCalledWith({ priorities: ["water"], vision: "Shady" });
  });

  it("is skippable: continuing needs no input", async () => {
    const onContinue = vi.fn();
    const user = userEvent.setup();
    render(<Harness onContinue={onContinue} />);
    await user.click(screen.getByRole("button", { name: /Your boundary/ }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});

describe("goals helpers", () => {
  it("normalise to display order and treat missing goals as untouched", () => {
    expect(normaliseGoals({ priorities: ["food", "water"], vision: " hi " })).toEqual({
      priorities: ["water", "food"],
      vision: "hi",
    });
    expect(goalsSignature(null)).toBe(goalsSignature({ priorities: [], vision: "" }));
  });

  it("reminds of chosen goals only", () => {
    const { rerender } = render(
      <GoalsReminder goals={{ priorities: [], vision: "" }} labelOf={labelOf} onOpen={vi.fn()} />,
    );
    expect(screen.queryByText(/Your goals/)).toBeNull();
    rerender(
      <GoalsReminder
        goals={{ priorities: ["water", "food"], vision: "" }}
        labelOf={labelOf}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText(/Water · Food/)).toBeInTheDocument();
  });
});
