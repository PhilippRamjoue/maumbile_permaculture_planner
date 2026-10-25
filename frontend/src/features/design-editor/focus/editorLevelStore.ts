import type { EditorLevel } from "./modes";

/**
 * Remember whether the owner prefers the simple or guided editor, as a per-browser convenience.
 * localStorage can throw or be empty (private windows, cleared data), so every access is guarded and
 * the editor works the same without it.
 */
const KEY = "maumbile.editorLevel";

export function loadEditorLevel(): EditorLevel | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "simple" || value === "guided" ? value : null;
  } catch {
    return null;
  }
}

export function saveEditorLevel(level: EditorLevel): void {
  try {
    localStorage.setItem(KEY, level);
  } catch {
    /* ignore: the preference is a convenience, not required state */
  }
}
