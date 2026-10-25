# Privacy notice

_Last updated: 2026-10-25. This describes the free hosted instance of Maumbile. A self-hosted copy
is run by whoever hosts it; this file is a starting point for them. The in-app page at `/privacy`
mirrors it (`frontend/src/features/legal/`)._

Short version: we keep what the app needs to work, we do not track you, we do not sell or share your
data, and you can export or delete it.

## What we store

| Data | Why | Notes |
|---|---|---|
| Email address, optional display name | Your account and sign-in | Visible only to you and the operator. |
| Password | Sign-in | Stored only as an **argon2 hash**, never in plain text. |
| Your sites (name, country, boundary coordinates) and designs (zones, sectors, elements, layers, goals) | The service itself | Your site coordinates can reveal where you live or farm; they are visible only to you, plus anyone you give a **share link** for a plan (links are unguessable, stored hashed, and can be revoked with *Stop sharing*). |
| Derived terrain data for your sites | Contours and slope overlays | Computed from public elevation data. |
| Session cookies | Keep you signed in | Two `httpOnly` cookies; strictly necessary, so no consent banner is shown. |
| Server logs | Operating and debugging the service | Request method, path, status, duration, a request id and your **IP address**; kept in rotating container logs on the server (about 50 MB per service), not in the database. |

We use **no analytics, advertising, tracking cookies or third-party scripts**, and we do not sell or
share your data. Cached satellite tiles are public imagery, not personal data.

## Third parties you connect to

- While you place your site on the map during **site setup**, your browser loads Esri World Imagery
  tiles **directly from Esri's servers**, so Esri sees your IP address and the area you look at.
  Once a site exists, imagery is fetched through our server's proxy, so the provider sees our server,
  not you. Elevation data is fetched by our server from the public Copernicus DEM on AWS. Those
  providers have their own privacy policies (see **Data sources & credits** in the app).
- Hosting: the instance runs on a server operated by the instance's operator. No other processors
  receive your data.

## Your rights

- **Export:** every plan can be downloaded as GeoJSON (*Export & share* in the editor), and also as
  PNG/PDF.
- **Delete:** deleting a site or plan in the app removes it from your account straight away (the
  record is marked deleted and then hidden). To have your **account and all its data permanently
  erased**, ask the operator (contact below); this is done on request, and backups are overwritten
  within about 30 days.
- **Access and correction:** you can see and edit your data in the app; for anything else, ask.
- If you are in the EU/EEA/UK you also have the rights granted by the GDPR, including to complain to
  your data-protection authority. The legal basis is performing the service you asked for
  (Art. 6(1)(b)) and the operator's interest in running it securely (Art. 6(1)(f)).

## Children

Maumbile is not directed at children under 16.

## Changes and contact

Changes are announced in the [changelog](../CHANGELOG.md). Requests about your data: use the contact
published on the project's GitHub page, or open an issue at
<https://github.com/PhilippRamjoue/maumbile_permaculture_planner/issues> (public, so do not include personal
data; ask for a private channel instead). See also the [Terms](TERMS.md).

<!-- Operator note: add a direct contact email here before announcing the hosted instance. -->
