import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "zustand";
import type { Map as MapLibreMap } from "maplibre-gl";
import type {
  DesignFeature,
  ElementType,
  FeatureCollection,
  PlanDetail,
  SavedFeature,
} from "../../entities/planning";
import type { Site } from "../../entities/site";
import { SITE_BOUNDARY_LAYER_ID } from "../map/layers/siteBoundaryLayer";
import { imageryMetaKey, imageryProvidersKey } from "../map/imageryMeta";
import { useMapLayerStore } from "../map/store";
import { siteKeys, sitesApi } from "../../entities/siteQueries";
import { terrainKeys, useTerrain } from "../../entities/terrainQueries";
import { ExportMenu } from "../export";
import { TerrainControl } from "../terrain";
import { glyphFor } from "./icons";
import { buildLegend } from "./legend";
import { MapLegend } from "./MapLegend";
import { MAX_FIT_ZOOM } from "../map/layers/zoomLimits";
import { MapView } from "../map/MapView";
import { GRID_LAYER_ID, gridStepFor } from "../map/layers/gridLayer";
import { useViewportBounds } from "../map/useViewportBounds";
import { ZoomToBoundaryButton } from "../map/ZoomToBoundaryButton";
import { ImageryAttribution } from "../map/ImageryAttribution";
import { effectiveProvider, useImageryChoice } from "../map/imageryChoice";
import { useImageryMeta, useImageryProviders } from "../map/imageryMeta";
import { createDesignWriter, persistDesign, planningApi, planningKeys } from "./api";
import { saveBlob } from "../export/api";
import { ModalDialog } from "../../shared/ui/ModalDialog";
import { isParametricSector, type SectorKind } from "./sectors";
import { createEditorStore, signature } from "./store";
import { formatArea, formatLength } from "../../shared/format";
import { measureGeometry, type Measurement } from "./measure";
import { useEditorMap, type Tool } from "./useEditorMap";
import { useSectorHandles } from "./useSectorHandles";
import { CompassControl } from "./CompassControl";
import { MapToolsControl } from "./MapToolsControl";
import { PlanSwitcher } from "./PlanSwitcher";
import { HistoryButtons } from "./focus/AdvancedTools";
import { BasemapSwitcher } from "./BasemapSwitcher";
import { LayersControl } from "./LayersControl";
import { BoundaryPanel } from "./focus/BoundaryPanel";
import { MeasurementPanel } from "./focus/MeasurementPanel";
import { editorLayerRegistry } from "./focus/boundaryLayer";
import {
  createBoundaryDraft,
  draftCoordinates,
  isBoundaryDirty,
  validateDraft,
} from "./focus/boundaryDraft";
import type { PanelProps } from "./focus/common";
import { ElementsPanel } from "./focus/ElementsPanel";
import { labelOf } from "./focus/goals";
import { GoalsPanel, GoalsReminder } from "./focus/GoalsPanel";
import { useGoals } from "./focus/useGoals";
import { FocusRail } from "./focus/FocusRail";
import { FunctionsPanel } from "./focus/FunctionsPanel";
import { connectionLines } from "./focus/functions";
import {
  focusMode,
  initialFocus,
  initialLevel,
  isEditable,
  parseFocus,
  progressOf,
  SIMPLE_FOCUS,
  type ContextGroup,
  type EditorLevel,
  type FocusId,
} from "./focus/modes";
import { loadEditorLevel, saveEditorLevel } from "./focus/editorLevelStore";
import { SaveStatus, saveStateOf } from "./focus/SaveStatus";
import { SectorsPanel } from "./focus/SectorsPanel";
import { useAutosave } from "./focus/useAutosave";
import { useBoundaryEditing } from "./focus/useBoundaryEditing";
import { createFocusView } from "./focus/view";
import { ZonesPanel } from "./focus/ZonesPanel";
import { errorMessage as message } from "./messages";

const editable = (f: SavedFeature): DesignFeature => ({
  type: "Feature",
  id: f.id,
  layer_id: f.layer_id,
  feature_type: f.feature_type,
  element_type_id: f.element_type_id,
  geometry: f.geometry,
  properties: f.properties,
});

const layerNameFor = (tool: Tool) =>
  tool === "zone"
    ? "Zones"
    : tool === "sector" || tool === "sector-rect"
      ? "Sectors"
      : tool === "path"
        ? "Paths"
        : "Elements";

const EMPTY_GROUPS: ReadonlySet<ContextGroup> = new Set();

