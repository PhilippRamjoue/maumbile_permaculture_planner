# Audit fixes — 26 October 2026

Implementation follow-up to [the audit](AUDIT_2026-10-26.md). All changes are local and unreleased;
the public Coolify deployment has not been changed. The existing Claude panel work was retained
and integrated; its adding/editing separation remains in place.

## Findings addressed

| Finding | Implementation |
|---|---|
| F01 — stale design writes | Consistent document reads; atomic revision-guarded writes; serialized goal/feature saves; old unversioned writes blocked after protected saving; conflict draft download; immediate-reopen cache consistency |
| F02 — share tokens in logs | Backend path redaction on success/error; nginx share-route access/error logging disabled; reset-page URL logging also suppressed |
| F03 — boundary save feedback | Valid-boundary autosave, timestamp precondition, global invalid/error state, mode-switch flush, modal Save and leave |
| F04 — interrupted terrain | Stale jobs exposed as interrupted by GET, polling stops and UI offers retry; existing generation fencing preserved |
| F05 — expired tile sessions | Protected tiles use API refresh/replay; map failures have an explicit retry action |
| F06 — tab refresh race | Origin-wide Web Lock, session recheck after acquiring it, existing in-tab single-flight retained; browsers without Web Locks retain the previous in-tab behavior |
| F07 — inaccurate terrain label | Labels now describe available bbox data and neighboring land. Polygon-weighted statistics remain future work |
| F08 — incomplete GeoJSON | Versioned site foreign member includes the land boundary; normal feature-array compatibility retained |
| F09 — exporting pending work | Downloads/share creation flush all save domains first; invalid/failed saves prevent exporting an apparently current document |
| F10 — capacity/proxy hardening | Registration throttling; bounded limiter keys; four concurrent hashes, two renders, two terrain jobs; trusted-chain nginx processing followed by replacement of downstream forwarding headers |
| F11 — lost setup drafts | Account-scoped recovery in tab session storage, reload/navigation protection, sign-out cleanup |
| F12 — missing management/recovery | Site settings allow rename/delete; SMTP recovery UI/API with one-time tokens, throttling and immediate invalidation of old sessions |
| F13 — hidden older records | Load-more pagination for sites and plans |

Additional improvements: changed-feature/layer payloads replace repeated whole-document and layer
PATCH writes; slow imagery fetches and export rendering release DB connections first; static asset
caching is explicit; release publication waits for CI verification. The expiry maintenance command
counts first and deletes only with `--apply`.

## Rollout

1. Take and verify an off-host database backup before applying migrations. No real database was
   reset during implementation or tests.
2. Release backend and frontend together after CI succeeds. Pin Coolify's `MAUMBILE_VERSION` to
   that completed release rather than deploying during publication of mutable `latest` tags.
3. Migrations run on backend startup: `0011_plan_revision`, then `0012_password_recovery`. Both are
   additive. Users should save/copy drafts in old tabs and reload the app after deployment.
4. Verify the actual Coolify edge appends the real remote client to its forwarding chain. The
   checked-in nginx trusts Docker proxy addresses in `172.16.0.0/12` and `10.0.0.0/8`, walks the
   chain from the right and overwrites the header sent downstream. Restrict those ranges to the
   actual proxy network where appropriate; do not expose the frontend directly to untrusted
   callers claiming to be a trusted proxy. Keep the API internal.
5. Review outer-proxy log configuration for share/reset URLs. Application/nginx changes cannot
   redact old logs or a separate Coolify/Traefik log sink. Review existing log access/retention
   before deciding whether existing share links need rotation.

### Enable password recovery

Set these in Coolify, not git:

- `APP_PUBLIC_ORIGIN=https://maumbile.ecosoul.tech`
- `APP_SMTP_HOST`, `APP_SMTP_PORT` (587 by default; 465 uses implicit TLS)
- `APP_SMTP_FROM`, and `APP_SMTP_USERNAME` / `APP_SMTP_PASSWORD` if the sender requires authentication

Recovery is visibly unavailable until SMTP host, sender and an HTTPS public origin are configured.
Port 587 uses STARTTLS with certificate verification; port 465 also verifies certificates. Tests
use a fake sender; no real recovery email was sent. Verify delivery to an operator-owned account
after configuring the sender, and publish a real private support contact in the privacy notice.

Successful password reset revokes old refresh tokens and changes a token version so existing access
cookies stop working immediately. Existing accounts/tokens remain compatible before a reset.

### Expired-row maintenance

Inside the backend container:

```sh
/app/.venv/bin/python scripts/prune_expired.py          # counts only
/app/.venv/bin/python scripts/prune_expired.py --apply  # removes expired auth/reset/cache rows
```

The command does not remove sites, plans or active sessions. Schedule it through the operator's
normal maintenance process if needed; this task does not create a scheduled job.

## Verification

Regression coverage includes stale writes/deletion resurrection, atomic failure rollback, legacy
client fencing, site timestamp conflicts, token-log redaction on success/404/500, recovery-token
single use/session invalidation, bounded capacity/throttle state, interrupted-terrain retry,
independent-tab session renewal, failed save-before-export, draft recovery/account isolation,
pagination and site rename. Browser checks run against separately built containers and a new
throwaway database, preserving all existing local stacks.

Final local verification:

- Frontend: **391 tests passed** in 40 files; ESLint, TypeScript and production build passed.
- Backend: **226 passed, 1 skipped**; Ruff lint/format, mypy and generated-contract checks passed.
- Built-container Chromium acceptance: **11 passed** in 51.6 seconds, including two-tab conflicts,
  immediate reopen, expired tile sessions, invalid/valid boundary status/autosave and static caching.
- Both Docker images built and the isolated Compose services reached healthy state.
- Synthetic share-path checks: no raw token in either nginx or application logs; redacted path
  present in application diagnostics; shared page uses `no-store` and `no-referrer`.
- Expiry maintenance dry run completed without deleting rows.

The temporary verification services were stopped after testing, preserving their database volume;
existing local stacks and the production deployment were left untouched. The opt-in live DEM test
and real SMTP delivery remain outside offline regression coverage. Existing rasterio deprecation
and jsdom canvas warnings remain non-failing, and the map bundle size warning is still visible.

## Remaining recommendations

This fixes the audit's concrete code paths; it does not include a new mobile bottom-sheet editor,
place-search provider, polygon-weighted terrain analysis, import/restore UI for draft downloads,
full-document undo compaction or a durable worker queue. The existing large map bundle warning
remains visible. Production backup/restore verification, upstream log redaction, SMTP credentials
and the support contact require operator configuration. No production release was created or deployed.
