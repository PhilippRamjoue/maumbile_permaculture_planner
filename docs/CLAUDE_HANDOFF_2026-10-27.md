# Claude handoff — 27 October 2026

The owner requested an audit, implementation of its fixes, and a local commit. Nothing has been
pushed, released or deployed. The hosted instance still reports v0.1.4.

## What Codex changed

- Revision-guarded, atomic design saves; stale-tab rejection and local draft download.
- Boundary autosave and truthful save/error status; save-before-export and Save and leave.
- Tile-session renewal, coordination of refresh across tabs, interrupted-terrain retry.
- Share-token log redaction, corrected asset responses/caching, bounded expensive work.
- Site settings, pagination, setup-draft recovery, boundary in GeoJSON, optional SMTP recovery.
- Regression coverage, release verification gate and rollout documentation.

Details: [audit fixes and rollout](AUDIT_FIXES_2026-10-26.md). The original findings are in
[the audit](AUDIT_2026-10-26.md).

## Important contracts to preserve

The editor now uses `GET/PUT /api/v1/plans/{id}/design`. Reads return a consistent document;
writes require `expected_revision` and atomically update changed features/deletions, layers and/or
goals. Each editor serializes its writes. Once protected saving is used, old unversioned
feature/layer/goal writes return 409; do not restore the old separate layer-PATCH save flow.
Update the document query cache after saves so reopening a plan does not resurrect an old snapshot.

New additive migrations: `0011_plan_revision`, `0012_password_recovery`. Do not reset or remove any
existing local database volume, especially `permaculture-verify`. Backend integration tests use
disposable Testcontainers databases.

## Your unfinished work

Your existing **adding versus editing panel separation / Back to adding** work is deliberately
left uncommitted so you can finish it. Remaining working-tree changes are in:

- `focus/ElementsPanel.tsx`, `FunctionsPanel.tsx`, `SectorsPanel.tsx`, `ZonesPanel.tsx`, `common.tsx`
  under `frontend/src/features/design-editor/`;
- `frontend/src/index.css` and the two original design-editor / footprint browser specs.

Codex's small placement-label, invalid-status styling and save-endpoint test adjustments in the
mixed files belong to the audit commit; keep those while finishing your panel changes. The new
audit browser test does not depend on Back to adding being present.

## Validation and next steps

The combined working tree passed **391 frontend tests**, **226 backend tests** (one opt-in live
DEM test skipped), **11 built-container browser tests**, lint/type/contract checks and builds.
On October 27, the staged commit was also checked independently of your pending changes:
frontend lint/build, all **391 unit tests** and all **11 built-container browser tests** passed.
Finish the panel task, inspect the remaining diff, and rerun the relevant frontend/browser checks
before committing your work. The owner can then review the combined result for release.

Before deployment: back up production, publish matching backend/frontend versions and deploy
together. Password recovery requires SMTP variables and `APP_PUBLIC_ORIGIN` in Coolify; no real
email was sent during testing. Actual outer-proxy log settings and the private support contact
still need operator configuration. Larger mobile redesign and polygon-weighted terrain statistics
remain recommendations, not completed features.
