import { useState } from "react";

import type { DesignFeature, ElementType } from "../../../entities/planning";
import { EditHeader, FeatureList, type PanelProps } from "./common";
import {
  FUNCTION_PRESETS,
  connectionsOf,
  displayName,
  functionsOf,
  normalizeFunction,
  permacultureCheck,
  toggleFunction,
  typeOfElement,
  withTypicalFunctions,
  type FunctionKey,
} from "./functions";

const LABELS: Record<FunctionKey, { title: string; hint: string }> = {
  needs: { title: "Needs", hint: "What does it need to thrive or work? A tree needs water." },
  yields: { title: "Gives", hint: "What does it provide? A water tank gives water." },
};

/** Needs or yields of one element: tap-to-toggle suggestions plus your own words. */
function FunctionPicker({
  element,
  kind,
  onChange,
}: {
  element: DesignFeature;
  kind: FunctionKey;
  onChange(next: DesignFeature): void;
}) {
  const [custom, setCustom] = useState("");
  const chosen = functionsOf(element, kind);
  const options = [...FUNCTION_PRESETS, ...chosen.filter((c) => !FUNCTION_PRESETS.includes(c))];
  const add = () => {
    const name = normalizeFunction(custom);
    if (!name) return;
    onChange(toggleFunction(element, kind, name, true));
    setCustom("");
  };
  return (
    <fieldset className="function-picker">
      <legend>{LABELS[kind].title}</legend>
      <p className="muted">{LABELS[kind].hint}</p>
      <div className="function-picker__chips">
        {options.map((name) => (
          <button
            key={name}
            type="button"
            className="btn"
            aria-pressed={chosen.includes(name)}
            aria-label={`${LABELS[kind].title}: ${name}`}
            onClick={() => onChange(toggleFunction(element, kind, name, !chosen.includes(name)))}
          >
            {name}
          </button>
        ))}
      </div>
      <details className="editor-more">
        <summary>Add your own</summary>
        <label>
          {LABELS[kind].title} — another function
          <input
            value={custom}
            maxLength={40}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
        </label>
        <button type="button" className="btn" disabled={!normalizeFunction(custom)} onClick={add}>
          Add
        </button>
      </details>
    </fieldset>
  );
}

/** What the selected element is linked to: who supplies its needs and who uses what it gives. */
function Links({
  element,
  features,
  onPick,
}: {
  element: DesignFeature;
  features: readonly DesignFeature[];
  onPick(id: string): void;
}) {
  const links = connectionsOf(element, features);
  const needs = functionsOf(element, "needs");
  const supplied = new Set(links.filter((l) => l.direction === "supplies").map((l) => l.fn));
  const missing = needs.filter((n) => !supplied.has(n));
  return (
    <section aria-label="Connections">
      <h2>Connections</h2>
      {links.length === 0 && missing.length === 0 && (
        <p className="muted">Add needs and gifts to see how this element connects to the others.</p>
      )}
      <ul className="function-links">
        {links.map((link) => (
          <li key={`${link.direction}-${link.fn}-${link.other.id}`}>
            {link.direction === "supplies" ? (
              <>
                <strong>{link.fn}</strong> comes from{" "}
              </>
            ) : (
              <>
                <strong>{link.fn}</strong> goes to{" "}
              </>
            )}
            <button type="button" className="btn btn--link" onClick={() => onPick(link.other.id)}>
              {displayName(link.other)}
            </button>
          </li>
        ))}
      </ul>
      {missing.length > 0 && <p role="status">Nothing provides yet: {missing.join(", ")}.</p>}
      {links.length > 0 && <p className="muted">Dashed lines on the map show these links.</p>}
    </section>
  );
}

