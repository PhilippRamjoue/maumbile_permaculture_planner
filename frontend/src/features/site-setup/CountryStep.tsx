import { useEffect, useId, useState, type FormEvent } from "react";

import {
  countryContains,
  countryName,
  FEATURED_COUNTRIES,
  OTHER_COUNTRIES,
  suggestCountry,
} from "./countries";
import { parseCoordinateText } from "./geometry";
import { useSetupStore } from "./store";

interface CountryStepProps {
  countryCode: string | null;
  onCountryChange(code: string | null): void;
  onContinue(): void;
}

/** Step 1: which country is the land in? It decides which map sources the server uses. */
export function CountryStep({ countryCode, onCountryChange, onContinue }: CountryStepProps) {
  const selectId = useId();
  const probeId = useId();
  const [probe, setProbe] = useState("");

  const parsed = probe.trim() === "" ? null : parseCoordinateText(probe, "lat-lng");
  const probePoint = parsed && parsed.errors.length === 0 ? parsed.points[0] : undefined;
  // Country boxes overlap (Kenya and Tanzania share a border region): a coordinate inside the
  // country already chosen is never second-guessed.
  const fitsChosen = probePoint && countryCode ? countryContains(countryCode, probePoint) : null;
  const suggestion = probePoint && fitsChosen !== true ? suggestCountry(probePoint) : null;

  // The map in step 2 opens on this coordinate, so you can find your land before adding corners.
  const [probeLng, probeLat] = probePoint ?? [];
  useEffect(() => {
    useSetupStore
      .getState()
      .setFocusPoint(
        probeLng === undefined || probeLat === undefined ? null : [probeLng, probeLat],
      );
  }, [probeLng, probeLat]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (countryCode) onContinue();
  }

  return (
    <form className="card form" onSubmit={submit} aria-labelledby="setup-step-title">
      <h2 id="setup-step-title">Step 1 of 2 · Where is your land?</h2>
      <div className="field">
        <label htmlFor={selectId}>Country</label>
        <select
          id={selectId}
          value={countryCode ?? ""}
          onChange={(e) => onCountryChange(e.target.value || null)}
          aria-describedby={`${selectId}-hint`}
        >
          <option value="">Choose a country…</option>
          <optgroup label="East Africa">
            {FEATURED_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="All other countries">
            {OTHER_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </optgroup>
        </select>
        <p id={`${selectId}-hint`} className="field__hint">
          The country decides which aerial imagery and map data we use for your site.
        </p>
      </div>

      <div className="field">
        <label htmlFor={probeId}>
          Paste one coordinate from your land (optional) — the map will open there
        </label>
        <input
          id={probeId}
          value={probe}
          onChange={(e) => setProbe(e.target.value)}
          placeholder="-1.2921, 36.8219"
          inputMode="decimal"
          autoComplete="off"
        />
        {probePoint && fitsChosen === true && countryCode ? (
          <p role="status" className="field__hint">
            ✓ That is inside {countryName(countryCode)}.
          </p>
        ) : suggestion ? (
          <p role="status" className="field__hint">
            That looks like {countryName(suggestion)}.{" "}
            {suggestion === countryCode ? (
              "✓ Selected."
            ) : (
              <button
                type="button"
                className="btn btn--link"
                onClick={() => onCountryChange(suggestion)}
              >
                Use {countryName(suggestion)}
              </button>
            )}
          </p>
        ) : probePoint ? (
          <p role="status" className="field__hint">
            We can't tell the country from that coordinate. Please pick it from the list.
          </p>
        ) : null}
      </div>

      <div className="form__actions">
        <button type="submit" className="btn btn--primary" disabled={!countryCode}>
          Continue
        </button>
      </div>
    </form>
  );
}
