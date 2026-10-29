import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useStore } from "zustand";

import type { DesignFeature, ElementType } from "../../../entities/planning";
import type { Site } from "../../../entities/site";
import { SECTOR_KINDS, type SectorKind } from "../sectors";
import { createEditorStore, type EditorStore } from "../store";
import type { Tool } from "../useEditorMap";
import { PlacingBanner, type PanelProps } from "./common";
import { ElementsPanel } from "./ElementsPanel";
import { FunctionsPanel } from "./FunctionsPanel";
import { SectorsPanel } from "./SectorsPanel";
import { ZonesPanel } from "./ZonesPanel";

vi.mock("../../terrain", () => ({ TerrainPanel: () => <p>terrain</p> }));

const layer = { id: "l1", name: "Elements", visible: true, sort_order: 1, locked: false };
const feature = (patch: Partial<DesignFeature> = {}): DesignFeature => ({
  type: "Feature",
  id: "f1",
  layer_id: "l1",
  feature_type: "element",
  element_type_id: 1,
  geometry: { type: "Point", coordinates: [35.74, -3.37] },
  properties: { name: "Rain tank" },
  ...patch,
});
const house: ElementType = {
  id: 1,
  key: "house",
  name: "House",
  category: "structure",
  feature_type: "element",
  geometry_type: "polygon",
  icon: "house",
  default_style: {},
  default_properties: {},
  shape: "rect",
  default_width_m: 8,
  default_length_m: 6,
  default_diameter_m: null,
  sort_order: 1,
};
const site = {
  id: "s1",
  bbox: [35.7, -3.4, 35.8, -3.3],
  centroid: { type: "Point", coordinates: [35.75, -3.35] },
} as unknown as Site;

/** Hosts a panel the way the workspace does: a real editor store, a tool, and `choose`/`pick`. */
function renderPanel(
  panel: (props: PanelProps) => ReactNode,
  { tool = "select", selectedId = null }: { tool?: Tool; selectedId?: string | null } = {},
  features: DesignFeature[] = [feature()],
) {
  const store: EditorStore = createEditorStore({ features, layers: [layer] as never });
  store.getState().select(selectedId);
  const chosen: Tool[] = [];
  function Host() {
    const [current, setTool] = useState<Tool>(tool);
    const state = useStore(store);
    const props: PanelProps = {
      state,
      tool: current,
      choose: (next) => {
        chosen.push(next);
        setTool(next);
        state.select(null);
      },
      pick: (id) => {
        setTool("select");
        state.select(id);
      },
      disabled: false,
      selected: state.document.features.find((f) => f.id === state.selectedId),
      onRotate: () => undefined,
    };
    return <>{panel(props)}</>;
  }
  render(<Host />);
  return { store, chosen, user: userEvent.setup() };
}

const elementsPanel = (props: PanelProps) => (
  <ElementsPanel
    props={props}
    types={[house]}
    elementId={1}
    setElementId={() => undefined}
    elements={props.state.document.features}
  />
);
const zonesPanel = (props: PanelProps) => (
  <ZonesPanel props={props} zones={[]} zoneNumber={1} setZoneNumber={() => undefined} />
);
/** Hosts the sector panel with the `kind` state the workspace lifts out of it. */
function SectorsHarness({
  props,
  onAdd = () => undefined,
}: {
  props: PanelProps;
  onAdd?: (feature: DesignFeature) => void;
}) {
  const [kind, setKind] = useState<SectorKind>("sun");
  return (
    <SectorsPanel
      props={props}
      site={site}
      sectors={[]}
      sectorsLayerId="l1"
      hiddenKinds={new Set()}
      onToggleKind={() => undefined}
      onAdd={onAdd}
      kind={kind}
      onKindChange={setKind}
    />
  );
}
const sectorsPanel = (props: PanelProps) => <SectorsHarness props={props} />;

