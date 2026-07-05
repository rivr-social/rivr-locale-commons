#!/bin/sh
# RIVR module start hook (host-side; logs only). Real migrate runs in the
# container entrypoint (bootstrap/start.sh) and the health check gates on it.
set -eu
MOD_ID="$(basename "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)")"
echo "[$MOD_ID:start] instance=${INSTANCE_SLUG:-?} domain=${DOMAIN:-?} base=${BASE_URL:-?}"
exit 0
