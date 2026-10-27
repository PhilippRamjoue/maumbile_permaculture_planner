import { afterEach, expect, it } from "vitest";
import { clearAllSetupDrafts, persistSetupDraft, restoreSetupDraft } from "./draftRecovery";
import { useSetupStore } from "./store";

afterEach(() => {
  useSetupStore.getState().reset();
  sessionStorage.clear();
});

it("recovers coordinates and name only for the same account", () => {
  const state = useSetupStore.getState();
  state.setCountry("KE");
  state.setStep("coordinates");
  state.setName("Garden");
  state.addPoints([
    [36.8, -1.2],
    [36.801, -1.2],
    [36.801, -1.201],
  ]);
  persistSetupDraft("owner");
  state.reset();
  expect(restoreSetupDraft("someone-else")).toBe(false);
  expect(restoreSetupDraft("owner")).toBe(true);
  expect(useSetupStore.getState().name).toBe("Garden");
  expect(useSetupStore.getState().rows).toHaveLength(3);
  state.addEmptyRow();
  expect(new Set(useSetupStore.getState().rows.map((row) => row.id)).size).toBe(4);
});

it("clears recovery data and the in-memory draft at sign-out", () => {
  const state = useSetupStore.getState();
  state.setCountry("KE");
  state.setName("Private draft");
  persistSetupDraft("owner");
  clearAllSetupDrafts();
  expect(restoreSetupDraft("owner")).toBe(false);
  expect(useSetupStore.getState().name).toBe("");
});

it("does not restore malformed or oversized coordinates", () => {
  sessionStorage.setItem(
    "maumbile.setup.owner",
    JSON.stringify({
      step: "coordinates",
      order: "lat-lng",
      countryCode: "KE",
      name: "bad",
      rows: [{ lat: {}, lng: "1" }],
    }),
  );
  expect(restoreSetupDraft("owner")).toBe(false);
});
