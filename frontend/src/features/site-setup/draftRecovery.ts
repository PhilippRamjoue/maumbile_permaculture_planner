import { useSetupStore } from "./store";

const key = (userId: string) => `maumbile.setup.${userId}`;
export function clearSetupDraft(userId: string) {
  try {
    sessionStorage.removeItem(key(userId));
  } catch {
    /* unavailable storage */
  }
}

export function restoreSetupDraft(userId: string): boolean {
  try {
    const raw = sessionStorage.getItem(key(userId));
    if (!raw) return false;
    const value = JSON.parse(raw);
    if (
      !Array.isArray(value.rows) ||
      value.rows.length > 1000 ||
      typeof value.name !== "string" ||
      !["country", "coordinates"].includes(value.step) ||
      !["lat-lng", "lng-lat"].includes(value.order) ||
      typeof value.countryCode !== "string" ||
      !/^[A-Z]{2}$/.test(value.countryCode)
    )
      return false;
    const rows: { lat: string; lng: string }[] = value.rows;
    if (
      !rows.every(
        (row) =>
          row &&
          typeof row.lat === "string" &&
          typeof row.lng === "string" &&
          row.lat.length < 100 &&
          row.lng.length < 100,
      )
    )
      return false;
    useSetupStore
      .getState()
      .restore({
        name: value.name.slice(0, 200),
        countryCode: value.countryCode,
        order: value.order,
        step: value.step,
        rows,
      });
    return rows.length > 0 || !!value.name;
  } catch {
    return false;
  }
}

export function persistSetupDraft(userId: string) {
  const { name, countryCode, order, rows, step } = useSetupStore.getState();
  if (!rows.length && !name) return clearSetupDraft(userId);
  try {
    sessionStorage.setItem(key(userId), JSON.stringify({ name, countryCode, order, rows, step }));
  } catch {
    /* The navigation/reload guard still protects drafts if storage is unavailable. */
  }
}

export function clearAllSetupDrafts() {
  useSetupStore.getState().reset();
  try {
    for (const storageKey of Object.keys(sessionStorage))
      if (storageKey.startsWith("maumbile.setup.")) sessionStorage.removeItem(storageKey);
  } catch {
    /* unavailable storage */
  }
}
