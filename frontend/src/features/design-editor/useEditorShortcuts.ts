import { useEffect, type RefObject } from "react";
import type { EditorStore } from "./store";
import type { BoundaryDraftStore } from "./focus/boundaryDraft";
import { isEditable, type FocusId } from "./focus/modes";

export function useEditorShortcuts(
  store: EditorStore,
  draft: BoundaryDraftStore,
  focus: FocusId,
  dirty: boolean,
  boundaryDirty: boolean,
  goalsDirty: boolean,
  savePending: boolean,
  boundaryPending: boolean,
  saveRef: RefObject<() => void>,
) {
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty || boundaryDirty || goalsDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const key = (event: KeyboardEvent) => {
      const typing =
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable || !!event.target.closest("input, textarea, select"));
      // Delete / Backspace removes the selected feature (not while typing; the border has its own
      // corner controls, so nothing is editable to delete in the boundary step).
      if (!typing && (event.key === "Delete" || event.key === "Backspace")) {
        const id = store.getState().selectedId;
        const feature = store.getState().document.features.find((f) => f.id === id);
        if (id && feature && isEditable(focus, feature) && !savePending) {
          event.preventDefault();
          store.getState().remove(id);
        }
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveRef.current?.();
        return;
      }
      if (
        savePending ||
        boundaryPending ||
        (event.target instanceof HTMLElement && event.target.closest("input, textarea, select"))
      )
        return;
      const history = focus === "boundary" ? draft.getState() : store.getState();
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) history.redo();
        else history.undo();
      }
      if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        history.redo();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("keydown", key);
    };
  }, [
    dirty,
    boundaryDirty,
    goalsDirty,
    savePending,
    boundaryPending,
    store,
    draft,
    focus,
    saveRef,
  ]);
}
