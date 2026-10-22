import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useSite } from "../../entities/siteQueries";
import { useTerrain } from "../../entities/terrainQueries";
import { ApiError } from "../../shared/api/client";
import { formatArea } from "../../shared/format";
import { ExportMenu } from "../export";
import { MapView } from "../map/MapView";
import { ZoomToBoundaryButton } from "../map/ZoomToBoundaryButton";
import { ImageryAttribution } from "../map/ImageryAttribution";
import { useImageryMeta } from "../map/imageryMeta";
import { TerrainPanel } from "../terrain";
import { persistDesign, planningApi, planningKeys } from "./api";
import { createEditorStore, signature } from "./store";
import { measureGeometry, type Measurement } from "./measure";
import { useEditorMap, type Tool } from "./useEditorMap";
import { EditorControls } from "./EditorControls";
import { SectorHelper } from "./SectorHelper";
import { defaultSectorRadius } from "./sectors";

const message = (error: unknown) =>
  error instanceof ApiError
    ? error.userMessage
    : error instanceof Error
      ? error.message
      : "Something went wrong.";
const editable = (f: SavedFeature): DesignFeature => ({
  type: "Feature",
  id: f.id,
  layer_id: f.layer_id,
  feature_type: f.feature_type,
  element_type_id: f.element_type_id,
  geometry: f.geometry,
  properties: f.properties,
});

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

function Workspace({
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
  const state = useStore(store);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [elementId, setElementId] = useState(
    types.find((t) => t.key === "tree")?.id ?? types[0]?.id,
  );
  const [activeLayer, setActiveLayer] = useState(
    plan.layers.find((l) => l.name === "Elements")?.id ?? plan.layers[0]?.id ?? "",
  );
  const [saved, setSaved] = useState(false);
  const [authoritative, setAuthoritative] = useState<{ key: string; value: Measurement } | null>(
    null,
  );
  const imagery = useImageryMeta(site.id);
  const terrain = useTerrain(site.id);
  const sectorsLayer = state.document.layers.find((l) => l.name === "Sectors" && l.visible);
  const queryClient = useQueryClient();
  const dirty = signature(state.document) !== state.savedSignature;
  const selected = state.document.features.find((f) => f.id === state.selectedId);
  const selectedGeometryKey = selected ? JSON.stringify(selected.geometry) : "";
  const save = useMutation({
    mutationFn: async () => {
      const snapshot = structuredClone(store.getState().document);
      return persistDesign(plan.id, snapshot, store.getState().persistedIds, (persistedIds) =>
        store.setState({ persistedIds }),
      );
    },
    onSuccess: ({ snapshot, result, layers }) => {
      store.getState().markSaved(snapshot);
      queryClient.setQueryData(planningKeys.features(plan.id), result);
      queryClient.setQueryData(planningKeys.plan(plan.id), { ...plan, layers });
      const current = store.getState().selectedId;
      const feature = result.features.find((f) => f.id === current);
      if (feature) setAuthoritative({ key: JSON.stringify(feature.geometry), value: feature });
      setSaved(true);
    },
  });
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
    terrain.data,
    site.boundary,
  );
  const blocker = useBlocker(dirty || save.isPending);
  const saveRef = useRef(() => save.mutate());
  saveRef.current = () => {
    if (!save.isPending) save.mutate();
  };
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) {
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
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) store.getState().redo();
        else store.getState().undo();
      }
      if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        store.getState().redo();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("keydown", key);
    };
  }, [dirty, save.isPending, store]);

  const choose = (next: Tool) => {
    setTool(next);
    store.getState().select(null);
    setSaved(false);
    const name =
      next === "zone"
        ? "Zones"
        : next === "sector"
          ? "Sectors"
          : next === "path"
            ? "Paths"
            : "Elements";
    const layer = state.document.layers.find((l) => l.name === name && l.visible);
    if (layer) setActiveLayer(layer.id);
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
            save.mutate();
          }}
          disabled={save.isPending || !dirty}
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
        <aside className="editor-sidebar" aria-label="Design controls">
          <EditorControls
            state={state}
            disabled={save.isPending || !map}
            tool={tool}
            choose={choose}
            setTool={setTool}
            types={types}
            elementId={elementId}
            setElementId={setElementId}
            activeLayer={activeLayer}
            setActiveLayer={setActiveLayer}
            onRotate={drawing.rotate}
          />
          <SectorHelper
            origin={site.centroid.coordinates}
            defaultRadiusM={defaultSectorRadius(site.bbox)}
            layerId={sectorsLayer?.id}
            disabled={save.isPending || !map}
            onAdd={(feature) => {
              setTool("select");
              setSaved(false);
              state.upsert(feature);
            }}
          />
          <TerrainPanel siteId={site.id} />
          <div className="editor-measurement" aria-label="Measurement">
            <h2>Measurements</h2>
            {measurement ? (
              <>
                <p>
                  {measurement.length_m.toFixed(1)} m{" "}
                  {selected?.geometry.type === "Polygon" ? "perimeter" : "length"}
                </p>
                <p>{formatArea(measurement.area_m2)}</p>
              </>
            ) : (
              <p>Select a shape or use a measure tool.</p>
            )}
            <p className="muted">
              {selected && authoritative?.key === selectedGeometryKey
                ? "Confirmed by server"
                : "Live geodesic estimate"}
            </p>
            <button
              className="btn"
              disabled={!selected || confirmMeasurement.isPending || save.isPending}
              onClick={() => {
                if (selected) confirmMeasurement.mutate(selected);
              }}
            >
              Confirm measurement
            </button>
            {confirmMeasurement.isError && <p role="alert">{message(confirmMeasurement.error)}</p>}
          </div>
        </aside>
        <div className="site-map__canvas editor-canvas">
          <MapView site={site} imagery={imagery.data} terrain={terrain.data} onMapReady={setMap} />
          <div className="map-tools map-tools--bottom">
            <ZoomToBoundaryButton map={map} bounds={site.bbox} />
          </div>
          <div className="editor-map-hint" role="status">
            {tool === "select"
              ? "Select a feature on the map or in the list"
              : tool.startsWith("measure")
                ? "Measurement only — this drawing is not saved"
                : "Draw on the map to add a feature"}
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