/** The permaculture check over all elements, in plain sentences. */
export function CheckReport({
  features,
  onPick,
}: {
  features: readonly DesignFeature[];
  onPick(id: string): void;
}) {
  const check = permacultureCheck(features);
  if (check.count === 0) {
    return (
      <section aria-label="Permaculture check">
        <h2>Permaculture check</h2>
        <p className="muted">Place some elements first, then check how they work together.</p>
      </section>
    );
  }
  const link = (f: DesignFeature) => (
    <button key={f.id} type="button" className="btn btn--link" onClick={() => onPick(f.id)}>
      {displayName(f)}
    </button>
  );
  const list = (items: DesignFeature[]) =>
    items.flatMap((f, i) => (i === 0 ? [link(f)] : [", ", link(f)]));
  return (
    <section aria-label="Permaculture check">
      <h2>Permaculture check</h2>
      {check.ok ? (
        <p role="status">
          Looking good: every need is met by another element, every function has more than one
          source, and each element gives several things.
        </p>
      ) : (
        <ul className="function-check">
          {check.undescribed.length > 0 && (
            <li>
              Not described yet: {list(check.undescribed)}. Pick one and add what it needs and
              gives.
            </li>
          )}
          {check.unmet.map((u) => (
            <li key={`unmet-${u.fn}`}>
              Nothing provides <strong>{u.fn}</strong>, needed by {list(u.needers)}.
            </li>
          ))}
          {check.fragile.map((f) => (
            <li key={`fragile-${f.fn}`}>
              Only {link(f.provider)} provides <strong>{f.fn}</strong>. A second source would make
              it more resilient.
            </li>
          ))}
          {check.underused.length > 0 && (
            <li>Gives fewer than two things: {list(check.underused)}. Can it do more?</li>
          )}
        </ul>
      )}
    </section>
  );
}

/**
 * Functions & connections focus. Elements keep their place on the map; here you say what each
 * needs and gives. The links between elements are worked out from that, never stored.
 */
export function FunctionsPanel({
  props,
  elements,
  types,
}: {
  props: PanelProps;
  elements: readonly DesignFeature[];
  types: readonly ElementType[];
}) {
  const { state, pick, disabled, selected } = props;
  const name = selected ? String(selected.properties.name ?? selected.feature_type) : "";
  // Elements placed from the palette start with their typical needs and gifts; older ones, or ones
  // that were cleared, can be topped up here without overwriting anything chosen by hand.
  const fillable = elements.filter((e) => withTypicalFunctions(e, types) !== e);
  const typeName = (e: DesignFeature) => typeOfElement(e, types)?.name ?? "element";
  const selectedFillable = selected && withTypicalFunctions(selected, types) !== selected;
  return selected ? (
    <>
      <EditHeader name={name} label="All elements" onDone={() => state.select(null)} />
      <fieldset disabled={disabled} className="editor-properties">
        <legend>Needs and gifts</legend>
        {selectedFillable && selected && (
          <button
            type="button"
            className="btn"
            onClick={() => state.upsert(withTypicalFunctions(selected, types))}
          >
            Use the typical needs &amp; gifts of a {typeName(selected).toLowerCase()}
          </button>
        )}
        <FunctionPicker element={selected} kind="needs" onChange={state.upsert} />
        <FunctionPicker element={selected} kind="yields" onChange={state.upsert} />
        <Links element={selected} features={elements} onPick={pick} />
      </fieldset>
    </>
  ) : (
    <>
      <p className="muted">
        Say what each element <strong>gives</strong> (water, shade, food…) and what it{" "}
        <strong>needs</strong>. When one element gives what another needs, they are linked — pick an
        element to see the links.
      </p>
      {fillable.length > 0 && (
        <button
          type="button"
          className="btn"
          disabled={disabled}
          onClick={() => fillable.forEach((e) => state.upsert(withTypicalFunctions(e, types)))}
        >
          Fill in typical needs &amp; gifts for {fillable.length} element
          {fillable.length === 1 ? "" : "s"}
        </button>
      )}
      <FeatureList
        title="Elements"
        features={elements}
        selectedId={state.selectedId}
        onPick={pick}
        empty="No elements yet. Place some in the Elements step first."
      />
      {elements.length > 0 && <p className="muted">Pick an element, on the map or above.</p>}
      <CheckReport features={elements} onPick={pick} />
    </>
  );
}
