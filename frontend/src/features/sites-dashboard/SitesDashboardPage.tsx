import { Link } from "react-router-dom";

import { useSites } from "../../entities/siteQueries";
import type { Site } from "../../entities/site";
import { ApiError } from "../../shared/api/client";
import { formatArea, formatDate } from "../../shared/format";

function SiteCard({ site }: { site: Site }) {
  return (
    <li className="card site-card">
      <h2>{site.name}</h2>
      <p className="muted">
        {formatArea(site.area_m2)}
        {site.country_code ? ` · ${site.country_code.toUpperCase()}` : ""} · created{" "}
        {formatDate(site.created_at)}
      </p>
      <Link className="btn btn--primary" to={`/sites/${site.id}`} aria-label={`Open ${site.name}`}>
        Open map
      </Link>
    </li>
  );
}

export function SitesDashboardPage() {
  const { data, isPending, isError, error, refetch } = useSites();

  return (
    <section>
      <h1>My sites</h1>
      {isPending ? <p role="status">Loading your sites…</p> : null}
      {isError ? (
        <div role="alert" className="notice notice--error">
          <p>
            Could not load your sites
            {error instanceof ApiError ? `: ${error.userMessage}` : "."}
          </p>
          <button type="button" className="btn" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      ) : null}
      {data && data.items.length === 0 ? (
        <div className="card">
          <p>You have no sites yet.</p>
          <p className="muted">
            Creating a site from coordinates is coming in the next step of the app.
          </p>
        </div>
      ) : null}
      {data && data.items.length > 0 ? (
        <ul className="site-list">
          {data.items.map((site) => (
            <SiteCard key={site.id} site={site} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
