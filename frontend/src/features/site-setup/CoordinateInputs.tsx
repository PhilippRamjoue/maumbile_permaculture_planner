import { useId, useState } from "react";

import {
  parseCoordinateText,
  recoverShortPlusCode,
  type CoordinateOrder,
  type LngLat,
} from "./geometry";
import { geocodePlace } from "./geocode";
import type { DraftRow } from "./store";

interface PasteBoxProps {
  order: CoordinateOrder;
  onOrderChange(order: CoordinateOrder): void;
  onAdd(points: LngLat[]): void;
  /** Biases a short Plus Code's town lookup to the chosen country. */
  countryCode?: string | null;
}

/** Paste a list of coordinates (one corner per line), in any common style. */
function PasteBox({ order, onOrderChange, onAdd, countryCode }: PasteBoxProps) {
  const id = useId();
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function add() {
    const { points, errors: problems, pending } = parseCoordinateText(text, order);
    const resolved: LngLat[] = [...points];
    const messages = problems.map((p) => p.message);
    if (pending.length > 0) {
      // Short Plus Codes ("9R6P+HQ, Kilifi") need the town located first; look each town up once.
      setBusy(true);
      const refs = new Map<string, LngLat | null>();
      for (const item of pending) {
        const key = item.locality.toLowerCase();
        if (!refs.has(key)) refs.set(key, await geocodePlace(item.locality, countryCode));
        const ref = refs.get(key) ?? null;
        if (!ref) {
          messages.push(`Line ${item.line}: couldn't find “${item.locality}”.`);
          continue;
        }
        const point = recoverShortPlusCode(item.code, ref);
        if (point) resolved.push(point);
        else messages.push(`Line ${item.line}: couldn't place Plus Code “${item.code}”.`);
      }
      setBusy(false);
    }
    setErrors(messages);
    if (messages.length === 0 && resolved.length > 0) {
      onAdd(resolved);
      setText("");
    }
  }

  return (
    <div className="field">
      <label htmlFor={id}>Paste coordinates</label>
      <textarea
        id={id}
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          order === "lat-lng" ? "-1.2921, 36.8219\n-1.2925, 36.8230" : "36.8219, -1.2921"
        }
        aria-describedby={`${id}-hint`}
        spellCheck={false}
      />
      <p id={`${id}-hint`} className="field__hint">
        One corner per line, in order around the edge. Paste any common style: decimal (−1.2921,
        36.8219), with N/S/E/W, degrees°minutes′seconds″, or a Plus Code (6GFXMR6P+HQ, or a short
        one with its town: 9R6P+HQ, Kilifi).
      </p>
      <fieldset className="order-choice">
        <legend className="visually-hidden">Order of the numbers</legend>
        <label>
          <input
            type="radio"
            name={`${id}-order`}
            checked={order === "lat-lng"}
            onChange={() => onOrderChange("lat-lng")}
          />{" "}
          Latitude, longitude (as in Google Maps)
        </label>
        <label>
          <input
            type="radio"
            name={`${id}-order`}
            checked={order === "lng-lat"}
            onChange={() => onOrderChange("lng-lat")}
          />{" "}
          Longitude, latitude
        </label>
      </fieldset>
      {errors.length > 0 ? (
        <ul role="alert" className="form__error form__error-list">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
      <button type="button" className="btn" onClick={add} disabled={busy || text.trim() === ""}>
        {busy ? "Looking up…" : "Add pasted points"}
      </button>
    </div>
  );
}

interface PointsTableProps {
  rows: DraftRow[];
  rowErrors: Record<number, string>;
  /** The corner highlighted on the map; its row is highlighted here too. */
  selectedId: number | null;
  onSelect(id: number | null): void;
  onChange(id: number, field: "lat" | "lng", value: string): void;
  onRemove(id: number): void;
  onAddEmpty(): void;
}

/** Editable list of corners. */
function PointsTable({
  rows,
  rowErrors,
  selectedId,
  onSelect,
  onChange,
  onRemove,
  onAddEmpty,
}: PointsTableProps) {
  return (
    <div>
      <table className="points-table">
        <caption className="visually-hidden">Boundary points</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Latitude</th>
            <th scope="col">Longitude</th>
            <th scope="col">
              <span className="visually-hidden">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="muted">
                No points yet. Click the map, paste a list, or add a row.
              </td>
            </tr>
          ) : null}
          {rows.map((row, index) => {
            const error = rowErrors[row.id];
            const n = index + 1;
            return (
              <tr
                key={row.id}
                className={row.id === selectedId ? "points-table__row--selected" : undefined}
                aria-selected={row.id === selectedId}
              >
                <th scope="row">{n}</th>
                <td>
                  <input
                    aria-label={`Point ${n} latitude`}
                    aria-invalid={error ? true : undefined}
                    inputMode="decimal"
                    value={row.lat}
                    onFocus={() => onSelect(row.id)}
                    onChange={(e) => onChange(row.id, "lat", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Point ${n} longitude`}
                    aria-invalid={error ? true : undefined}
                    inputMode="decimal"
                    value={row.lng}
                    onFocus={() => onSelect(row.id)}
                    onChange={(e) => onChange(row.id, "lng", e.target.value)}
                  />
                  {error ? (
                    <p role="alert" className="form__error points-table__error">
                      Point {n}: {error}
                    </p>
                  ) : null}
                </td>
                <td>
                  <button
                    type="button"
                    className="btn"
                    aria-label={`Remove point ${n}`}
                    onClick={() => onRemove(row.id)}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="btn" onClick={onAddEmpty}>
        Add a row
      </button>
    </div>
  );
}

interface CoordinateInputsProps extends PointsTableProps {
  order: CoordinateOrder;
  onOrderChange(order: CoordinateOrder): void;
  onPaste(points: LngLat[]): void;
  countryCode?: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
  onDeleteSelected(): void;
  onClear(): void;
}

/** All three ways to enter corners: click the map (handled by the map), paste, or edit the table. */
export function CoordinateInputs({
  order,
  onOrderChange,
  onPaste,
  countryCode,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onDeleteSelected,
  onClear,
  ...table
}: CoordinateInputsProps) {
  return (
    <div className="coordinate-inputs">
      <p>
        Zoom in on your land and click its corners on the map, or paste / type the coordinates. Go
        around the edge in order. Drag a corner to move it; select one and press Delete to remove
        it.
      </p>
      <PasteBox
        order={order}
        onOrderChange={onOrderChange}
        onAdd={onPaste}
        countryCode={countryCode}
      />
      <PointsTable {...table} />
      <div className="form__actions">
        <button type="button" className="btn" onClick={onUndo} disabled={!canUndo}>
          Undo
        </button>
        <button type="button" className="btn" onClick={onRedo} disabled={!canRedo}>
          Redo
        </button>
        <button
          type="button"
          className="btn"
          onClick={onDeleteSelected}
          disabled={table.selectedId === null}
        >
          Delete selected corner
        </button>
        <button type="button" className="btn" onClick={onClear} disabled={table.rows.length === 0}>
          Clear all
        </button>
      </div>
    </div>
  );
}
