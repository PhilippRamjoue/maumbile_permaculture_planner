import { Link } from "react-router-dom";

import { LegalPage, REPOSITORY_URL, type LegalSection } from "./LegalPage";

/** Mirrors docs/TERMS.md; change both together. */
const sections: LegalSection[] = [
  {
    heading: "What Maumbile is",
    body: (
      <p>
        Maumbile is a free, non-commercial public-good tool for planning permaculture sites on a
        map. It is open-source software under the{" "}
        <a href={`${REPOSITORY_URL}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">
          GNU AGPL-3.0
        </a>
        . This free service has no ads, no paid tier and no sale of data.
      </p>
    ),
  },
  {
    heading: "No warranty, no professional advice",
    body: (
      <>
        <p>
          The service and the software are provided &ldquo;as is&rdquo;, without warranty of any
          kind, and may change, be interrupted or be discontinued at any time. Maumbile is a
          planning aid, not a survey, legal boundary, engineering, hydrological or safety document.
          Distances, areas and slopes come from satellite imagery and ~30 m elevation data, so they
          are approximate. Check them on the ground before you build, dig, divert water or rely on a
          boundary.
        </p>
        <p>
          To the extent the law allows, the operator and contributors are not liable for any loss
          arising from using the service or its outputs. Nothing here limits liability that cannot
          be limited by law (for example for intent, or injury to life or health).
        </p>
      </>
    ),
  },
  {
    heading: "Your account and your content",
    body: (
      <ul>
        <li>
          You need an account (an email address and a password) to save sites and designs. Keep your
          password private.
        </li>
        <li>
          Your designs are yours. You give the operator only the permission needed to store them and
          show them to you, and to anyone you give a share link to.
        </li>
        <li>Do not put unlawful content or other people&apos;s personal data in your plans.</li>
        <li>
          You can export every plan as GeoJSON at any time and ask for your data to be deleted (see
          the <Link to="/privacy">privacy notice</Link>). Keep your own copies: this free service
          has no backup guarantee.
        </li>
      </ul>
    ),
  },
  {
    heading: "Acceptable use",
    body: (
      <p>
        Do not attack, overload or probe the service, try to access other people&apos;s data, or use
        the imagery proxy to bulk-download map tiles. Accounts that do may be limited or suspended.
      </p>
    ),
  },
  {
    heading: "Third-party map and elevation data",
    body: (
      <>
        <p>
          Maumbile shows data from other providers (Esri World Imagery, Sentinel-2 cloudless,
          Copernicus DEM, OpenStreetMap and others), each under its own license and terms. They are
          listed with their credits on the <Link to="/credits">Data sources &amp; credits</Link>{" "}
          page. Keep the attribution when you share exports.
        </p>
        <p>
          Esri World Imagery is the default because it has the best resolution in the project&apos;s
          target regions, and is used here for a free, non-commercial public-good service. If you
          use Maumbile or its outputs commercially, you are responsible for obtaining the licenses
          those providers require. Esri imagery in particular needs its own license for commercial
          use.
        </p>
      </>
    ),
  },
  {
    heading: "Open source and contact",
    body: (
      <p>
        If you offer a modified version of Maumbile to others over a network, the AGPL-3.0 requires
        you to make your source available. Terms may be updated; the date above changes when they
        are. Questions, abuse reports and data requests: use the contact published on the{" "}
        <a href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">
          project&apos;s GitHub page
        </a>
        .
      </p>
    ),
  },
];

export function TermsPage() {
  return <LegalPage title="Terms of use" updated="2026-10-25" sections={sections} />;
}
