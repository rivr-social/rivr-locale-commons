#!/bin/sh
# RIVR module install hook — validate prerequisites before first start. Idempotent.
set -eu
MOD_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
MOD_ID="$(basename "$MOD_DIR")"
echo "[$MOD_ID:install] validating $MOD_DIR"
: "${INSTANCE_SLUG:?INSTANCE_SLUG required (set in .env)}"
SECRETS_DIR="${SECRETS_DIR:-/opt/pm-core/secrets}"
for s in db_url redis_url; do
  f="$SECRETS_DIR/$INSTANCE_SLUG/$s"
  [ -s "$f" ] || { echo "[$MOD_ID:install] ERROR: missing secret $f"; exit 1; }
done
[ -n "${AUTH_SECRET:-}" ] || echo "[$MOD_ID:install] WARN: AUTH_SECRET unset in .env"
echo "[$MOD_ID:install] OK"
exit 0
