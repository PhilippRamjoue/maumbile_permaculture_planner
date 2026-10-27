import { Link } from "react-router-dom";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { siteKeys, sitesApi, useSites } from "../../entities/siteQueries";
import type { Site } from "../../entities/site";
import { ApiError } from "../../shared/api/client";
import { formatArea, formatDate } from "../../shared/format";

function SiteCard({ site }: { site: Site }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(site.name);
  const rename = useMutation({
    mutationFn: () =>
      sitesApi.update(site.id, { name: name.trim(), expected_updated_at: site.updated_at }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: siteKeys.all }),
  });
  const remove = useMutation({
    mutationFn: () => sitesApi.remove(site.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: siteKeys.all }),
  });
  const error = rename.error ?? remove.error;
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
      <details>
        <summary>Site settings</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) rename.mutate();
          }}
        >
          <label>
            Site name
            <input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} />
          </label>
          <button className="btn" disabled={!name.trim() || rename.isPending || remove.isPending}>
            Save name
          </button>
          <button
            type="button"
            className="btn"
            disabled={remove.isPending || rename.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Delete site “${site.name}” and all its plans? It will disappear from your account. Contact the operator if you need it restored.`,
                )
              )
                remove.mutate();
            }}
          >
            Delete site and plans
          </button>
        </form>
        {error && (
          <p role="alert">
            {error instanceof ApiError
              ? error.userMessage
              : "Could not update this site. Try again."}
          </p>
        )}
      </details>
    </li>
  );
}

export function SitesDashboardPage() {
  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useSites();

  return (
    <section>
      <header className="page-header">
        <h1>My sites</h1>
        <Link className="btn btn--primary" to="/sites/new">
          New site
        </Link>
      </header>
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
      {hasNextPage && (
        <button
          type="button"
          className="btn"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? "Loading…" : "Load more sites"}
        </button>
      )}
      {data && data.items.length === 0 ? (
        <div className="card">
          <p>You have no sites yet.</p>
          <p className="muted">Pick your country and outline your land to get started.</p>
          <Link className="btn btn--primary" to="/sites/new">
            Create your first site
          </Link>
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
