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
 * The editor panel works in two modes so adding, browsing and editing never mix: with nothing
 * selected it shows the palette/tools and the list of what is placed; select one and it shows just
 * that item, with this control to go back to adding.
 */
export function BackToAdding({ onBack }: { onBack(): void }) {
  return (
    <button type="button" className="btn editor-back" onClick={onBack}>
      ← Back to adding
    </button>
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
      className="btn"
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