const HINTS: Record<FocusId, string> = {
  goals: "Your land is shown for reference — goals do not need the map",
  boundary: "Drag a corner of the yellow border to adjust it",
  sectors: "Add sectors from bearings, or draw one by hand",
  zones: "Draw a zone on the map",
  elements: "Place elements and paths on the map",
  functions: "Pick an element to say what it needs and gives",
};

/**
 * The guided design editor for one plan: a focus rail over one saved design. Switching focus only
 * changes what is editable and what is faint context; the plan is loaded once and saved on the
 * fly, so work in one step is already there in every other.
 */
export function Workspace({
  site,
  plan,
  initial,
  types,
}: {
  site: Site;
  plan: PlanDetail;
  initial: FeatureCollection;
  types: ElementType[];
}) {
  const [store] = useState(() =>
    createEditorStore({ layers: plan.layers, features: initial.features.map(editable) }),
  );
  const [draft] = useState(() => createBoundaryDraft(site.boundary));
  const state = useStore(store);
  const [defaultFocus] = useState(() =>
    initialFocus({ layers: plan.layers, features: initial.features }, plan.goals),
  );
  const [writer] = useState(() => createDesignWriter(plan.id, plan.revision));
  const savedLayers = useRef(plan.layers);
  const savedFeatures = useRef(initial.features.map(editable));
  const goals = useGoals(plan, writer);
  const liveGoalsSignature = useRef(goals.signature);
  liveGoalsSignature.current = goals.signature;
  const [params, setParams] = useSearchParams();
  // Simple vs guided: new/elements-only plans open simple (straight to placing things); a plan with
  // goals/sectors/zones opens guided. A remembered choice wins. In simple mode the only step is
  // elements, so the focus is pinned there whatever the URL says.
  const [level, setLevelState] = useState<EditorLevel>(
    () => loadEditorLevel() ?? initialLevel(initial.features, plan.goals),
  );
  const setLevel = (next: EditorLevel) => {
    setLevelState(next);
    saveEditorLevel(next);
  };
  const focus =
    level === "simple" ? SIMPLE_FOCUS : (parseFocus(params.get("focus")) ?? defaultFocus);
  const mode = focusMode(focus);

  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [elementId, setElementId] = useState(
    types.find((t) => t.key === "tree")?.id ?? types[0]?.id,
  );
  const [activeLayer, setActiveLayer] = useState(
    plan.layers.find((l) => l.name === "Elements")?.id ?? plan.layers[0]?.id ?? "",
  );
  const [zoneNumber, setZoneNumber] = useState(1);
  // The sector kind the add tools create: shared by the panel's chooser and the draw tools.
  const [sectorKind, setSectorKind] = useState<SectorKind>("sun");
  // Other feature families are always shown as faint context now; their visibility (and that of the
  // boundary) is controlled from the Layers map control instead of per-step toggles.
  const hidden: ReadonlySet<ContextGroup> = EMPTY_GROUPS;
  const [hiddenSectorKinds, setHiddenSectorKinds] = useState<ReadonlySet<SectorKind>>(
    () => new Set(),
  );
  const [failedSignature, setFailedSignature] = useState<string | null>(null);
  const [authoritative, setAuthoritative] = useState<{ key: string; value: Measurement } | null>(
    null,
  );
  const imageryProviders = useImageryProviders(site.id);
  const [imageryChoice, setImageryChoice] = useImageryChoice(site.id);
  const imageryProvider = effectiveProvider(imageryChoice, imageryProviders.data);
  const imagery = useImageryMeta(site.id, imageryProvider);
  const terrain = useTerrain(site.id);
  const sectorsLayer = state.document.layers.find((l) => l.name === "Sectors" && l.visible);
  const queryClient = useQueryClient();
  const currentSignature = signature(state.document);
  const dirty = currentSignature !== state.savedSignature;

  const features = state.document.features;
  const own = useMemo(() => features.filter((f) => isEditable(focus, f)), [features, focus]);
  const selectedAny = features.find((f) => f.id === state.selectedId);
  // A selection from another focus is not editable here; it stays selected only where it belongs.
  const selected = selectedAny && isEditable(focus, selectedAny) ? selectedAny : undefined;
  const selectedGeometryKey = selected ? JSON.stringify(selected.geometry) : "";

  const connections = useMemo(
    () => (focus === "functions" ? connectionLines(selected, own) : []),
    [focus, selected, own],
  );
  const iconOf = useCallback(
    (feature: DesignFeature) => {
      const icon = types.find((t) => t.id === feature.element_type_id)?.icon;
      return glyphFor(icon) ? icon! : null;
    },
    [types],
  );
  const view = useMemo(
    () => createFocusView(focus, hidden, connections, zoneNumber, hiddenSectorKinds, iconOf),
    [focus, hidden, connections, zoneNumber, hiddenSectorKinds, iconOf],
  );
  // Re-adding the border layer restacks the registry layers over the design layers; the editor
  // map effect re-adds the design layers when this changes.
  const legend = useMemo(
    () => buildLegend(features, types, state.document.layers, view.isShown),
    [features, types, state.document.layers, view],
  );
  // The optional distance grid: only tracked and drawn while switched on (and never saved).
  const [gridOn, setGridOn] = useState(false);
  // The optional compass rose: a view aid like the grid, also never saved.
  const [compassOn, setCompassOn] = useState(false);
  const viewport = useViewportBounds(map, gridOn);
  const gridStep = viewport ? gridStepFor(viewport, [site.bbox[0], site.bbox[1]]) : null;
  const overlays = useMemo(
    () => ({ terrain: terrain.data, border: focus === "boundary", grid: viewport !== null }),
    [terrain.data, focus, viewport],
  );

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
      if (feature) setAuthoritative({ key: JSON.stringify(feature.geometry), value: feature });
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
  const boundaryUi = useBoundaryEditing(map, focus === "boundary", draft, saveBoundary.isPending);
  const layerUi = useMemo(
    () => (viewport ? { ...boundaryUi, [GRID_LAYER_ID]: { bounds: viewport } } : boundaryUi),
    [boundaryUi, viewport],
  );

  // Open framed on the land. MapView sets its initial bounds at construction, but the canvas can
  // still be laying out then, which leaves the map at world zoom; resizing and fitting once, as
  // soon as the map is ready, guarantees the editor opens on the site instead of the whole globe.
  const framed = useRef(false);
  useEffect(() => {
    if (!map || framed.current) return;
    framed.current = true;
    map.resize();
    map.fitBounds(site.bbox, { padding: 48, maxZoom: MAX_FIT_ZOOM, duration: 0 });
  }, [map, site.bbox]);

  // Drawing a feature ends on the select tool with the new feature already selected for editing.
  const finishTool = useCallback((next: Tool) => setTool(next), []);
  const drawing = useEditorMap(
    map,
    store,
    tool,
    types.find((t) => t.id === elementId),
    activeLayer,
    save.isPending,
    finishTool,
    imagery.data,
    overlays,
    site.boundary,
    view,
    sectorKind,
  );
  // Drag handles for the selected parametric sector (move / open / resize), only in the Sectors step.
  useSectorHandles(map, store, focus === "sectors" && !save.isPending);
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
  const [leaveError, setLeaveError] = useState<string | null>(null);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty || boundaryDirty || goals.dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const key = (event: KeyboardEvent) => {
      const typing =
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable || !!event.target.closest("input, textarea, select"));
      // Delete / Backspace removes the selected feature (not while typing; the border has its own
      // corner controls, so nothing is editable to delete in the boundary step).
      if (!typing && (event.key === "Delete" || event.key === "Backspace")) {
        const id = store.getState().selectedId;
        const feature = store.getState().document.features.find((f) => f.id === id);
        if (id && feature && isEditable(focus, feature) && !save.isPending) {
          event.preventDefault();
          store.getState().remove(id);
        }
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveRef.current();
        return;
      }
      if (
        save.isPending ||
        saveBoundary.isPending ||
        (event.target instanceof HTMLElement && event.target.closest("input, textarea, select"))
      )
        return;
      const history = focus === "boundary" ? draft.getState() : store.getState();
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) history.redo();
        else history.undo();
      }
      if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        history.redo();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("keydown", key);
    };
  }, [
    dirty,
    boundaryDirty,
    goals.dirty,
    save.isPending,
    saveBoundary.isPending,
    store,
    draft,
    focus,
  ]);

  // The site border is a registry layer; "show the boundary as context" is its visibility.
  const boundaryShown = focus === "boundary" || !hidden.has("boundary");
  const setLayerVisible = useMapLayerStore((s) => s.setVisible);
  useEffect(() => {
    setLayerVisible(SITE_BOUNDARY_LAYER_ID, boundaryShown);
  }, [boundaryShown, setLayerVisible]);
  useEffect(() => () => setLayerVisible(SITE_BOUNDARY_LAYER_ID, true), [setLayerVisible]);

  const choose = (next: Tool) => {
    if (next !== "select" && !next.startsWith("measure") && !mode.tools.includes(next as never))
      return;
    setTool(next);
    store.getState().select(null);
    const layer = state.document.layers.find((l) => l.name === layerNameFor(next) && l.visible);
    if (layer) setActiveLayer(layer.id);
  };
  const pick = (id: string) => {
    setTool("select");
    store.getState().select(id);
  };

  const go = (next: FocusId) => {
    if (next === focus) return;
    // Leaving the border saves it, if it is a valid piece of land.
    if (focus === "boundary" && boundaryDirty && boundaryValid && !saveBoundary.isPending) {
      saveBoundary.mutate();
    }
    if (dirty && !save.isPending) save.mutate();
    if (goals.dirty && !goals.saving) goals.save();
    setTool("select");
    store.getState().select(null);
    setParams(
      (previous) => {
        const nextParams = new URLSearchParams(previous);
        nextParams.set("focus", next);
        return nextParams;
      },
      { preventScrollReset: true },
    );
  };

  // Switch between the simple (place-things-only) and full guided editor. Going guided reveals the
  // step rail on the elements step, so nobody is dropped back onto goals; going simple pins to it.
  const showGuided = () => {
    setLevel("guided");
    store.getState().select(null);
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set("focus", "elements");
        return next;
      },
      { preventScrollReset: true },
    );
  };
  const showSimple = () => {
    saveRef.current();
    setLevel("simple");
    store.getState().select(null);
    setTool("select");
  };
  // Quick jump to the land boundary from any step (even simple mode), so changing the border and
  // recomputing slope is never buried. The boundary step lives in the guided view, so reveal it.
  const editBoundary = () => {
    if (level !== "guided") setLevel("guided");
    go("boundary");
  };

  const measurement =
    authoritative?.key === selectedGeometryKey
      ? authoritative.value
      : selected
        ? measureGeometry(selected.geometry)
        : drawing.live;
  const confirmMeasurement = useMutation({
    mutationFn: async (feature: DesignFeature) => ({
      key: JSON.stringify(feature.geometry),
      value: await planningApi.measure(feature.geometry),
    }),
    onSuccess: setAuthoritative,
  });

  const disabled = save.isPending || !map;
  const panel: PanelProps = {
    state,
    tool,
    choose,
    pick,
    disabled,
    selected,
    onRotate: drawing.rotate,
  };
  const progress = progressOf(state.document, goals.goals);
  const saveState = saveStateOf({
    saving: save.isPending || saveBoundary.isPending || goals.saving,
    dirty: dirty || boundaryDirty || goals.dirty,
    invalid: boundaryDirty && !boundaryValid,
    failed:
      (save.isError && failedSignature === currentSignature) ||
      goals.failed ||
      (saveBoundary.isError && failedBoundarySignature === boundarySignature),
  });
  const live = drawing.live;
  // Once a feature is picked, the hint explains how to edit and remove it (right-click a point to
  // drop it, Delete to remove the whole shape) — a wedge is reshaped from the panel instead.
  const selectHint = selected
    ? selected.geometry.type === "Point"
      ? "Drag to move it · press Delete to remove it"
      : isParametricSector(selected)
        ? "Drag the dots to move, open or resize it · or reshape it from the panel · Delete removes it"
        : "Drag a point to move it · right-click a point to remove it · Delete removes the whole shape"
    : HINTS[focus];
  const hint = tool.startsWith("measure")
    ? live && live.length_m > 0
      ? tool === "measure-area"
        ? `${formatArea(live.area_m2)} · ${formatLength(live.length_m)} around — not saved · Esc to clear`
        : `${formatLength(live.length_m)} — not saved · Esc to clear`
      : "Click points on the map to measure — nothing is saved"
    : tool === "select"
      ? selectHint
      : tool === "sector-rect"
        ? "Click one corner, then the opposite corner, to draw a rectangle sector"
        : "Draw on the map to add a feature";

  return (
    <section className="design-editor">
      <header className="editor-header">
        <Link to={`/sites/${site.id}/design`}>← Plans</Link>
        <h1>{plan.name}</h1>
        <PlanSwitcher
          siteId={site.id}
          planId={plan.id}
          flush={flush}
          disabled={save.isPending || saveBoundary.isPending || goals.saving}
        />
        <span>{site.name}</span>
        <ExportMenu
          planId={plan.id}
          unsaved={dirty || boundaryDirty || goals.dirty}
          busy={save.isPending || saveBoundary.isPending || goals.saving}
          beforeDownload={flush}
        />
        {/* The design autosaves, so a Save button appears only when there is actually something to
            save (briefly) or a failed save to retry — otherwise the status says it is all saved. */}
        {(saveState === "unsaved" || saveState === "failed") && (
          <button
            className="btn btn--primary"
            onClick={() => {
              setTool("select");
              saveRef.current();
            }}
          >
            {saveState === "failed" ? "Retry save" : "Save design"}
          </button>
        )}
        <SaveStatus state={saveState} plansPath={`/sites/${site.id}/design`} />
      </header>
      <div className="editor-level-switch" role="group" aria-label="How much detail">
        <span className="editor-level-switch__label">Mode</span>
        <button
          type="button"
          className="editor-level-switch__btn"
          aria-pressed={level === "simple"}
          onClick={showSimple}
        >
          Simple
        </button>
        <button
          type="button"
          className="editor-level-switch__btn"
          aria-pressed={level === "guided"}
          onClick={showGuided}
        >
          Guided
        </button>
        <span className="editor-level-switch__hint muted">
          {level === "simple" ? "just place things on the map" : "goals, sectors, zones, functions"}
        </span>
      </div>
      {level === "guided" ? (
        <FocusRail
          current={focus}
          progress={progress}
          warnings={{ boundary: boundaryDirty ? "The border has unsaved changes" : undefined }}
          context={{ goals: goals.goals, features }}
          onChange={go}
        />
      ) : (
        <p className="focus-rail focus-rail--simple muted" aria-label="Design focus">
          Place the things you want on your map — house, water, trees, beds, paths.
        </p>
      )}
      {save.isError &&
        (/self-intersection|invalid polygon/i.test(message(save.error)) ? (
          <p role="alert">
            A shape crosses itself, so it can’t be saved. Drag the stray corner back onto the
            others, or press Ctrl+Z (⌘Z) to undo the last change. Your draft is still here.
          </p>
        ) : (
          <p role="alert">
            Could not save: {message(save.error)} Your draft is still here. Retry saving.
          </p>
        ))}
      {goals.failed && (
        <p role="alert">
          Could not save your goals: {message(goals.error)} They are still here. Retry saving.
        </p>
      )}
      {boundaryDirty && !boundaryValid && (
        <p role="alert">
          Your border has unsaved, invalid changes. Return to Boundary to fix or discard them.
        </p>
      )}
      {saveBoundary.isError && boundaryDirty && (
        <p role="alert">
          Could not save the border: {message(saveBoundary.error)}. Your draft is still here.
        </p>
      )}
      {(save.isError || goals.failed || saveBoundary.isError) && (
        <div className="editor-tools">
          <button
            type="button"
            className="btn"
            onClick={() =>
              saveBlob(
                new Blob(
                  [
                    JSON.stringify(
                      {
                        version: 1,
                        plan: { ...plan, goals: goals.goals },
                        site: {
                          ...site,
                          boundary: {
                            type: "Polygon",
                            coordinates: [draftCoordinates(draft.getState().vertices)],
                          },
                        },
                        ...store.getState().document,
                      },
                      null,
                      2,
                    ),
                  ],
                  { type: "application/json" },
                ),
                "maumbile-unsaved-draft.json",
              )
            }
          >
            Download unsaved draft
          </button>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Reload saved design
          </button>
        </div>
      )}
      {drawing.error && <p role="alert">{drawing.error}</p>}
      {blocker.state === "blocked" && (
        <ModalDialog
          label="Unsaved design"
          onCancel={() => {
            if (!save.isPending && !saveBoundary.isPending && !goals.saving) blocker.reset();
          }}
        >
          <p>You have unsaved changes. Leave this design?</p>
          <button
            className="btn"
            disabled={save.isPending || saveBoundary.isPending || goals.saving}
            onClick={() => blocker.reset()}
          >
            Keep editing
          </button>
          <button
            className="btn"
            disabled={
              save.isPending ||
              saveBoundary.isPending ||
              goals.saving ||
              (boundaryDirty && !boundaryValid)
            }
            onClick={() => {
              void flush()
                .then(() => blocker.proceed())
                .catch((error: unknown) => setLeaveError(message(error)));
            }}
          >
            Save and leave
          </button>
          {leaveError && <p role="alert">{leaveError}</p>}
          <button
            className="btn"
            disabled={save.isPending || saveBoundary.isPending || goals.saving}
            onClick={() => blocker.proceed()}
          >
            Discard changes and leave
          </button>
        </ModalDialog>
      )}
      <div className="editor-layout">
        <aside className="editor-sidebar" aria-label="Design controls" data-focus={focus}>
          <section className="focus-intro">
            <h2>{mode.question}</h2>
            <p className="muted">{mode.help}</p>
          </section>
          {focus !== "goals" && level === "guided" && (
            <GoalsReminder goals={goals.goals} labelOf={labelOf} onOpen={() => go("goals")} />
          )}
          {focus === "goals" && (
            <GoalsPanel
              goals={goals.goals}
              onChange={goals.setGoals}
              onContinue={() => go("boundary")}
            />
          )}
          {focus === "boundary" ? (
            <BoundaryPanel
              draft={draft}
              saving={saveBoundary.isPending}
              error={saveBoundary.isError ? message(saveBoundary.error) : null}
              onSave={() => saveBoundary.mutate()}
              onContinue={() => go("sectors")}
            />
          ) : (
            focus !== "goals" && <HistoryButtons state={state} disabled={disabled} />
          )}
          {focus === "sectors" && (
            <SectorsPanel
              props={panel}
              site={site}
              sectors={own}
              sectorsLayerId={sectorsLayer?.id}
              hiddenKinds={hiddenSectorKinds}
              onToggleKind={(kind, shown) =>
                setHiddenSectorKinds((previous) => {
                  if (previous.has(kind) === !shown) return previous;
                  const next = new Set(previous);
                  if (shown) next.delete(kind);
                  else next.add(kind);
                  return next;
                })
              }
              kind={sectorKind}
              onKindChange={setSectorKind}
              onAdd={(feature) => {
                setTool("select");
                state.upsert(feature);
                // Select it straight away so its bearings, radius and rotation are ready to adjust.
                state.select(feature.id);
              }}
            />
          )}
          {focus === "zones" && (
            <ZonesPanel
              props={panel}
              zones={own}
              zoneNumber={zoneNumber}
              setZoneNumber={setZoneNumber}
            />
          )}
          {focus === "elements" && (
            <ElementsPanel
              props={panel}
              types={types}
              elementId={elementId}
              setElementId={setElementId}
              elements={own}
            />
          )}
          {focus === "functions" && <FunctionsPanel props={panel} elements={own} types={types} />}
          {((selected && selected.geometry.type !== "Point") || tool.startsWith("measure")) && (
            <MeasurementPanel
              measurement={measurement}
              selected={selected}
              confirmed={authoritative?.key === selectedGeometryKey}
              confirming={confirmMeasurement.isPending}
              confirmError={confirmMeasurement.isError ? message(confirmMeasurement.error) : null}
              disabled={disabled}
              onConfirm={() => {
                if (selected) confirmMeasurement.mutate(selected);
              }}
            />
          )}
        </aside>
        <div className="site-map__canvas editor-canvas">
          <MapView
            site={site}
            imagery={imagery.data}
            terrain={terrain.data}
            registry={editorLayerRegistry}
            layerUi={layerUi}
            onMapReady={setMap}
          />
          <div className="map-tools map-tools--bottom">
            <ZoomToBoundaryButton map={map} bounds={site.bbox} />
            <MapLegend entries={legend} />
            <LayersControl state={state} disabled={disabled} />
            <BasemapSwitcher
              providers={imageryProviders.data}
              selected={imageryProvider}
              // Picking the region's own default is "no choice", so the remembered key goes away.
              onSelect={(key) =>
                setImageryChoice(key === imageryProviders.data?.default_key ? null : key)
              }
            />
            {/* Terrain lives in the sidebar during the Sectors & terrain step; everywhere else it
                is reachable here, so slope/contours can be shown or hidden and the land re-measured
                while placing things. */}
            {focus !== "sectors" && (
              <TerrainControl
                siteId={site.id}
                onEditBoundary={focus === "boundary" ? undefined : editBoundary}
              />
            )}
            <MapToolsControl
              tool={tool}
              choose={choose}
              disabled={disabled}
              grid={gridOn}
              gridStep={gridStep}
              onGridChange={setGridOn}
              compass={compassOn}
              onCompassChange={setCompassOn}
            />
          </div>
          {compassOn && <CompassControl map={map} />}
          <div className="editor-map-hint" role="status">
            {hint}
          </div>
          <ImageryAttribution
            siteId={site.id}
            meta={imagery.data}
            isLoading={imagery.isPending}
            isError={imagery.isError}
          />
        </div>
      </div>
    </section>
  );
}
