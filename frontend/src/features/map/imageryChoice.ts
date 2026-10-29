import { useCallback, useState } from "react";

import type { ImageryProviders } from "../../entities/imagery";

const storageKey = (siteId: string) => `permaculture.imagery.provider.${siteId}`;

const read = (siteId: string): string | null => {
  try {
    return localStorage.getItem(storageKey(siteId));
  } catch {
    return null;
  }
};

const write = (siteId: string, key: string | null) => {
  try {
    if (key) localStorage.setItem(storageKey(siteId), key);
    else localStorage.removeItem(storageKey(siteId));
  } catch {
    /* the choice just is not remembered */
  }
};

/**
 * The satellite source a person picked for one site, remembered in this browser (the choice is
 * theirs and not part of the plan, so it is never saved to the server). `null` is "the region's
 * default", which is also what a site never touched has.
 */
export function useImageryChoice(siteId: string) {
  const [stored, setStored] = useState(() => read(siteId));
  const choose = useCallback(
    (key: string | null) => {
      write(siteId, key);
      setStored(key);
    },
    [siteId],
  );
  return [stored, choose] as const;
}

/**
 * The source to ask for: the stored one, unless it is the default anyway or no longer covers the
 * site (the border moved, say), in which case the default is used and nothing is asked for. Until
 * the list of sources has arrived the stored choice is trusted, so the map does not first load the
 * default imagery and then swap it.
 */
export function effectiveProvider(
  stored: string | null,
  providers: ImageryProviders | undefined,
): string | null {
  if (!stored) return null;
  if (!providers) return stored;
  if (stored === providers.default_key) return null;
  return providers.providers.some((p) => p.key === stored) ? stored : null;
}