describe("placing banner", () => {
  it("is absent on the select tool and for measuring", () => {
    for (const tool of ["select", "measure-line", "measure-area"] as const) {
      const { container } = render(<PlacingBanner tool={tool} what="x" how="y" choose={vi.fn()} />);
      expect(container).toBeEmptyDOMElement();
    }
  });

  it("says what is being placed, and Stop placing returns to the select tool", async () => {
    const { chosen, user } = renderPanel(elementsPanel, { tool: "element" });
    expect(screen.getByRole("status")).toHaveTextContent("Placing house");
    expect(screen.getByRole("status")).toHaveTextContent(/places a 8 × 6 m house to scale/);
    expect(screen.getByRole("button", { name: /Place house on map/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Stop placing" }));
    expect(chosen).toEqual(["select"]);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: /Place house on map/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("marks the armed tool buttons so they read as on, and not the select button", () => {
    renderPanel(zonesPanel, { tool: "zone" });
    const draw = screen.getByRole("button", { name: "Draw zone" });
    expect(draw).toHaveAttribute("aria-pressed", "true");
    expect(draw).toHaveClass("btn--armed");
    expect(screen.getByRole("button", { name: "Select / edit" })).not.toHaveClass("btn--armed");
  });

  it("explains drawing a path, a zone and a rectangular sector", () => {
    renderPanel(elementsPanel, { tool: "path" });
    expect(screen.getByRole("status")).toHaveTextContent("Placing a path");
    expect(screen.getByRole("status")).toHaveTextContent("then press Enter");
  });

  it("covers the zone and sector steps too", async () => {
    const zones = renderPanel(zonesPanel, { tool: "zone" });
    expect(screen.getByRole("status")).toHaveTextContent("Placing zone 1");
    await zones.user.click(screen.getByRole("button", { name: "Stop placing" }));
    expect(zones.chosen).toEqual(["select"]);
  });

  it("covers sectors, drawn by hand or as a rectangle", () => {
    renderPanel(sectorsPanel, { tool: "sector-rect" });
    expect(screen.getByRole("status")).toHaveTextContent("Placing a rectangular sector");
    expect(screen.getByRole("status")).toHaveTextContent("opposite corners");
  });
});

describe("editing one item", () => {
  it.each([
    ["elements", elementsPanel, "All elements"],
    ["zones", zonesPanel, "All zones"],
    ["sectors", sectorsPanel, "All sectors"],
  ] as const)(
    "%s: names the item, offers Done and a way back, and Done changes nothing saved",
    async (_name, panel, back) => {
      const { store, user } = renderPanel(panel, { selectedId: "f1" });
      expect(screen.getByRole("heading", { name: "Rain tank" })).toBeInTheDocument();
      expect(screen.getByText("Changes save automatically.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: new RegExp(back) })).toBeInTheDocument();
      const before = JSON.stringify(store.getState().document);
      const history = store.getState().past.length;

      await user.click(screen.getByRole("button", { name: "Done" }));
      expect(store.getState().selectedId).toBeNull();
      expect(JSON.stringify(store.getState().document)).toBe(before);
      expect(store.getState().past.length).toBe(history); // selecting is not an edit
      expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    },
  );

  it("the breadcrumb still goes back to the list, like Done", async () => {
    const { store, user } = renderPanel(zonesPanel, { selectedId: "f1" });
    await user.click(screen.getByRole("button", { name: /All zones/ }));
    expect(store.getState().selectedId).toBeNull();
    expect(screen.getByRole("heading", { name: "Zones (0)" })).toBeInTheDocument();
  });

  it("an edit still saves on its own, with no Save button", async () => {
    const { store, user } = renderPanel(elementsPanel, { selectedId: "f1" });
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
    const name = screen.getByLabelText("Feature name");
    await user.clear(name);
    await user.type(name, "Big tank");
    expect(store.getState().document.features[0]!.properties.name).toBe("Big tank");
    expect(screen.getByRole("heading", { name: "Big tank" })).toBeInTheDocument();
  });

  it("functions: the same header, Done returning to the list", async () => {
    const { store, user } = renderPanel(
      (props) => (
        <FunctionsPanel props={props} elements={props.state.document.features} types={[house]} />
      ),
      { selectedId: "f1" },
    );
    expect(screen.getByRole("heading", { name: "Rain tank" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(store.getState().selectedId).toBeNull();
  });
});

describe("sector panel", () => {
  it("adds any kind from one uniform chooser, sun included and not privileged", async () => {
    const added: DesignFeature[] = [];
    const { user } = renderPanel((props) => (
      <SectorsHarness props={props} onAdd={(f) => added.push(f)} />
    ));
    // Every kind is a chip in one radiogroup — sun is just one of them, not a button of its own.
    const kinds = screen.getByRole("radiogroup", { name: "Sector kind" });
    const chips = within(kinds).getAllByRole("radio");
    expect(chips).toHaveLength(SECTOR_KINDS.length);
    expect(chips.map((c) => c.textContent)).toContain("☀ Sun");
    // The default is sun, and its one-click add uses today's path.
    expect(screen.getByRole("button", { name: /Add sun sector/ })).toBeInTheDocument();
    // Pick another kind and add it: the created sector carries that kind, not wind or sun.
    await user.click(screen.getByRole("radio", { name: "Water" }));
    await user.click(screen.getByRole("button", { name: /Add water sector/ }));
    expect(added).toHaveLength(1);
    expect(added[0]!.properties.sector_kind).toBe("water");
  });

  it("opens the bearings form from its button and closes it again", async () => {
    const { user } = renderPanel(sectorsPanel);
    const toggle = screen.getByRole("button", { name: "From bearings" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Sun path for a date")).toBeNull();
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Sun path for a date")).toBeInTheDocument();
    await user.click(toggle);
    expect(screen.queryByText("Sun path for a date")).toBeNull();
  });

  it("still arms the drawing tools", async () => {
    const { chosen, user } = renderPanel(sectorsPanel);
    await user.click(screen.getByRole("button", { name: "Draw by hand" }));
    expect(chosen).toEqual(["sector"]);
    expect(screen.getByRole("status")).toHaveTextContent("Placing a sector");
  });
});
