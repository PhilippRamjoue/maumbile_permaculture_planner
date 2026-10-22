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
import { imageryMetaKey } from "../map/imageryMeta";
import { useMapLayerStore } from "../map/store";
import { siteKeys, sitesApi } from "../../entities/siteQueries";
import { terrainKeys, useTerrain } from "../../entities/terrainQueries";
import { ExportMenu } from "../export";
import { MapView } from "../map/MapView";
import { ZoomToBoundaryButton } from "../map/ZoomToBoundaryButton";
import { ImageryAttribution } from "../map/ImageryAttribution";
import { useImageryMeta } from "../map/imageryMeta";
import { persistDesign, planningApi, planningKeys } from "./api";
import { createEditorStore, signature } from "./store";
import { measureGeometry, type Measurement } from "./measure";
import { useEditorMap, type Tool } from "./useEditorMap";
import { AdvancedTools, HistoryButtons } from "./focus/AdvancedTools";
import { BoundaryPanel } from "./focus/BoundaryPanel";
import { editorLayerRegistry } from "./focus/boundaryLayer";
import {
  createBoundaryDraft,
  draftCoordinates,
  isBoundaryDirty,
  validateDraft,
} from "./focus/boundaryDraft";
import type { PanelProps } from "./focus/common";
import { ElementsPanel } from "./focus/ElementsPanel";
import { ContextToggles, FocusRail } from "./focus/FocusRail";
import { FunctionsPanel } from "./focus/FunctionsPanel";
import { connectionLines } from "./focus/functions";
import {
  focusMode,
  initialFocus,
  isEditable,
  parseFocus,
  progressOf,
  type ContextGroup,
  type FocusId,
} from "./focus/modes";
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
    : tool === "sector"
      ? "Sectors"
      : tool === "path"
        ? "Paths"
        : "Elements";

