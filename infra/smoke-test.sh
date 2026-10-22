#!/usr/bin/env bash
# Smoke test for the deploy stack.
#
#   infra/smoke-test.sh              Local: build + start a THROWAWAY stack, check it, tear it down.
#   infra/smoke-test.sh --remote URL Deployed: HTTP checks against the public URL
#                                    (add SMOKE_AUTH=1 to also register a test user and log in).
#
# Local mode only ever touches a compose project named "permaculture-smoke-<random>" on ports
# 25432/28000/28080 (override with SMOKE_DB_PORT / SMOKE_BACKEND_PORT / SMOKE_FRONTEND_PORT).
# It never uses the permaculture-verify project or any existing volume, and `down -v` is only
# issued for that generated project name. Set SMOKE_KEEP=1 to leave the stack running.
set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash on Windows must not rewrite /app/... container paths

cd "$(dirname "$0")"

pass=0
fail=0
check() { # check "<description>" <command...>
  local desc="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "  ok    $desc"
    pass=$((pass + 1))
  else
    echo "  FAIL  $desc"
    fail=$((fail + 1))
  fi
}
body_contains() { curl -fsS --max-time 15 "$1" | grep -q "$2"; }
status_is() { [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$2")" = "$1" ]; }
header_present() { curl -fsS --max-time 15 -D - "$1" | grep -qi "^x-request-id:"; }

run_public_checks() { # run_public_checks <frontend-base-url>
  local base="${1%/}"
  echo "Frontend + API proxy at $base"
  check "GET / serves the SPA" body_contains "$base/" '<div id="root"'
  check "GET /api/v1/regions/KE/profile is proxied to the backend" \
    body_contains "$base/api/v1/regions/KE/profile" '"KE"'
  check "unauthenticated /api/v1/auth/me is 401 (auth wired up)" \
    status_is 401 "$base/api/v1/auth/me"
  if [ "${SMOKE_AUTH:-0}" = "1" ]; then
    local jar email pw
    jar="$(mktemp)"
    email="smoke-$(date +%s)-$RANDOM@example.com"
    pw="smoke-$(date +%s)-$RANDOM-pw"
    check "register" curl -fsS --max-time 20 -X POST "$base/api/v1/auth/register" \
      -H 'Content-Type: application/json' -d "{\"email\":\"$email\",\"password\":\"$pw\"}"
    check "login sets session cookies" curl -fsS --max-time 20 -c "$jar" \
      -X POST "$base/api/v1/auth/login" \
      -H 'Content-Type: application/json' -d "{\"email\":\"$email\",\"password\":\"$pw\"}"
    check "authenticated /auth/me" curl -fsS --max-time 15 -b "$jar" "$base/api/v1/auth/me"
    rm -f "$jar"
  fi
}

summary() {
  echo "Result: $pass passed, $fail failed"
  [ "$fail" -eq 0 ]
}

if [ "${1:-}" = "--remote" ]; then
  [ -n "${2:-}" ] || { echo "usage: $0 --remote https://your-domain" >&2; exit 2; }
  run_public_checks "$2"
  summary
  exit $?
fi

# ---- local throwaway stack ---------------------------------------------------------------------
PROJECT="permaculture-smoke-$(date +%s)-$RANDOM"
case "$PROJECT" in
  permaculture-smoke-*) ;;
  *) echo "refusing: unexpected project name $PROJECT" >&2; exit 2 ;;
esac

rand_hex() { openssl rand -hex "$1" 2>/dev/null || head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }
export POSTGRES_PASSWORD="$(rand_hex 16)"
export APP_SECRET_KEY="$(rand_hex 32)"
export POSTGRES_USER=postgres POSTGRES_DB=permaculture
export SMOKE_DB_PORT="${SMOKE_DB_PORT:-25432}"
export SMOKE_BACKEND_PORT="${SMOKE_BACKEND_PORT:-28000}"
export SMOKE_FRONTEND_PORT="${SMOKE_FRONTEND_PORT:-28080}"
export SMOKE_AUTH=1

COMPOSE=(docker compose -p "$PROJECT" -f docker-compose.yml -f docker-compose.smoke.yml)

teardown() {
  if [ "${SMOKE_KEEP:-0}" = "1" ]; then
    echo "SMOKE_KEEP=1: leaving project $PROJECT running; remove it with:"
    echo "  docker compose -p $PROJECT -f docker-compose.yml -f docker-compose.smoke.yml down -v"
    return
  fi
  echo "Tearing down $PROJECT (down -v on this throwaway project only)"
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap teardown EXIT

echo "Starting throwaway stack $PROJECT (backend :$SMOKE_BACKEND_PORT, frontend :$SMOKE_FRONTEND_PORT)"
"${COMPOSE[@]}" config -q
if ! "${COMPOSE[@]}" up --build -d --wait --wait-timeout 420; then
  echo "Stack failed to become healthy; recent logs:" >&2
  "${COMPOSE[@]}" ps >&2 || true
  "${COMPOSE[@]}" logs --no-color --tail 60 >&2 || true
  exit 1
fi

api="http://127.0.0.1:$SMOKE_BACKEND_PORT"
echo "Backend at $api"
check "GET /healthz is ok" body_contains "$api/healthz" '"ok"'
check "GET /readyz is ready (database reachable)" body_contains "$api/readyz" '"ready"'
check "responses carry an X-Request-ID" header_present "$api/healthz"
alembic_at_head() { "${COMPOSE[@]}" exec -T backend /app/.venv/bin/alembic current | grep -q '(head)'; }
check "migrations are at head" alembic_at_head
run_public_checks "http://127.0.0.1:$SMOKE_FRONTEND_PORT"
backend_logs_json() { "${COMPOSE[@]}" logs --no-color --tail 50 backend | grep -q '"event": "request"'; }
check "backend emits structured JSON logs" backend_logs_json
summary
