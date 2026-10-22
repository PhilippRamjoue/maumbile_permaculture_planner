import { create } from "zustand";

import {
  cellError,
  cellToPoint,
  pointToCell,
  validateRing,
  type CoordinateCell,
  type CoordinateOrder,
  type LngLat,
  type RingValidation,
} from "./geometry";

export interface DraftRow extends CoordinateCell {
  id: number;
}

export type SetupStep = "country" | "coordinates";

interface SetupState {
  step: SetupStep;
  countryCode: string | null;
  name: string;
  /** Which number comes first in pasted text. */
  order: CoordinateOrder;
  rows: DraftRow[];

  setStep(step: SetupStep): void;
  setCountry(code: string | null): void;
  setName(name: string): void;
  setOrder(order: CoordinateOrder): void;
  /** Appends points. The map re-frames itself on any change to the entered points. */
  addPoints(points: LngLat[]): void;
  addEmptyRow(): void;
  updateRow(id: number, field: "lat" | "lng", value: string): void;
  removeRow(id: number): void;
  removeLastRow(): void;
  clearRows(): void;
  reset(initial?: { countryCode?: string | null }): void;
}

let nextRowId = 1;
const newRow = (cell: CoordinateCell): DraftRow => ({ id: nextRowId++, ...cell });

const initial = (countryCode: string | null = null) => ({
  step: "country" as SetupStep,
  countryCode,
  name: "",
  order: "lat-lng" as CoordinateOrder,
  rows: [] as DraftRow[],
});

/** Draft of the site being set up. Lives only while the setup page is open. */
export const useSetupStore = create<SetupState>((set) => ({
  ...initial(),
  setStep: (step) => set({ step }),
  setCountry: (countryCode) => set({ countryCode }),
  setName: (name) => set({ name }),
  setOrder: (order) => set({ order }),
  addPoints: (points) =>
    set((s) => ({ rows: [...s.rows, ...points.map((p) => newRow(pointToCell(p)))] })),
  addEmptyRow: () => set((s) => ({ rows: [...s.rows, newRow({ lat: "", lng: "" })] })),
  updateRow: (id, field, value) =>
    set((s) => ({ rows: s.rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)) })),
  removeRow: (id) => set((s) => ({ rows: s.rows.filter((r) => r.id !== id) })),
  removeLastRow: () => set((s) => ({ rows: s.rows.slice(0, -1) })),
  clearRows: () => set({ rows: [] }),
  reset: (init) => set(initial(init?.countryCode ?? null)),
}));

export interface DraftAnalysis {
  /** Every row that parses, in order. */
  points: LngLat[];
  /** Row id → what is wrong with that row's numbers. */
  rowErrors: Record<number, string>;
  validation: RingValidation;
}

/** Derives the usable points, per-row input errors and the ring verdict from the typed rows. */
export function analyseRows(rows: DraftRow[]): DraftAnalysis {
  const points: LngLat[] = [];
  const rowErrors: Record<number, string> = {};
  for (const row of rows) {
    const error = cellError(row);
    if (error) {
      // A row the user hasn't started filling yet is not worth shouting about.
      if (row.lat.trim() !== "" || row.lng.trim() !== "") rowErrors[row.id] = error;
      continue;
    }
    points.push(cellToPoint(row)!);
  }
  const validation = validateRing(points);
  if (Object.keys(rowErrors).length > 0 && validation.status === "valid") {
    return {
      points,
      rowErrors,
      validation: {
        ...validation,
        status: "invalid",
        messages: ["Fix the highlighted rows before creating the site."],
      },
    };
  }
  return { points, rowErrors, validation };
}
