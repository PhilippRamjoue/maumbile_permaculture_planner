import { createStore } from "zustand/vanilla";
import type { DesignFeature, PlanLayer } from "../../entities/planning";

export interface EditorDocument {
  features: DesignFeature[];
  layers: PlanLayer[];
}
export const signature = (document: EditorDocument) => JSON.stringify(document);
const clone = <T>(value: T): T => structuredClone(value);

export interface EditorState {
  document: EditorDocument;
  past: EditorDocument[];
  future: EditorDocument[];
  savedSignature: string;
  persistedIds: string[];
  selectedId: string | null;
  commit(document: EditorDocument): void;
  select(id: string | null): void;
  upsert(feature: DesignFeature): void;
  remove(id: string): void;
  undo(): void;
  redo(): void;
  markSaved(document: EditorDocument): void;
}

export function createEditorStore(initial: EditorDocument) {
  return createStore<EditorState>((set, get) => ({
    document: clone(initial),
    past: [],
    future: [],
    selectedId: null,
    savedSignature: signature(initial),
    persistedIds: initial.features.map((f) => f.id),
    commit(document) {
      const current = get();
      if (signature(document) === signature(current.document)) return;
      set({
        document: clone(document),
        past: [...current.past.slice(-99), clone(current.document)],
        future: [],
      });
    },
    select: (selectedId) => set({ selectedId }),
    upsert(feature) {
      const { document } = get();
      const exists = document.features.some((f) => f.id === feature.id);
      get().commit({
        ...document,
        features: exists
          ? document.features.map((f) => (f.id === feature.id ? feature : f))
          : [...document.features, feature],
      });
      set({ selectedId: feature.id });
    },
    remove(id) {
      const { document } = get();
      get().commit({ ...document, features: document.features.filter((f) => f.id !== id) });
      set({ selectedId: null });
    },
    undo() {
      const current = get();
      const previous = current.past.at(-1);
      if (previous)
        set({
          document: previous,
          past: current.past.slice(0, -1),
          future: [current.document, ...current.future],
          selectedId: null,
        });
    },
    redo() {
      const current = get();
      const next = current.future[0];
      if (next)
        set({
          document: next,
          past: [...current.past, current.document],
          future: current.future.slice(1),
          selectedId: null,
        });
    },
    markSaved(document) {
      set({
        savedSignature: signature(document),
        persistedIds: document.features.map((f) => f.id),
      });
    },
  }));
}
export type EditorStore = ReturnType<typeof createEditorStore>;

export function savePayload(document: EditorDocument, persistedIds: string[]) {
  const ids = new Set(document.features.map((f) => f.id));
  return { features: document.features, deletedIds: persistedIds.filter((id) => !ids.has(id)) };
}
