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

/** Deepest undo history; a boundary has a handful of corners, so this is effectively unlimited. */
const HISTORY_LIMIT = 100;

interface SetupState {
  step: SetupStep;
  countryCode: string | null;
  name: string;
  /** Which number comes first in pasted text. */
  order: CoordinateOrder;
  rows: DraftRow[];
  /**
   * A coordinate the user typed to find their land (step 1). The setup map opens there, close
   * enough to recognise the plot, until real corners exist to frame instead.
   */
  focusPoint: LngLat | null;
  /** The corner chosen on the map or in the table (delete / highlight target). */
  selectedRowId: number | null;
  /** Earlier values of `rows`, oldest first. */
  past: DraftRow[][];
  /** Values undone, most recently undone last. */
  future: DraftRow[][];
  /**
   * Names the edit in progress. Consecutive edits with the same key (every keystroke in one table
   * cell, every pointer move of one drag) fold into a single undo step.
   */
  editKey: string | null;

  setStep(step: SetupStep): void;
  setCountry(code: string | null): void;
  setFocusPoint(point: LngLat | null): void;
  setName(name: string): void;
  setOrder(order: CoordinateOrder): void;
  /** Appends points. The map re-frames itself on any change to the entered points. */
  addPoints(points: LngLat[]): void;
  addEmptyRow(): void;
  updateRow(id: number, field: "lat" | "lng", value: string): void;
  /**
   * Moves a corner (a map drag). Pass the same `gesture` for every move of one drag so the whole
   * drag is one undo step.
   */
  movePoint(id: number, point: LngLat, gesture: string): void;
  select(id: number | null): void;
  removeRow(id: number): void;
  deleteSelected(): void;
  clearRows(): void;
  undo(): void;
  redo(): void;
  reset(initial?: { countryCode?: string | null }): void;
  restore(draft: {
    name: string;
    countryCode: string;
    order: CoordinateOrder;
    step: SetupStep;
    rows: CoordinateCell[];
  }): void;
}

let nextRowId = 1;
const newRow = (cell: CoordinateCell): DraftRow => ({ id: nextRowId++, ...cell });

const initial = (countryCode: string | null = null) => ({
  step: "country" as SetupStep,
  countryCode,
  name: "",
  order: "lat-lng" as CoordinateOrder,
  rows: [] as DraftRow[],
  focusPoint: null as LngLat | null,
  selectedRowId: null as number | null,
  past: [] as DraftRow[][],
  future: [] as DraftRow[][],
  editKey: null as string | null,
});

type EditResult = Pick<SetupState, "rows" | "past" | "future" | "editKey" | "selectedRowId">;

/** Applies a change to `rows` and records the old value for undo (unless it continues `key`). */
function edit(
  s: SetupState,
  rows: DraftRow[],
  key: string | null = null,
  selectedRowId: number | null = s.selectedRowId,
): EditResult {
  const continuing = key !== null && key === s.editKey;
  return {
    rows,
    selectedRowId: rows.some((r) => r.id === selectedRowId) ? selectedRowId : null,
    past: continuing ? s.past : [...s.past, s.rows].slice(-HISTORY_LIMIT),
    future: continuing ? s.future : [],
    editKey: key,
  };
}

/** Draft of the site being set up. Lives only while the setup page is open. */
export const useSetupStore = create<SetupState>((set) => ({
  ...initial(),
  restore: (draft) =>
    set({ ...initial(draft.countryCode), ...draft, rows: draft.rows.map((row) => newRow(row)) }),
  setStep: (step) => set({ step }),
  setCountry: (countryCode) => set({ countryCode }),
  setFocusPoint: (focusPoint) => set({ focusPoint }),
  setName: (name) => set({ name }),
  setOrder: (order) => set({ order }),
  addPoints: (points) =>
    set((s) => edit(s, [...s.rows, ...points.map((p) => newRow(pointToCell(p)))])),
  addEmptyRow: () => set((s) => edit(s, [...s.rows, newRow({ lat: "", lng: "" })])),
  updateRow: (id, field, value) =>
    set((s) =>
      edit(
        s,
        s.rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
        `row:${id}`,
      ),
    ),
  movePoint: (id, point, gesture) =>
    set((s) =>
      edit(
        s,
        s.rows.map((r) => (r.id === id ? { ...r, ...pointToCell(point) } : r)),
        gesture,
      ),
    ),
  select: (selectedRowId) =>
    set((s) => ({
      selectedRowId: s.rows.some((r) => r.id === selectedRowId) ? selectedRowId : null,
    })),
  removeRow: (id) =>
    set((s) =>
      edit(
        s,
        s.rows.filter((r) => r.id !== id),
      ),
    ),
  deleteSelected: () =>
    set((s) =>
      s.selectedRowId === null
        ? s
        : edit(
            s,
            s.rows.filter((r) => r.id !== s.selectedRowId),
          ),
    ),
  clearRows: () => set((s) => edit(s, [])),
  undo: () =>
    set((s) => {
      const rows = s.past.at(-1);
      if (!rows) return s;
      return {
        rows,
        past: s.past.slice(0, -1),
        future: [...s.future, s.rows],
        editKey: null,
        selectedRowId: rows.some((r) => r.id === s.selectedRowId) ? s.selectedRowId : null,
      };
    }),
  redo: () =>
    set((s) => {
      const rows = s.future.at(-1);
      if (!rows) return s;
      return {
        rows,
        past: [...s.past, s.rows],
        future: s.future.slice(0, -1),
        editKey: null,
        selectedRowId: rows.some((r) => r.id === s.selectedRowId) ? s.selectedRowId : null,
      };
    }),
  reset: (init) => set(initial(init?.countryCode ?? null)),
}));

export interface DraftAnalysis {
  /** Every row that parses, in order. */
  points: LngLat[];
  /** The id of the row behind each entry of `points`. */
  pointRowIds: number[];
  /** Row id → what is wrong with that row's numbers. */
  rowErrors: Record<number, string>;
  validation: RingValidation;
}

/** Derives the usable points, per-row input errors and the ring verdict from the typed rows. */
export function analyseRows(rows: DraftRow[]): DraftAnalysis {
  const points: LngLat[] = [];
  const pointRowIds: number[] = [];
  const rowErrors: Record<number, string> = {};
  for (const row of rows) {
    const error = cellError(row);
    if (error) {
      // A row the user hasn't started filling yet is not worth shouting about.
      if (row.lat.trim() !== "" || row.lng.trim() !== "") rowErrors[row.id] = error;
      continue;
    }
    points.push(cellToPoint(row)!);
    pointRowIds.push(row.id);
  }
  const validation = validateRing(points);
  if (Object.keys(rowErrors).length > 0 && validation.status === "valid") {
    return {
      points,
      pointRowIds,
      rowErrors,
      validation: {
        ...validation,
        status: "invalid",
        messages: ["Fix the highlighted rows before creating the site."],
      },
    };
  }
  return { points, pointRowIds, rowErrors, validation };
}
