import type { DesignFeature } from "../../../entities/planning";
import { formatArea } from "../../../shared/format";
import type { Measurement } from "../measure";

/**
 * The numbers for the selected shape or for the measuring drawing in progress, with the server's
 * authoritative check for a selected shape. Shown only when there is something to measure.
 */
export function MeasurementPanel({
  measurement,
  selected,
  confirmed,
  confirming,
  confirmError,
  disabled,
  onConfirm,
}: {
  measurement: Measurement | null;
  selected: DesignFeature | undefined;
  confirmed: boolean;
  confirming: boolean;
  confirmError: string | null;
  disabled: boolean;
  onConfirm(): void;
}) {
  return (
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
        <p className="muted">Click on the map to start measuring.</p>
      )}
      <p className="muted">
        {selected && confirmed ? "Confirmed by server" : "Live geodesic estimate"}
      </p>
      {selected && (
        <button type="button" className="btn" disabled={confirming || disabled} onClick={onConfirm}>
          Confirm measurement
        </button>
      )}
      {confirmError && <p role="alert">{confirmError}</p>}
    </div>
  );
}
