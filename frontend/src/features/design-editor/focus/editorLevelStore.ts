import { safeLocalStorage } from "../../../shared/safeLocalStorage";
import type { EditorLevel } from "./modes";

/**
 * Remember whether the owner prefers the simple or guided editor, as a per-browser convenience.
 * localStorage can throw or be empty (private windows, cleared data), so every access is guarded and
 * the editor works the same without it.
 */
const KEY = "maumbile.editorLevel";

export function loadEditorLevel(): EditorLevel | null {
  const value = safeLocalStorage.get(KEY);
  return value === "simple" || value === "guided" ? value : null;
}

export function saveEditorLevel(level: EditorLevel): void {
  safeLocalStorage.set(KEY, level);
}