const HINTS: Record<FocusId, string> = {
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
    initialFocus({ layers: plan.layers, features: initial.features }),
  );
  const [params, setParams] = useSearchParams();
  const focus = parseFocus(params.get("focus")) ?? defaultFocus;
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
  const [hidden, setHidden] = useState<ReadonlySet<ContextGroup>>(() => new Set());
  const [saved, setSaved] = useState(false);
  const [failedSignature, setFailedSignature] = useState<string | null>(null);
  const [authoritative, setAuthoritative] = useState<{ key: string; value: Measurement } | null>(
    null,
  );
  const imagery = useImageryMeta(site.id);
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
  const view = useMemo(
    () => createFocusView(focus, hidden, connections, zoneNumber),
    [focus, hidden, connections, zoneNumber],
  );
  // Re-adding the border layer restacks the registry layers over the design layers; the editor
  // map effect re-adds the design layers when this changes.
  const overlays = useMemo(
    () => ({ terrain: terrain.data, border: focus === "boundary" }),
    [terrain.data, focus],
  );

  const save = useMutation({
    mutationFn: async () => {
      const snapshot = structuredClone(store.getState().document);
      try {
        return await persistDesign(
          plan.id,
          snapshot,
          store.getState().persistedIds,
          (persistedIds) => store.setState({ persistedIds }),
        );
      } catch (error) {
        setFailedSignature(signature(snapshot));
        throw error;
      }
    },
    onSuccess: ({ snapshot, result, layers }) => {
      store.getState().markSaved(snapshot);
      queryClient.setQueryData(planningKeys.features(plan.id), result);
      queryClient.setQueryData(planningKeys.plan(plan.id), { ...plan, layers });
      const current = store.getState().selectedId;
      const feature = result.features.find((f) => f.id === current);
      if (feature) setAuthoritative({ key: JSON.stringify(feature.geometry), value: feature });
      setFailedSignature(null);
      setSaved(true);
    },
  });

  const boundaryDirty = useStore(draft, isBoundaryDirty);
  const boundaryVertices = useStore(draft, (s) => s.vertices);
  const boundaryValid = validateDraft(boundaryVertices).status === "valid";
  const saveBoundary = useMutation({
    mutationFn: () =>
      sitesApi.update(site.id, { coordinates: draftCoordinates(draft.getState().vertices) }),
    onSuccess: (updated) => {
      // The border is the Site: everything derived from it (terrain, imagery coverage) is stale.
      queryClient.setQueryData(siteKeys.detail(site.id), updated);
      void queryClient.invalidateQueries({ queryKey: terrainKeys.site(site.id) });
      void queryClient.invalidateQueries({ queryKey: imageryMetaKey(site.id) });
      void queryClient.invalidateQueries({ queryKey: siteKeys.list() });
      draft.getState().reset(updated.boundary);
    },
  });
  const boundaryUi = useBoundaryEditing(map, focus === "boundary", draft, saveBoundary.isPending);

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
  );
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (dirty || save.isPending || boundaryDirty || saveBoundary.isPending) &&
      currentLocation.pathname !== nextLocation.pathname,
  );
  const saveRef = useRef(() => {});
  saveRef.current = () => {
    if (!save.isPending && dirty) save.mutate();
    if (!saveBoundary.isPending && boundaryDirty && boundaryValid) saveBoundary.mutate();
  };

  // Saved on the fly: shortly after the design stops changing, and on every change of focus.
  useAutosave({
    enabled: tool === "select" && !save.isPending && blocker.state !== "blocked",
    dirty,
    signature: currentSignature,
    failedSignature,
    save: () => save.mutate(),
  });

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty || boundaryDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const key = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveRef.current();
        return;
      }
      if (
        save.isPending ||
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
  }, [dirty, boundaryDirty, save.isPending, store, draft, focus]);

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
    setSaved(false);
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
    setTool("select");
    store.getState().select(null);
    setSaved(false);
    setParams(
      (previous) => {
        const nextParams = new URLSearchParams(previous);
        nextParams.set("focus", next);
        return nextParams;
      },
      { preventScrollReset: true },
    );
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
  const progress = progressOf(state.document);
  const hint = tool.startsWith("measure")
    ? "Measurement only — this drawing is not saved"
    : tool === "select"
      ? HINTS[focus]
      : "Draw on the map to add a feature";

  return (
    <section className="design-editor">
      <header className="editor-header">
        <Link to={`/sites/${site.id}/design`}>← Plans</Link>
        <h1>{plan.name}</h1>
        <span>{site.name}</span>
        <ExportMenu planId={plan.id} unsaved={dirty} />
        <button
          className="btn btn--primary"
          onClick={() => {
            setTool("select");
            saveRef.current();
          }}
          disabled={
            save.isPending ||
            (!dirty && !(boundaryDirty && boundaryValid)) ||
            saveBoundary.isPending
          }
        >
          {save.isPending ? "Saving…" : "Save design"}
        </button>
        <span role="status">
          {save.isPending
            ? "Saving design…"
            : dirty
              ? "Unsaved changes"
              : saved
                ? "All changes saved"
                : "Design loaded"}
        </span>
      </header>
      <FocusRail
        current={focus}
        progress={progress}
        warnings={{ boundary: boundaryDirty ? "The border has unsaved changes" : undefined }}
        onChange={go}
      />
      {save.isError && (
        <p role="alert">
          Could not save: {message(save.error)} Your draft is still here. Retry saving.
        </p>
      )}
      {drawing.error && <p role="alert">{drawing.error}</p>}
      {blocker.state === "blocked" && (
        <div className="notice" role="dialog" aria-label="Unsaved design">
          <p>You have unsaved changes. Leave this design?</p>
          <button className="btn" onClick={() => blocker.reset()}>
            Keep editing
          </button>
          <button className="btn" onClick={() => blocker.proceed()}>
            Discard changes and leave
          </button>
        </div>
      )}
      <div className="editor-layout">
        <aside className="editor-sidebar" aria-label="Design controls" data-focus={focus}>
          <section className="focus-intro">
            <h2>{mode.question}</h2>
            <p className="muted">{mode.help}</p>
          </section>
          {focus === "boundary" ? (
            <BoundaryPanel
              draft={draft}
              saving={saveBoundary.isPending}
              error={saveBoundary.isError ? message(saveBoundary.error) : null}
              onSave={() => saveBoundary.mutate()}
            />
          ) : (
            <HistoryButtons state={state} disabled={disabled} />
          )}
          {focus === "sectors" && (
            <SectorsPanel
              props={panel}
              site={site}
              sectors={own}
              sectorsLayerId={sectorsLayer?.id}
              onAdd={(feature) => {
                setTool("select");
                setSaved(false);
                state.upsert(feature);
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
          {focus === "functions" && <FunctionsPanel props={panel} elements={own} />}
          <ContextToggles
            current={focus}
            hidden={hidden}
            onToggle={(group, shown) => {
              setHidden((previous) => {
                const next = new Set(previous);
                if (shown) next.delete(group);
                else next.add(group);
                return next;
              });
            }}
          />
          <AdvancedTools
            state={state}
            disabled={disabled}
            tool={tool}
            choose={choose}
            activeLayer={activeLayer}
            setActiveLayer={setActiveLayer}
            selected={selected}
            measurement={measurement}
            confirmed={authoritative?.key === selectedGeometryKey}
            confirming={confirmMeasurement.isPending}
            confirmError={confirmMeasurement.isError ? message(confirmMeasurement.error) : null}
            onConfirm={() => {
              if (selected) confirmMeasurement.mutate(selected);
            }}
          />
        </aside>
        <div className="site-map__canvas editor-canvas">
          <MapView
            site={site}
            imagery={imagery.data}
            terrain={terrain.data}
            registry={editorLayerRegistry}
            layerUi={boundaryUi}
            onMapReady={setMap}
          />
          <div className="map-tools map-tools--bottom">
            <ZoomToBoundaryButton map={map} bounds={site.bbox} />
          </div>
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
