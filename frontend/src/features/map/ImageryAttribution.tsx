import { Link } from "react-router-dom";

import type { ImageryMeta } from "../../entities/imagery";

interface ImageryAttributionProps {
  siteId: string;
  meta: ImageryMeta | undefined;
  isLoading: boolean;
  isError: boolean;
}

/**
 * The always-on attribution control. It is rendered unconditionally over the map (never collapsed
 * or hidden) so the active provider's credit line is visible whatever state the request is in,
 * with a link to the full "Data sources & credits" page.
 */
export function ImageryAttribution({ siteId, meta, isLoading, isError }: ImageryAttributionProps) {
  let credit: string;
  if (meta) credit = meta.attribution;
  else if (isLoading) credit = "Loading imagery credits…";
  else if (isError) credit = "Imagery credits unavailable";
  else credit = "";

  return (
    <div className="map-attribution" role="contentinfo" aria-label="Map attribution">
      {credit ? <span className="map-attribution__credit">{credit}</span> : null}
      <Link to={`/sites/${encodeURIComponent(siteId)}/credits`}>Data sources &amp; credits</Link>
    </div>
  );
}
