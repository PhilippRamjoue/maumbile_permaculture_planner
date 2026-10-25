#!/usr/bin/env bash
# Back up or restore the Maumbile PostgreSQL database (the only place user data lives).
#
#   infra/backup.sh                    Write a compressed dump to $BACKUP_DIR, verify it, prune old ones.
#   infra/backup.sh restore FILE --yes Restore FILE into the running db container (DESTRUCTIVE: it
#                                      replaces the current contents). Stop the backend first.
#
# Run it on the server that hosts the stack (cron, systemd timer or a Coolify scheduled task on the
# host). It finds the db container by its Compose label, so it works for Coolify's generated project
# names too; if several stacks run on the host set DB_CONTAINER (see `docker ps`). Credentials are
# never needed here: pg_dump/pg_restore run inside the container over its local socket.
#
#   BACKUP_DIR        where dumps are written (default ./backups next to this script)
#   BACKUP_KEEP_DAYS  delete dumps older than this many days (default 30; 0 keeps everything)
#   DB_CONTAINER      container name/id of the db service (default: auto-detect)
#
# A backup that stays on the same server is not a backup: copy $BACKUP_DIR off-site as well
# (see docs/OPERATIONS.md).
set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash on Windows must not rewrite /var/... container paths

cd "$(dirname "$0")"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"

die() { echo "error: $*" >&2; exit 1; }

find_db_container() {
  if [ -n "${DB_CONTAINER:-}" ]; then echo "$DB_CONTAINER"; return; fi
  local ids
  ids="$(docker ps -q --filter 'label=com.docker.compose.service=db')"
  [ -n "$ids" ] || die "no running 'db' container found; set DB_CONTAINER"
  [ "$(echo "$ids" | wc -l)" -eq 1 ] || die "several 'db' containers are running; set DB_CONTAINER to one of: $(docker ps --filter 'label=com.docker.compose.service=db' --format '{{.Names}}' | tr '\n' ' ')"
  echo "$ids"
}

container="$(find_db_container)"
db_user="$(docker exec "$container" printenv POSTGRES_USER)"
db_name="$(docker exec "$container" printenv POSTGRES_DB)"

case "${1:-backup}" in
  backup)
    mkdir -p "$BACKUP_DIR"
    out="$BACKUP_DIR/maumbile-$(date -u +%Y%m%dT%H%M%SZ).dump"
    # Write to a temporary name so a failed run never leaves a truncated file that looks valid.
    docker exec "$container" pg_dump -U "$db_user" -d "$db_name" -Fc >"$out.partial"
    docker exec -i "$container" pg_restore --list <"$out.partial" >/dev/null ||
      { rm -f "$out.partial"; die "dump failed verification and was discarded"; }
    mv "$out.partial" "$out"
    echo "wrote $out ($(wc -c <"$out") bytes)"
    if [ "$BACKUP_KEEP_DAYS" -gt 0 ]; then
      find "$BACKUP_DIR" -name 'maumbile-*.dump' -mtime "+$BACKUP_KEEP_DAYS" -print -delete |
        sed 's/^/pruned /'
    fi
    ;;
  restore)
    file="${2:-}"
    [ -f "$file" ] || die "usage: backup.sh restore FILE --yes"
    [ "${3:-}" = "--yes" ] || die "restore replaces the current database contents; re-run with --yes to confirm"
    echo "restoring $file into database '$db_name' (container $container)"
    docker exec -i "$container" pg_restore -U "$db_user" -d "$db_name" \
      --clean --if-exists --no-owner --exit-on-error <"$file"
    echo "restore finished; redeploy or restart the backend so it reconnects cleanly"
    ;;
  *) die "usage: backup.sh [backup | restore FILE --yes]" ;;
esac
