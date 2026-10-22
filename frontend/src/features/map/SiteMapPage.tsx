import { Link, useParams } from "react-router-dom";

import { useSite } from "../../entities/siteQueries";
import { useTerrain } from "../../entities/terrainQueries";
import { ApiError } from "../../shared/api/client";
import { formatArea } from "../../shared/format";
import { TerrainPanel } from "../terrain";
import { ImageryAttribution } from "./ImageryAttribution";
import { useImageryMeta } from "./imageryMeta";
import { LayerPanel } from "./LayerPanel";
import { MapView } from "./MapView";

export function SiteMapPage() {
  const { siteId = "" } = useParams();
  const site = useSite(siteId);
  const imagery = useImageryMeta(siteId);
  const terrain = useTerrain(siteId);

  if (site.isPending) return <p role="status">Loading site…</p>;

  if (site.isError) {
    const notFound = site.error instanceof ApiError && [403, 404].includes(site.error.status);
    return (
      <div role="alert" className="notice notice--error">
        <p>{notFound ? "This site was not found." : "Could not load this site."}</p>
        <Link to="/">Back to my sites</Link>
      </div>
    );
  }

  return (
    <section className="site-map">
      <header className="site-map__header">
        <Link to="/">← My sites</Link>
        <h1>{site.data.name}</h1>
        <span className="muted">{formatArea(site.data.area_m2)}</span>
        <Link className="btn btn--primary" to={`/sites/${site.data.id}/design`}>
          Design plans
        </Link>
      </header>
      {imagery.data && !imagery.data.covered ? (
        <p role="status" className="notice">
          Aerial imagery is not available for this location yet.
        </p>
      ) : null}
      <div className="site-map__canvas">
        <MapView site={site.data} imagery={imagery.data} terrain={terrain.data} />
        <div className="map-panels">
          <LayerPanel />
          <TerrainPanel siteId={site.data.id} />
        </div>
        <ImageryAttribution
          siteId={site.data.id}
          meta={imagery.data}
          isLoading={imagery.isPending}
          isError={imagery.isError}
        />
      </div>
    </section>
  );
}
