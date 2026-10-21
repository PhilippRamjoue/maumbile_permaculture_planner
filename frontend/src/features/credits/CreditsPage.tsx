import { Link, useParams } from "react-router-dom";

import type { DataSource } from "../../entities/imagery";
import { useAllSources, useSiteSources } from "./queries";

const CATEGORY_LABELS: Record<string, string> = {
  imagery: "Aerial imagery",
  elevation: "Elevation",
};

function SourceCard({ source }: { source: DataSource }) {
  return (
    <li className="card source">
      <h3>{CATEGORY_LABELS[source.category] ?? source.category}</h3>
      <p className="source__attribution">{source.attribution}</p>
      <dl>
        <dt>License</dt>
        <dd>{source.license || "Not specified"}</dd>
        <dt>Terms</dt>
        <dd>
          {source.terms_url ? (
            <a href={source.terms_url} target="_blank" rel="noopener noreferrer">
              View terms
              <span className="visually-hidden"> for {source.key} (opens in a new tab)</span>
            </a>
          ) : (
            "Not available"
          )}
        </dd>
      </dl>
    </li>
  );
}

function SourceList({
  sources,
  isPending,
  isError,
}: {
  sources: DataSource[] | undefined;
  isPending: boolean;
  isError: boolean;
}) {
  if (isPending) return <p role="status">Loading data sources…</p>;
  if (isError || !sources) {
    return (
      <p role="alert" className="notice notice--error">
        Could not load the list of data sources.
      </p>
    );
  }
  if (sources.length === 0) return <p>No data sources are configured.</p>;
  return (
    <ul className="source-list">
      {sources.map((source) => (
        <SourceCard key={`${source.category}:${source.key}`} source={source} />
      ))}
    </ul>
  );
}

function SiteCredits({ siteId }: { siteId: string }) {
  const result = useSiteSources(siteId);
  return (
    <>
      <p>The sources used to build this site&apos;s map:</p>
      <SourceList {...result} />
      <p>
        <Link to="/credits">See every data source the app can use</Link>
      </p>
    </>
  );
}

function AllCredits() {
  const { data, isPending, isError } = useAllSources();
  return (
    <>
      <p>
        This is a free, non-commercial tool. We show the rights and credits of every source it can
        use, so you can verify them yourself.
      </p>
      <SourceList sources={data} isPending={isPending} isError={isError} />
    </>
  );
}

/** "Data sources & credits": per-site at `/sites/:siteId/credits`, platform-wide at `/credits`. */
export function CreditsPage() {
  const { siteId } = useParams();
  return (
    <section>
      <h1>Data sources &amp; credits</h1>
      {siteId ? <SiteCredits siteId={siteId} /> : <AllCredits />}
    </section>
  );
}
