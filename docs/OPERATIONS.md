# Operations

Running a Maumbile instance day to day: backups, updates, monitoring and the knobs you may need.
First-time setup is in [`DEPLOY.md`](DEPLOY.md); releasing is in [`RELEASING.md`](RELEASING.md).
As always, configuration and secrets live in Coolify's environment variables (or your local
git-ignored `.env`), never in the repository.

## Backups (do this before you invite users)

All user data lives in one place: the PostgreSQL database in the `pgdata` Docker volume. Code,
images and configuration are reproducible; the database is not. Everything else (imagery tiles,
terrain) can be regenerated.

[`infra/backup.sh`](../infra/backup.sh) writes a compressed, verified `pg_dump` and prunes old
dumps. It needs no credentials (it runs `pg_dump` inside the db container) and finds the container
by its Compose label, so it works with Coolify's generated names.

```bash
# on the server that hosts the stack
cd /path/to/permaculture_planner/infra        # a clone of the repo is enough
BACKUP_DIR=/var/backups/maumbile ./backup.sh
#   wrote /var/backups/maumbile/maumbile-20261025T031500Z.dump (… bytes)
```

Variables: `BACKUP_DIR` (default `./backups`), `BACKUP_KEEP_DAYS` (default 30; `0` keeps all),
`DB_CONTAINER` (set it when several `db` containers run on the host; the script refuses to guess).

**Schedule it** with the host's cron, for example daily at 03:15:

```cron
15 3 * * * BACKUP_DIR=/var/backups/maumbile /path/to/permaculture_planner/infra/backup.sh >> /var/log/maumbile-backup.log 2>&1
```

**Copy it off the server.** A dump on the same disk does not survive a lost server. Sync
`BACKUP_DIR` somewhere else after each run, for instance with `rclone` or `rsync` to object storage
or another machine (encrypt it first if the destination is not yours: dumps contain emails, password
hashes and site coordinates). Coolify's own scheduled backups for database resources, or its
*Scheduled Tasks* feature, can run the same script's `pg_dump` command, but a Compose-defined `db`
is not a managed Coolify database, so the host cron above is the simplest reliable path.

Retention doubles as a privacy promise: the [privacy notice](PRIVACY.md) says erased accounts leave
backups within about 30 days, which matches the default `BACKUP_KEEP_DAYS=30`. If you keep backups
longer, change that text.

### Restore

Practise this once on a throwaway stack before you need it. Restoring **replaces** the current
database contents.

1. Stop writes: in Coolify stop the **backend** (and frontend) service, or `docker compose stop backend frontend`.
2. Restore (the db container must be running):

   ```bash
   cd infra
   ./backup.sh restore /var/backups/maumbile/maumbile-20261025T031500Z.dump --yes
   ```

3. Redeploy the whole resource so the backend reconnects and re-applies migrations if the dump is
   older than the code (`alembic upgrade head` is safe on any older revision).
4. Verify as in [`DEPLOY.md`](DEPLOY.md) §3: sign in, open a site, `infra/smoke-test.sh --remote https://your-domain`.

To rebuild a lost server: deploy a fresh stack with a new `POSTGRES_PASSWORD`, let it start with an
empty database, then restore as above. `APP_SECRET_KEY` does not have to match the old one; users
just sign in again.

## Updating

Releases are tagged and published as images to GHCR ([`RELEASING.md`](RELEASING.md)).

- **Self-hosting with the GHCR overlay:**
  `docker compose -f docker-compose.yml -f docker-compose.ghcr.yml pull && docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d`.
  Pin `MAUMBILE_VERSION=X.Y.Z` in `.env` to move only when you choose; read
  [`CHANGELOG.md`](../CHANGELOG.md) first.
- **Coolify, building from source (the setup in `DEPLOY.md`):** push or tag on the tracked branch
  and redeploy the whole resource.
- **Coolify, running the prebuilt images:** use Base Directory `/infra` and set the Docker Compose
  location to `/docker-compose.yml`, and add the overlay with the resource's custom start command if
  your Coolify version offers one (`docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d`),
  or point the resource at a compose file that merges both. Set `MAUMBILE_VERSION` in the resource's environment
  and redeploy to upgrade.

Before an upgrade that adds a migration: **run `backup.sh`**. Migrations are additive and run
automatically on start; rollback limits are in `DEPLOY.md` §5. Always redeploy the whole stack, not
just the backend (nginx resolves `backend` once at start).

## Monitoring

Nothing extra is required; the signals already exist (details and filter examples in
`DEPLOY.md` §7):

- **Container health.** `db` (`pg_isready`), `backend` (`/readyz`, which runs a database query) and
  `frontend` (HTTP 200) all have health checks; Coolify shows the resource as *Running (healthy)*
  or not and can notify you (enable notifications in Coolify for deployment and server events).
- **External uptime check.** Point any uptime monitor (UptimeRobot, Uptime Kuma, a cron `curl`) at
  `https://your-domain/api/v1/regions/attribution` or `/`; `infra/smoke-test.sh --remote URL` is the
  fuller read-only check you can run from cron.
- **Logs.** The backend writes one JSON object per line (with an `X-Request-ID` you can grep);
  containers rotate at 5 × 10 MB. These logs include client IP addresses (see the privacy notice).
- **Disk.** Watch the host disk: `pgdata` grows with users and the imagery tile cache, and Docker
  images/logs accumulate (`docker system df`).

## Tuning knobs

| Setting | Default | Notes |
|---|---|---|
| `APP_LOGIN_RATE_LIMIT_ATTEMPTS` | `10` | Login attempts per client IP and per email per minute (HTTP 429 beyond that). Raise it only on disposable test stacks, such as CI. It is per backend process, so keep a single backend replica. |
| `APP_TERRAIN_CONTOUR_INTERVAL_M` | `5.0` | Default contour spacing in metres. |
| `APP_CORS_ORIGINS` | `[]` | JSON array; the SPA is same-origin through nginx, so usually empty. |
| `APP_COOKIE_SECURE` | `true` | Leave on behind HTTPS. |

Switching the default imagery (for example from Esri to Sentinel-2 cloudless for a commercial
deployment) is a code-level change in `backend/app/modules/regions/seed.py`, not an environment
variable; see `DEPLOY.md` §6 and [`DATA_SOURCES.md`](DATA_SOURCES.md).

## Handling a data request (export or erasure)

Users can export their plans themselves (GeoJSON/PNG/PDF) and delete sites and plans in the app (a
soft delete: the rows are hidden, not removed). A request to **erase an account completely** is a
manual database operation, because there is no self-service account deletion yet. Take a backup
first, then run in the db container (replace the email; emails are stored lower-case):

```bash
docker exec -i <db-container> psql -U postgres -d permaculture <<'SQL'
BEGIN;
-- sites.owner_id has no foreign key to users; deleting a site cascades to its plans, features,
-- layers, share links and terrain results.
DELETE FROM sites WHERE owner_id = (SELECT id FROM users WHERE email = 'person@example.org');
-- refresh tokens cascade from the user row.
DELETE FROM users WHERE email = 'person@example.org';
COMMIT;
SQL
```

Confirm the person's identity from the account's email address before acting, and answer within
a month. Old backups age out under the retention above.
