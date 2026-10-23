import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { PlanGoals } from "../../../entities/generated/plan";
import type { PlanDetail } from "../../../entities/planning";
import { planningApi, planningKeys } from "../api";
import { EMPTY_GOALS, goalsSignature, normaliseGoals } from "./goals";

/**
 * The plan's goals as editable state, saved on the fly like the rest of the design. They travel
 * on their own (`PATCH /plans/{id}`), so they never wait for, or block, the feature save.
 */
export function useGoals(plan: PlanDetail) {
  const queryClient = useQueryClient();
  const [goals, setGoals] = useState<PlanGoals>(() => plan.goals ?? EMPTY_GOALS);
  const [savedSignature, setSavedSignature] = useState(() => goalsSignature(plan.goals));
  const [failedSignature, setFailedSignature] = useState<string | null>(null);
  const signature = goalsSignature(goals);

  const mutation = useMutation({
    mutationFn: (snapshot: PlanGoals) => planningApi.updateGoals(plan.id, normaliseGoals(snapshot)),
    onSuccess: (updated, snapshot) => {
      setSavedSignature(goalsSignature(snapshot));
      setFailedSignature(null);
      queryClient.setQueryData<PlanDetail>(planningKeys.plan(plan.id), (old) =>
        old ? { ...old, goals: updated.goals } : old,
      );
    },
    onError: (_error, snapshot) => setFailedSignature(goalsSignature(snapshot)),
  });

  return {
    goals,
    setGoals,
    signature,
    dirty: signature !== savedSignature,
    saving: mutation.isPending,
    failed: mutation.isError && failedSignature === signature,
    error: mutation.error,
    failedSignature,
    save: () => mutation.mutate(goals),
  };
}
