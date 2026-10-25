import type { DesignFeature } from "../../../entities/planning";
import { formatArea, formatLength } from "../../../shared/format";
import { formatSize, orientedSize, type Measurement } from "../measure";

/**
 * How big the selected shape is, plainly, or the numbers of a measuring drawing in progress; a
 * selected shape can also be checked by the server. Shown only when there is something to say.
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
  const size = selected ? orientedSize(selected.geometry) : null;
  return (
    <div className="editor-measurement" aria-label="Measurement">
      <h2>{selected ? "Size" : "Measurements"}</h2>
      {measurement ? (
        <>
          {size && (
            <p className="editor-measurement__size" aria-label="Size">
              {formatSize(size)}
            </p>
          )}
          {measurement.area_m2 > 0 ? (
            <>
              <p>{formatArea(measurement.area_m2)}</p>
              <p>
                {formatLength(measurement.length_m)} {selected ? "all the way round" : "around"}
              </p>
            </>
          ) : (
            <p className="editor-measurement__size">{formatLength(measurement.length_m)} long</p>
          )}
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
