import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { planningApi, planningKeys } from "./api";
import { errorMessage } from "./messages";
import { usePlans } from "./usePlans";

/**
 * The plan switcher in the editor header: every plan of the site to jump between (a site can have
 * several designs to compare), and "Duplicate plan" to save the design on screen as a new one. The
 * editor's own leave guard still asks about unsaved work when switching; duplicating saves first.
 */
export function PlanSwitcher({
  siteId,
  planId,
  flush,
  disabled,
}: {
  siteId: string;
  planId: string;
  /** Saves whatever is pending; rejects when something cannot be saved. */
  flush(): Promise<void>;
  /** True while a save runs, so a copy never starts from half a save. */
  disabled: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const plans = usePlans(siteId);
  const [duplicating, setDuplicating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The switcher lists every plan, so keep fetching pages until there are no more.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = plans;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = plans.data?.pages.flatMap((page) => page.items) ?? [];
  const open = (id: string) => navigate(`/sites/${siteId}/design/${id}`);

  const duplicate = async () => {
    setError(null);
    setDuplicating(true);
    try {
      await flush();
      const copy = await planningApi.duplicate(planId);
      await queryClient.invalidateQueries({ queryKey: planningKeys.plans(siteId) });
      open(copy.id);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setDuplicating(false);
    }
  };

  return (
    <div className="plan-switcher">
      <label>
        <span className="visually-hidden">Switch plan</span>
        <select
          aria-label="Switch plan"
          value={planId}
          disabled={plans.isPending || items.length === 0}
          onChange={(event) => event.target.value !== planId && open(event.target.value)}
        >
          {/* The open plan is listed even before the list arrives, so the box is never blank. */}
          {!items.some((plan) => plan.id === planId) && <option value={planId}>This plan</option>}
          {items.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn"
        disabled={disabled || duplicating}
        title="Save this design as a new plan, to try a variation without losing this one"
        onClick={() => void duplicate()}
      >
        {duplicating ? "Duplicating…" : "Duplicate plan"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
