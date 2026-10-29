import type { DesignFeature } from "../../../entities/planning";
import { formatArea } from "../../../shared/format";
import { measureGeometry } from "../measure";
import type { EditorState } from "../store";
import type { Tool } from "../useEditorMap";

/** What every mode panel gets from the workspace. */
export interface PanelProps {
  state: EditorState;
  tool: Tool;
  /** Switches tool and clears the selection (and sets the layer the tool draws into). */
  choose(tool: Tool): void;
  /** Selects a feature by id and returns to the select tool. */
  pick(id: string): void;
  /** True while a save runs or the map is not ready. */
  disabled: boolean;
  selected: DesignFeature | undefined;
  onRotate(angle: number): void;
}

/**
 * Master–detail: with nothing selected a step shows its "add" tools and the list of what is placed;
 * selecting one (from the list or the map) drills into just that item's editor. Its header names
 * the item being edited, ends the edit with a primary **Done** (back to the list) and keeps the
 * breadcrumb, whose `label` names the list, e.g. "All sectors", so "back" always says where to.
 * Nothing needs saving: every change is already saved on its own.
 */
export function EditHeader({
  name,
  label,
  onDone,
}: {
  name: string;
  label: string;
  onDone(): void;
}) {
  return (
    <div className="editor-edit-header">
      <button type="button" className="btn editor-back" onClick={onDone}>
        ← {label}
      </button>
      <div className="editor-edit-header__row">
        <h2 className="editor-edit-header__name">{name}</h2>
        <button type="button" className="btn btn--primary" onClick={onDone}>
          Done
        </button>
      </div>
      <p className="muted editor-edit-header__note">Changes save automatically.</p>
    </div>
  );
}

/** The tools that take a click on the map to create something; Select and Measure do not. */
const PLACING_TOOLS: readonly Tool[] = ["element", "path", "zone", "sector", "sector-rect"];
const isPlacing = (tool: Tool) => PLACING_TOOLS.includes(tool);

/**
 * While a placing tool is armed: says what is being placed and how, and ends placing with an
 * explicit button (back to the select tool) so the state is never a mystery. Nothing while the
 * select tool is active.
 */
export function PlacingBanner({
  tool,
  what,
  how,
  choose,
}: {
  tool: Tool;
  what: string;
  how: string;
  choose(tool: Tool): void;
}) {
  if (!isPlacing(tool)) return null;
  return (
    <div className="editor-placing" role="status">
      <div className="editor-placing__text">
        <strong>Placing {what}</strong>
        <span>{how}</span>
      </div>
      <button type="button" className="btn btn--primary" onClick={() => choose("select")}>
        Stop placing
      </button>
    </div>
  );
}

export function ToolButton({
  tool,
  current,
  label,
  choose,
}: {
  tool: Tool;
  current: Tool;
  label: string;
  choose(tool: Tool): void;
}) {
  return (
    <button
      type="button"
      className={tool === "select" ? "btn" : "btn btn--armed"}
      aria-pressed={current === tool}
      onClick={() => choose(tool)}
    >
      {label}
    </button>
  );
}

const describe = (feature: DesignFeature) => {
  const { area_m2, length_m } = measureGeometry(feature.geometry);
  return area_m2 > 0 ? formatArea(area_m2) : length_m > 0 ? `${Math.round(length_m)} m` : "";
};

/** The editable features of the current focus, as buttons that select them. */
export function FeatureList({
  title,
  features,
  selectedId,
  onPick,
  empty,
  label = (f) => String(f.properties.name ?? f.feature_type),
}: {
  title: string;
  features: readonly DesignFeature[];
  selectedId: string | null;
  onPick(id: string): void;
  empty: string;
  label?(feature: DesignFeature): string;
}) {
  return (
    <section aria-label={title}>
      <h2>
        {title} ({features.length})
      </h2>
      {features.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul className="editor-feature-list">
          {features.map((feature) => (
            <li key={feature.id}>
              <button
                type="button"
                className="btn"
                aria-pressed={feature.id === selectedId}
                title={describe(feature)}
                onClick={() => onPick(feature.id)}
              >
                {label(feature)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
