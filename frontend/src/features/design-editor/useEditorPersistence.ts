import { useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "zustand";
import type { PlanDetail, SavedFeature } from "../../entities/planning";
import type { Site } from "../../entities/site";
import { siteKeys, sitesApi } from "../../entities/siteQueries";
import { terrainKeys } from "../../entities/terrainQueries";
import { imageryMetaKey, imageryProvidersKey } from "../map/imageryMeta";
import { createDesignWriter, persistDesign, planningKeys } from "./api";
import { signature, type EditorStore } from "./store";
import {
  draftCoordinates,
  isBoundaryDirty,
  validateDraft,
  type BoundaryDraftStore,
} from "./focus/boundaryDraft";
import { useGoals } from "./focus/useGoals";
import { useAutosave } from "./focus/useAutosave";
import type { Tool } from "./useEditorMap";

/** Owns all save domains and navigation protection; goals and features share one revision queue. */
export function useEditorPersistence(
  site: Site,
  plan: PlanDetail,
  store: EditorStore,
  draft: BoundaryDraftStore,
  tool: Tool,
  onMeasured: (feature: SavedFeature) => void,
) {
  const document = useStore(store, (state) => state.document);
  const savedSignature = useStore(store, (state) => state.savedSignature);
  const [writer] = useState(() => createDesignWriter(plan.id, plan.revision));
  const savedLayers = useRef(store.getInitialState().document.layers);
  const savedFeatures = useRef(store.getInitialState().document.features);
  const goals = useGoals(plan, writer);
  const liveGoalsSignature = useRef(goals.signature);
  liveGoalsSignature.current = goals.signature;
  const [failedSignature, setFailedSignature] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const currentSignature = signature(document);
  const dirty = currentSignature !== savedSignature;
  const save = useMutation({
    mutationFn: async () => {
      const snapshot = structuredClone(store.getState().document);
      try {
        return await persistDesign(
          writer,
          snapshot,
          store.getState().persistedIds,
          savedLayers.current,
          savedFeatures.current,
        );
      } catch (error) {
        setFailedSignature(signature(snapshot));
        throw error;
      }
    },
    onSuccess: ({ snapshot, result, layers, plan: updatedPlan }) => {
      savedLayers.current = layers;
      savedFeatures.current = snapshot.features;
      store.getState().markSaved(snapshot);
      queryClient.setQueryData(planningKeys.features(plan.id), result);
      queryClient.setQueryData(planningKeys.design(plan.id), {
        plan: updatedPlan,
        features: result,
      });
      queryClient.setQueryData<PlanDetail>(planningKeys.plan(plan.id), (old) => ({
        ...(old ?? plan),
        layers,
      }));
      const current = store.getState().selectedId;
      const feature = result.features.find((f) => f.id === current);
      if (feature) onMeasured(feature);
      setFailedSignature(null);
    },
  });

  const boundaryDirty = useStore(draft, isBoundaryDirty);
  const boundaryVertices = useStore(draft, (s) => s.vertices);
  const boundaryValid = validateDraft(boundaryVertices).status === "valid";
  const boundarySignature = JSON.stringify(boundaryVertices.map((vertex) => vertex.point));
  const [failedBoundarySignature, setFailedBoundarySignature] = useState<string | null>(null);
  const saveBoundary = useMutation({
    mutationFn: async () => {
      const vertices = draft.getState().vertices;
      try {
        return await sitesApi.update(site.id, {
          coordinates: draftCoordinates(vertices),
          expected_updated_at: site.updated_at,
        });
      } catch (error) {
        setFailedBoundarySignature(JSON.stringify(vertices.map((vertex) => vertex.point)));
        throw error;
      }
    },
    onSuccess: (updated) => {
      // The border is the Site: everything derived from it (terrain, imagery coverage) is stale.
      queryClient.setQueryData(siteKeys.detail(site.id), updated);
      void queryClient.invalidateQueries({ queryKey: terrainKeys.site(site.id) });
      void queryClient.invalidateQueries({ queryKey: imageryMetaKey(site.id) });
      void queryClient.invalidateQueries({ queryKey: imageryProvidersKey(site.id) });
      void queryClient.invalidateQueries({ queryKey: siteKeys.list() });
      draft.getState().reset(updated.boundary);
      setFailedBoundarySignature(null);
    },
  });
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (dirty ||
        save.isPending ||
        boundaryDirty ||
        saveBoundary.isPending ||
        goals.dirty ||
        goals.saving) &&
      currentLocation.pathname !== nextLocation.pathname,
  );
  const saveRef = useRef(() => {});
  saveRef.current = () => {
    if (!save.isPending && dirty) save.mutate();
    if (!saveBoundary.isPending && boundaryDirty && boundaryValid) saveBoundary.mutate();
    if (!goals.saving && goals.dirty) goals.save();
  };

  // Saved on the fly: shortly after the design stops changing, and on every change of focus.
  useAutosave({
    enabled: tool === "select" && !save.isPending && blocker.state !== "blocked",
    dirty,
    signature: currentSignature,
    failedSignature,
    save: () => save.mutate(),
  });

  useAutosave({
    enabled: !goals.saving && blocker.state !== "blocked",
    dirty: goals.dirty,
    signature: goals.signature,
    failedSignature: goals.failedSignature,
    save: goals.save,
    // Saving goals leaves the form enabled, so it may happen while the vision is being typed.
    waitWhileTyping: false,
  });

  useAutosave({
    enabled: boundaryValid && !saveBoundary.isPending && blocker.state !== "blocked",
    dirty: boundaryDirty,
    signature: boundarySignature,
    failedSignature: failedBoundarySignature,
    save: () => saveBoundary.mutate(),
  });

  const flush = async () => {
    const beforeFeatures = signature(store.getState().document);
    const beforeGoals = liveGoalsSignature.current;
    if (boundaryDirty && !boundaryValid)
      throw new Error("Fix the invalid border before saving or exporting.");
    if (save.isPending || saveBoundary.isPending || goals.saving)
      throw new Error("A save is still running. Please try again when it finishes.");
    await Promise.all([
      dirty ? save.mutateAsync() : Promise.resolve(),
      boundaryDirty ? saveBoundary.mutateAsync() : Promise.resolve(),
      goals.dirty ? goals.saveAsync() : Promise.resolve(),
    ]);
    if (
      beforeFeatures !== signature(store.getState().document) ||
      beforeGoals !== liveGoalsSignature.current
    )
      throw new Error("Your design changed while saving. Save again to include your latest edits.");
  };
  return {
    save,
    goals,
    dirty,
    currentSignature,
    failedSignature,
    boundaryDirty,
    boundaryValid,
    boundarySignature,
    failedBoundarySignature,
    saveBoundary,
    blocker,
    saveRef,
    flush,
  };
}
