import { useMemo, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../../shared/api/client";
import { formatArea } from "../../shared/format";
import { TextField } from "../../shared/ui/TextField";
import { CoordinateInputs } from "./CoordinateInputs";
import { countryContains, countryName, suggestCountry } from "./countries";
import { closeRing, type LngLat } from "./geometry";
import { SetupMap } from "./map/SetupMap";
import { SetupAttribution } from "./SetupAttribution";
import { analyseRows, useSetupStore } from "./store";
import { useCreateSite } from "./useCreateSite";

/** Step 2: outline the land (map clicks, pasted list or table), name it, create it. */
export function CoordinatesStep() {
  const navigate = useNavigate();
  const create = useCreateSite();
  const { countryCode, name, order, rows } = useSetupStore();
  const store = useSetupStore.getState;

  const { points, rowErrors, validation } = useMemo(() => analyseRows(rows), [rows]);
  const firstPoint: LngLat | undefined = points[0];
  const suggested = firstPoint ? suggestCountry(firstPoint) : null;
  const countryMismatch =
    countryCode !== null &&
    firstPoint !== undefined &&
    suggested !== null &&
    suggested !== countryCode &&
    countryContains(countryCode, firstPoint) === false;

  const trimmedName = name.trim();
  const canSubmit = validation.status === "valid" && trimmedName !== "" && !create.isPending;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || !countryCode) return;
    create.mutate(
      { name: trimmedName, country_code: countryCode, coordinates: closeRing(validation.ring) },
      { onSuccess: (site) => navigate(`/sites/${site.id}`) },
    );
  }

  return (
    <div className="setup-layout">
      <form className="card form setup-panel" onSubmit={submit} aria-labelledby="setup-step-title">
        <h2 id="setup-step-title">Step 2 of 2 · Outline your land</h2>
        <p className="muted">
          Country: <strong>{countryCode ? countryName(countryCode) : "—"}</strong>{" "}
          <button
            type="button"
            className="btn btn--link"
            onClick={() => store().setStep("country")}
          >
            Change
          </button>
        </p>

        {countryMismatch && suggested ? (
          <p role="status" className="notice">
            Your first point looks like it is in {countryName(suggested)}, not{" "}
            {countryName(countryCode)}.{" "}
            <button
              type="button"
              className="btn btn--link"
              onClick={() => store().setCountry(suggested)}
            >
              Switch to {countryName(suggested)}
            </button>
          </p>
        ) : null}

        <CoordinateInputs
          order={order}
          rows={rows}
          rowErrors={rowErrors}
          onOrderChange={(o) => store().setOrder(o)}
          onPaste={(pasted) => store().addPoints(pasted)}
          onChange={(id, field, value) => store().updateRow(id, field, value)}
          onRemove={(id) => store().removeRow(id)}
          onAddEmpty={() => store().addEmptyRow()}
          onUndo={() => store().removeLastRow()}
          onClear={() => store().clearRows()}
        />

        <div
          role="status"
          aria-live="polite"
          className={validation.status === "invalid" ? "notice notice--error" : "notice"}
          data-testid="boundary-status"
        >
          {validation.status === "valid" ? (
            <p>Boundary looks good · about {formatArea(validation.areaM2)}.</p>
          ) : (
            validation.messages.map((message) => <p key={message}>{message}</p>)
          )}
        </div>

        <TextField
          label="Site name"
          value={name}
          onChange={(e) => store().setName(e.target.value)}
          maxLength={200}
          placeholder="e.g. Home shamba"
          autoComplete="off"
        />

        {create.isError ? (
          <p role="alert" className="form__error">
            Could not create the site
            {create.error instanceof ApiError ? `: ${create.error.userMessage}` : "."}
          </p>
        ) : null}

        <div className="form__actions">
          <button type="button" className="btn" onClick={() => store().setStep("country")}>
            Back
          </button>
          <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
            {create.isPending ? "Creating…" : "Create site"}
          </button>
        </div>
      </form>

      <div className="site-map__canvas setup-map">
        <SetupMap
          countryCode={countryCode}
          points={points}
          onAddPoint={(point) => store().addPoints([point])}
        />
        <SetupAttribution />
      </div>
    </div>
  );
}
