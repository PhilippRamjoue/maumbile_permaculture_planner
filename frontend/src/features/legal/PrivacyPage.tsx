import { Link } from "react-router-dom";

import { LegalPage, REPOSITORY_URL, type LegalSection } from "./LegalPage";

/** Mirrors docs/PRIVACY.md; change both together. */
const sections: LegalSection[] = [
  {
    heading: "In short",
    body: (
      <p>
        We keep what the app needs to work, we do not track you, we do not sell or share your data,
        and you can export or delete it.
      </p>
    ),
  },
  {
    heading: "What we store",
    body: (
      <ul>
        <li>Your email address and optional display name (your account).</li>
        <li>Your password, only as an argon2 hash, never in plain text.</li>
        <li>
          Your sites (name, country, boundary coordinates) and designs. Site coordinates can reveal
          where you live or farm; they are visible only to you and to anyone you give a share link
          for a plan. Share links are unguessable, stored hashed, and can be revoked with{" "}
          <em>Stop sharing</em>.
        </li>
        <li>
          Two strictly necessary <code>httpOnly</code> session cookies that keep you signed in, so
          no consent banner is shown.
        </li>
        <li>
          Server logs (request path, status, duration and your IP address) in rotating container
          logs on the server, not in the database.
        </li>
      </ul>
    ),
  },
  {
    heading: "No tracking",
    body: (
      <p>
        We use no analytics, advertising, tracking cookies or third-party scripts, and we do not
        sell or share your data.
      </p>
    ),
  },
  {
    heading: "Third parties you connect to",
    body: (
      <p>
        While you place your site on the map during site setup, your browser loads Esri World
        Imagery tiles directly from Esri&apos;s servers, so Esri sees your IP address and the area
        you look at. Once a site exists, imagery goes through our server&apos;s proxy, and elevation
        data is fetched by our server from the public Copernicus DEM. Those providers have their own
        privacy policies; see <Link to="/credits">Data sources &amp; credits</Link>.
      </p>
    ),
  },
  {
    heading: "Your rights",
    body: (
      <ul>
        <li>
          <strong>Export:</strong> download any plan as GeoJSON (also PNG or PDF) from{" "}
          <em>Export &amp; share</em> in the editor.
        </li>
        <li>
          <strong>Delete:</strong> deleting a site or plan in the app removes it from your account
          straight away. To have your account and all its data permanently erased, ask the operator
          (contact below); this is done on request and backups are overwritten within about 30 days.
        </li>
        <li>
          In the EU/EEA/UK you also have your GDPR rights, including to complain to your
          data-protection authority. Legal basis: providing the service you asked for (Art. 6(1)(b))
          and running it securely (Art. 6(1)(f)).
        </li>
        <li>Maumbile is not directed at children under 16.</li>
      </ul>
    ),
  },
  {
    heading: "Contact",
    body: (
      <p>
        Use the contact published on the{" "}
        <a href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">
          project&apos;s GitHub page
        </a>
        . See also the <Link to="/terms">terms of use</Link>.
      </p>
    ),
  },
];

export function PrivacyPage() {
  return <LegalPage title="Privacy notice" updated="2026-10-25" sections={sections} />;
}
