import { useEffect, useRef } from "react";

/** How long the design must sit unchanged before it is saved on its own. */
export const AUTOSAVE_DELAY_MS = 2000;

const isTyping = () => {
  const active = document.activeElement;
  return active instanceof HTMLElement && active.matches("input, textarea, select");
};

/**
 * Saves the design shortly after it stops changing, so work in one focus mode is stored (and
 * present in every other) without a Save click.
 *
 * It waits while a field has the keyboard — saving disables the form, which would pull the cursor
 * out of what is being typed — and it is idle while `enabled` is false (a shape half-drawn, a
 * save running). After a failed save it does not retry the same content on a timer: the visible
 * error offers a retry, and any further edit tries again.
 */
export function useAutosave({
  enabled,
  dirty,
  signature,
  failedSignature,
  save,
  delayMs = AUTOSAVE_DELAY_MS,
}: {
  enabled: boolean;
  dirty: boolean;
  /** Identifies the current content; the timer restarts whenever it changes. */
  signature: string;
  /** Content whose last save failed, if any. */
  failedSignature: string | null;
  save(): void;
  delayMs?: number;
}) {
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (!enabled || !dirty || signature === failedSignature) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (isTyping()) timer = setTimeout(tick, delayMs);
      else saveRef.current();
    };
    timer = setTimeout(tick, delayMs);
    return () => clearTimeout(timer);
  }, [enabled, dirty, signature, failedSignature, delayMs]);
}
