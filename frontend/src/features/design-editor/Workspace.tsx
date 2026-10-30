import { useSectorAdding } from "./useSectorAdding";
import { MapControlBar } from "./MapControlBar";
import { useImageryBasemap } from "./useImageryBasemap";
import { useEditorShortcuts } from "./useEditorShortcuts";
import { EditorSaveFeedback } from "./EditorSaveFeedback";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
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
import { useMapLayerStore } from "../map/store";
import { useTerrain } from "../../entities/terrainQueries";
import { ExportMenu } from "../export";
import { glyphFor } from "./icons";
import { buildLegend } from "./legend";
import { MAX_FIT_ZOOM } from "../map/layers/zoomLimits";
import { MapView } from "../map/MapView";
import { GRID_LAYER_ID, gridStepFor } from "../map/layers/gridLayer";
import { useViewportBounds } from "../map/useViewportBounds";
import { ImageryAttribution } from "../map/ImageryAttribution";
import { planningApi } from "./api";
import { useEditorPersistence } from "./useEditorPersistence";
import { isParametricSector } from "./sectors";
import { createEditorStore } from "./store";
import { formatArea, formatLength } from "../../shared/format";
import { measureGeometry, type Measurement } from "./measure";
import { useEditorMap, type Tool } from "./useEditorMap";
import { useSectorHandles } from "./useSectorHandles";
import { CompassControl } from "./CompassControl";
import { PlanSwitcher } from "./PlanSwitcher";
import { HistoryButtons } from "./focus/AdvancedTools";
import { BoundaryPanel } from "./focus/BoundaryPanel";
import { MeasurementPanel } from "./focus/MeasurementPanel";
import { editorLayerRegistry } from "./focus/boundaryLayer";
import { createBoundaryDraft } from "./focus/boundaryDraft";
import type { PanelProps } from "./focus/common";
import { ElementsPanel } from "./focus/ElementsPanel";
import { labelOf } from "./focus/goals";
import { GoalsPanel, GoalsReminder } from "./focus/GoalsPanel";
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
import { useBoundaryEditing } from "./focus/useBoundaryEditing";
import { createFocusView } from "./focus/view";
import { ZonesPanel } from "./focus/ZonesPanel";
import { errorMessage as message } from "./messages";
import { destinationLayer, useActiveLayer } from "./useActiveLayer";

const editable = (f: SavedFeature): DesignFeature => ({
  type: "Feature",
  id: f.id,
  layer_id: f.layer_id,
  feature_type: f.feature_type,
  element_type_id: f.element_type_id,
  geometry: f.geometry,
  properties: f.properties,
});

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
  const activeLayer = useActiveLayer(
    store,
    tool,
    types.find((t) => t.id === elementId),
  );
  const [zoneNumber, setZoneNumber] = useState(1);
  const sectors = useSectorAdding(store, setTool);
  const hidden: ReadonlySet<ContextGroup> = EMPTY_GROUPS;
  const [authoritative, setAuthoritative] = useState<{ key: string; value: Measurement } | null>(
    null,
  );
  const basemap = useImageryBasemap(site.id);
  const { providers: imageryProviders, selected: imageryProvider, imagery } = basemap;
  const terrain = useTerrain(site.id);
  const sectorsLayer = destinationLayer(state.document.layers, "sector");

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
    () => createFocusView(focus, hidden, connections, zoneNumber, sectors.hiddenKinds, iconOf),
    [focus, hidden, connections, zoneNumber, sectors.hiddenKinds, iconOf],
  );
  // Re-adding the border layer restacks the registry layers over the design layers; the editor
  // map effect restacks the existing design layers when this changes.
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

  const persistence = useEditorPersistence(site, plan, store, draft, tool, (feature) =>
    setAuthoritative({ key: JSON.stringify(feature.geometry), value: feature }),
  );
  const {
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
    saveRef,
    flush,
  } = persistence;
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
    sectors.kind,
  );
  // Drag handles for the selected parametric sector (move / open / resize), only in the Sectors step.
  useSectorHandles(map, store, focus === "sectors" && !save.isPending);

  useEditorShortcuts(
    store,
    draft,
    focus,
    dirty,
    boundaryDirty,
    goals.dirty,
    save.isPending,
    saveBoundary.isPending,
    saveRef,
  );

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
      <EditorSaveFeedback
        site={site}
        plan={plan}
        store={store}
        draft={draft}
        persistence={persistence}
      />
      {drawing.error && <p role="alert">{drawing.error}</p>}
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
              hiddenKinds={sectors.hiddenKinds}
              onToggleKind={sectors.toggleKind}
              kind={sectors.kind}
              onKindChange={sectors.setKind}
              onAdd={sectors.add}
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
          <MapControlBar
            zoom={{ map, bounds: site.bbox }}
            legend={{ entries: legend }}
            layers={{ state, disabled }}
            basemap={{
              providers: imageryProviders.data,
              selected: imageryProvider,
              onSelect: basemap.select,
            }}
            terrain={{
              siteId: site.id,
              onEditBoundary: focus === "boundary" ? undefined : editBoundary,
            }}
            tools={{
              tool,
              choose,
              disabled,
              grid: gridOn,
              gridStep,
              onGridChange: setGridOn,
              compass: compassOn,
              onCompassChange: setCompassOn,
            }}
          />
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
