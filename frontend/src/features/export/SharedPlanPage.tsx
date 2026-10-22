import { useState } from "react";
import { useParams } from "react-router-dom";

import "./export.css";
import { sharedExportUrl } from "./api";

/** Public, read-only view of a shared plan: the rendered image plus download links. */
export function SharedPlanPage() {
  const { token = "" } = useParams();
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <section>
        <h1>Shared plan</h1>
        <p role="alert">This link is no longer valid. Ask the owner for a new one.</p>
      </section>
    );
  return (
    <section className="shared-plan">
      <h1>Shared plan</h1>
      <p className="muted">A read-only view shared by its owner.</p>
      <img
        className="shared-plan__image"
        alt="Plan with legend"
        src={sharedExportUrl(token, "png", true)}
        onError={() => setFailed(true)}
      />
      <p>
        Download: <a href={sharedExportUrl(token, "png")}>PNG</a>,{" "}
        <a href={sharedExportUrl(token, "pdf")}>PDF</a>,{" "}
        <a href={sharedExportUrl(token, "geojson")}>GeoJSON</a>
      </p>
    </section>
  );
}
