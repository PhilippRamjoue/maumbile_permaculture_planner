import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Site } from "../../entities/site";
import type { Plan } from "../../entities/planning";
import { useSite } from "../../entities/siteQueries";
import { planningApi, planningKeys } from "./api";
import { errorMessage as message } from "./messages";
import { usePlans } from "./usePlans";
import { Workspace } from "./Workspace";

export function DesignEditorPage() {
  const { siteId = "", planId } = useParams();
  const site = useSite(siteId);
  if (site.isPending) return <p role="status">Loading site…</p>;
  if (site.isError) return <p role="alert">{message(site.error)}</p>;
  return planId ? (
    <PlanLoader key={planId} site={site.data} planId={planId} />
  ) : (
    <PlanPicker site={site.data} />
  );
}

function PlanPicker({ site }: { site: Site }) {
  const navigate = useNavigate();
  const [name, setName] = useState("My permaculture plan");
  const plans = usePlans(site.id);
  const create = useMutation({
    mutationFn: () => planningApi.create(site.id, name.trim()),
    onSuccess: (plan) => navigate(`/sites/${site.id}/design/${plan.id}`),
  });
  return (
    <section className="plans-page">
      <Link to={`/sites/${site.id}`}>← Site map</Link>
      <h1>Design plans for {site.name}</h1>
      <p>
        A plan is one design of this land. <strong>Open a plan to keep designing</strong>, or make a
        new one below — start with one, and add more later to compare ideas.
      </p>
      {plans.isPending && <p role="status">Loading plans…</p>}
      {plans.isError && <p role="alert">{message(plans.error)}</p>}
      {plans.data && (
        <ul className="plan-list">
          {plans.data.pages
            .flatMap((page) => page.items)
            .map((plan) => (
              <PlanRow key={plan.id} siteId={site.id} plan={plan} />
            ))}
        </ul>
      )}
      {plans.hasNextPage && (
        <button
          type="button"
          className="btn"
          disabled={plans.isFetchingNextPage}
          onClick={() => void plans.fetchNextPage()}
        >
          {plans.isFetchingNextPage ? "Loading…" : "Load more plans"}
        </button>
      )}
      {plans.data?.pages[0].total === 0 && <p>No plans yet. Create your first design below.</p>}
      <form
        className="card"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <h2>Create a plan</h2>
        <label>
          Plan name
          <input
            value={name}
            maxLength={200}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        <button className="btn btn--primary" disabled={!name.trim() || create.isPending}>
          {create.isPending ? "Creating…" : "Create plan"}
        </button>
        {create.isError && <p role="alert">{message(create.error)}</p>}
      </form>
    </section>
  );
}

/** One plan in the list: open it, rename it in place, or delete it. */
function PlanRow({ siteId, plan }: { siteId: string; plan: Plan }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(plan.name);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: planningKeys.plans(siteId) });
  const rename = useMutation({
    mutationFn: () => planningApi.rename(plan.id, name.trim()),
    onSuccess: () => {
      void invalidate();
      void queryClient.invalidateQueries({ queryKey: planningKeys.plan(plan.id) });
      setEditing(false);
    },
  });
  const remove = useMutation({
    mutationFn: () => planningApi.remove(plan.id),
    onSuccess: invalidate,
  });
  const busy = rename.isPending || remove.isPending;

  if (editing) {
    return (
      <li className="plan-row">
        <form
          className="plan-row__edit"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) rename.mutate();
          }}
        >
          <input
            aria-label="Plan name"
            value={name}
            maxLength={200}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" className="btn" disabled={!name.trim() || busy}>
            {rename.isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              setName(plan.name);
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </form>
        {rename.isError && <p role="alert">{message(rename.error)}</p>}
      </li>
    );
  }
  return (
    <li className="plan-row">
      <Link to={`/sites/${siteId}/design/${plan.id}`} className="plan-row__name">
        {plan.name}
      </Link>
      <span className="plan-row__actions">
        <button type="button" className="btn" disabled={busy} onClick={() => setEditing(true)}>
          Rename
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Delete the plan “${plan.name}”? This cannot be undone.`))
              remove.mutate();
          }}
        >
          {remove.isPending ? "Deleting…" : "Delete"}
        </button>
      </span>
      {remove.isError && <p role="alert">{message(remove.error)}</p>}
    </li>
  );
}

function PlanLoader({ site, planId }: { site: Site; planId: string }) {
  const design = useQuery({
    queryKey: planningKeys.design(planId),
    queryFn: () => planningApi.design(planId),
  });
  const types = useQuery({ queryKey: planningKeys.types, queryFn: planningApi.types });
  const error = design.error ?? types.error;
  if (error)
    return (
      <div role="alert">
        <p>{message(error)}</p>
        <Link to={`/sites/${site.id}/design`}>Back to plans</Link>
      </div>
    );
  if (!design.data || !types.data) return <p role="status">Loading design…</p>;
  if (design.data.plan.site_id !== site.id)
    return <p role="alert">This plan belongs to a different site.</p>;
  return (
    <Workspace
      site={site}
      plan={design.data.plan}
      initial={design.data.features}
      types={types.data}
    />
  );
}
