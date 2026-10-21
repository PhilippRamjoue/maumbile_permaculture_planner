import { Link } from "react-router-dom";

import { SETUP_BASEMAP_ATTRIBUTION } from "./map/setupRegistry";

/** Credit for the setup map's base map; always visible, like the site map's imagery credit. */
export function SetupAttribution() {
  return (
    <footer className="map-attribution" aria-label="Map attribution">
      <span>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          {SETUP_BASEMAP_ATTRIBUTION}
        </a>
      </span>
      <Link to="/credits">Data sources &amp; credits</Link>
    </footer>
  );
}
