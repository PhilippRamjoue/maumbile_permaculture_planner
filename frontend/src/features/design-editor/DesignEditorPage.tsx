import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Site } from "../../entities/site";
import { useSite } from "../../entities/siteQueries";
import { planningApi, planningKeys } from "./api";
import { errorMessage as message } from "./messages";
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
  const plans = useQuery({
    queryKey: planningKeys.plans(site.id),
    queryFn: () => planningApi.list(site.id),
  });
  const create = useMutation({
    mutationFn: () => planningApi.create(site.id, name.trim()),
    onSuccess: (plan) => navigate(`/sites/${site.id}/design/${plan.id}`),
  });
  return (
    <section className="plans-page">
      <Link to={`/sites/${site.id}`}>← Site map</Link>
      <h1>Design plans for {site.name}</h1>
      <p>Explore different designs for the same land. Each plan saves independently.</p>
      {plans.isPending && <p role="status">Loading plans…</p>}
      {plans.isError && <p role="alert">{message(plans.error)}</p>}
      {plans.data && (
        <ul>
          {plans.data.items.map((plan) => (
            <li key={plan.id}>
              <Link to={`/sites/${site.id}/design/${plan.id}`}>{plan.name}</Link>
            </li>
          ))}
        </ul>
      )}
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

function PlanLoader({ site, planId }: { site: Site; planId: string }) {
  const plan = useQuery({
    queryKey: planningKeys.plan(planId),
    queryFn: () => planningApi.get(planId),
  });
  const features = useQuery({
    queryKey: planningKeys.features(planId),
    queryFn: () => planningApi.features(planId),
  });
  const types = useQuery({ queryKey: planningKeys.types, queryFn: planningApi.types });
  const error = plan.error ?? features.error ?? types.error;
  if (error)
    return (
      <div role="alert">
        <p>{message(error)}</p>
        <Link to={`/sites/${site.id}/design`}>Back to plans</Link>
      </div>
    );
  if (!plan.data || !features.data || !types.data) return <p role="status">Loading design…</p>;
  if (plan.data.site_id !== site.id)
    return <p role="alert">This plan belongs to a different site.</p>;
  return <Workspace site={site} plan={plan.data} initial={features.data} types={types.data} />;
}
