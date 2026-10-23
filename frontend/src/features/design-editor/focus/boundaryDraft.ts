import { createStore } from "zustand/vanilla";

import type { GeoPolygon } from "../../../entities/site";
import { closeRing, openRing, validateRing, type LngLat } from "../../site-setup/geometry";
import type { BoundaryVertex } from "../../site-setup/map/vertexHit";

/** A boundary keeps at least a triangle; fewer corners is no longer a piece of land. */
export const MIN_CORNERS = 3;
const HISTORY_LIMIT = 100;

/** ~1 mm, like the site-setup flow, so a corner never visibly shifts once stored. */
const round = ([lng, lat]: LngLat): LngLat => [Number(lng.toFixed(8)), Number(lat.toFixed(8))];

let nextId = 1;
const toVertices = (boundary: GeoPolygon): BoundaryVertex[] =>
  openRing((boundary.coordinates[0] ?? []) as LngLat[]).map((point) => ({
    id: nextId++,
    point,
  }));

const pointsOf = (vertices: readonly BoundaryVertex[]) => vertices.map((v) => v.point);
const signatureOf = (vertices: readonly BoundaryVertex[]) => JSON.stringify(pointsOf(vertices));

export interface BoundaryDraftState {
  /** The corners being worked on, as an open ring in boundary order. */
  vertices: BoundaryVertex[];
  /** What the server has: the draft is dirty when `vertices` differs from it. */
  saved: BoundaryVertex[];
  selectedId: number | null;
  past: BoundaryVertex[][];
  future: BoundaryVertex[][];
  /** Names the drag in progress; all moves of one drag fold into one undo step. */
  editKey: string | null;
  select(id: number | null): void;
  move(id: number, point: LngLat, gesture: string): void;
  /** Adds a corner halfway between corner `id` and the next one, selects it, ready to be dragged. */
  insertAfter(id: number): void;
  deleteSelected(): void;
  /** Back to the saved corners (undoable). */
  discard(): void;
  undo(): void;
  redo(): void;
  /** The server accepted the current corners. */
  markSaved(): void;
  /** Discards the draft and starts over from `boundary` (also used after the site reloads). */
  reset(boundary: GeoPolygon): void;
}

/**
 * The site border while it is being adjusted in the Boundary focus. The border is the Site — a
 * separate record from the plan — so it is a draft here until saved with `PATCH /sites/{id}`;
 * everything else in the editor keeps reading the saved `site.boundary`.
 */
export function createBoundaryDraft(boundary: GeoPolygon) {
  const initial = toVertices(boundary);
  return createStore<BoundaryDraftState>((set, get) => {
    /** Applies a change to the corners and records the old value for undo (unless it continues `key`). */
    const edit = (vertices: BoundaryVertex[], key: string | null, selectedId: number | null) => {
      const s = get();
      const continuing = key !== null && key === s.editKey;
      set({
        vertices,
        selectedId: vertices.some((v) => v.id === selectedId) ? selectedId : null,
        past: continuing ? s.past : [...s.past, s.vertices].slice(-HISTORY_LIMIT),
        future: continuing ? s.future : [],
        editKey: key,
      });
    };
    return {
      vertices: initial,
      saved: initial,
      selectedId: null,
      past: [],
      future: [],
      editKey: null,
      select: (selectedId) =>
        set((s) => ({
          selectedId: s.vertices.some((v) => v.id === selectedId) ? selectedId : null,
        })),
      move(id, point, gesture) {
        const next = round(point);
        edit(
          get().vertices.map((v) => (v.id === id ? { ...v, point: next } : v)),
          gesture,
          id,
        );
      },
      insertAfter(id) {
        const { vertices } = get();
        const index = vertices.findIndex((v) => v.id === id);
        if (index < 0) return;
        const a = vertices[index].point;
        const b = vertices[(index + 1) % vertices.length].point;
        const added: BoundaryVertex = {
          id: nextId++,
          point: round([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]),
        };
        edit(
          [...vertices.slice(0, index + 1), added, ...vertices.slice(index + 1)],
          null,
          added.id,
        );
      },
      deleteSelected() {
        const { vertices, selectedId } = get();
        if (selectedId === null || vertices.length <= MIN_CORNERS) return;
        edit(
          vertices.filter((v) => v.id !== selectedId),
          null,
          null,
        );
      },
      undo() {
        const s = get();
        const vertices = s.past.at(-1);
        if (!vertices) return;
        set({
          vertices,
          past: s.past.slice(0, -1),
          future: [...s.future, s.vertices],
          editKey: null,
          selectedId: vertices.some((v) => v.id === s.selectedId) ? s.selectedId : null,
        });
      },
      redo() {
        const s = get();
        const vertices = s.future.at(-1);
        if (!vertices) return;
        set({
          vertices,
          past: [...s.past, s.vertices],
          future: s.future.slice(0, -1),
          editKey: null,
          selectedId: vertices.some((v) => v.id === s.selectedId) ? s.selectedId : null,
        });
      },
      discard: () => edit(get().saved, null, null),
      markSaved: () => set((s) => ({ saved: s.vertices, editKey: null })),
      reset(next) {
        const vertices = toVertices(next);
        set({
          vertices,
          saved: vertices,
          selectedId: null,
          past: [],
          future: [],
          editKey: null,
        });
      },
    };
  });
}
export type BoundaryDraftStore = ReturnType<typeof createBoundaryDraft>;

export const isBoundaryDirty = (s: Pick<BoundaryDraftState, "vertices" | "saved">) =>
  signatureOf(s.vertices) !== signatureOf(s.saved);

/** The same checks the server makes, for the corners as they are now. */
export const validateDraft = (vertices: readonly BoundaryVertex[]) =>
  validateRing(pointsOf(vertices));

/** The closed ring `PATCH /sites/{id}` expects. */
export const draftCoordinates = (vertices: readonly BoundaryVertex[]): LngLat[] =>
  closeRing(pointsOf(vertices));
