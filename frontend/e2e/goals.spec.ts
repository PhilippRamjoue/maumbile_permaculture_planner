import { forceGuided, makePlan, makeSite, register, step } from "./helpers";
import { expect, test } from "./map-fixture";

test.skip(!process.env.E2E, "set E2E=1 with the stack running to enable");

// Goals are the optional first step of the editor: what the owner wants from the land. They are
// saved with the plan on the fly and are never a gate.

test("a new plan opens on Goals; goals autosave, survive a reload and are recalled in later steps, and are skippable", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await register(page, "goals");
  const site = await makeSite(page, "Goals plot");
  const planId = await makePlan(page, site.id, "Water first");
  const planUrl = `/api/v1/plans/${planId}`;

  // The editor opens simple (just place things); these assertions drive the full guided flow.
  await forceGuided(page);
  await page.goto(`/sites/${site.id}/design/${planId}`);
  await expect(step(page, "Goals")).toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("heading", { name: "What do I want from this land?" })).toBeVisible();
  expect((await (await page.request.get(planUrl)).json()).goals).toBeNull();

  // Water leads the list and is explained.
  await expect(page.locator("[data-goal]").first()).toHaveAttribute("data-goal", "water");
  await expect(page.getByText(/Water first:/)).toBeVisible();

  await page.locator("[data-goal=water]").click();
  await page.locator("[data-goal=food]").click();
  await expect(page.locator("[data-goal=water]")).toHaveAttribute("aria-pressed", "true");
  // Typing in the vision does not hold the save back until the field loses focus.
  await page.getByLabel("In your own words").fill("A shady family garden with fruit trees.");

  await expect
    .poll(async () => (await (await page.request.get(planUrl)).json()).goals, { timeout: 15_000 })
    .toEqual({
      priorities: ["water", "food"],
      vision: "A shady family garden with fruit trees.",
    });
  await expect(page.getByText("All changes saved")).toBeVisible();

  // Reopened with goals set, the plan moves on to the border; the later steps remind of the goals
  // and Edit brings them back.
  await page.reload();
  await expect(step(page, "Boundary")).toHaveAttribute("aria-current", "step");
  await expect(page.getByText(/Your goals: Water · Food/)).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(step(page, "Goals")).toHaveAttribute("aria-current", "step");
  await expect(page.locator("[data-goal=water]")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-goal=food]")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-goal=income]")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByLabel("In your own words")).toHaveValue(
    "A shady family garden with fruit trees.",
  );

  // Clearing everything leaves empty goals.
  await page.locator("[data-goal=water]").click();
  await page.locator("[data-goal=food]").click();
  await page.getByLabel("In your own words").fill("");
  await expect
    .poll(async () => (await (await page.request.get(planUrl)).json()).goals, { timeout: 15_000 })
    .toEqual({ priorities: [], vision: "" });

  // Goals are skippable: another plan without any opens on Goals too, but every other step is
  // reachable and nothing is saved.
  const otherId = await makePlan(page, site.id, "No goals yet");
  await page.goto(`/sites/${site.id}/design/${otherId}`);
  await expect(step(page, "Goals")).toHaveAttribute("aria-current", "step");
  await step(page, "Zones").click();
  await expect(step(page, "Zones")).toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("button", { name: "Draw zone", exact: true })).toBeVisible();
  await expect(page.getByText(/Your goals:/)).toHaveCount(0);
  // Nothing drawn yet, so there is nothing to save (the Save button only appears when there is).
  await expect(page.getByRole("button", { name: "Save design" })).toHaveCount(0);
  expect((await (await page.request.get(`/api/v1/plans/${otherId}`)).json()).goals).toBeNull();
});
