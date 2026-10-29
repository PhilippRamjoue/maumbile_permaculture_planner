import { effectiveProvider, useImageryChoice } from "../map/imageryChoice";
import { useImageryMeta, useImageryProviders } from "../map/imageryMeta";

/** Coverage changes invalidate stored choices; selecting the region default clears the override. */
export function useImageryBasemap(siteId: string) {
  const providers = useImageryProviders(siteId);
  const [choice, setChoice] = useImageryChoice(siteId);
  const selected = effectiveProvider(choice, providers.data);
  const imagery = useImageryMeta(siteId, selected);
  return {
    providers,
    selected,
    imagery,
    select: (key: string) => setChoice(key === providers.data?.default_key ? null : key),
  };
}
