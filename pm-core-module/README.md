# rivr-locale — pm-core module

RIVR Locale Commons App as a first-class **pm-core module**. Runs on the pm-core foundation
(Traefik + TLS, Postgres, Redis, file-based secrets, `pmdl_*` networks).

## One module, many instances

Every per-instance value lives in `./.env` — the compose file hardcodes
nothing instance-specific. The same module directory runs any `locale` node:
change `DOMAIN`, `BASE_URL`, `INSTANCE_SLUG`, `INSTANCE_NAME`, the DB/redis
secrets, and `HOST_PORT`, and you have a different sovereign node.

## Install (outside operator)

1. **Drop in.** Copy this directory into your pm-core checkout at
   `<pm-core>/modules/rivr-locale/` (it `extends:` `../../foundation/docker-compose.base.yml`,
   so it must sit two levels under the foundation root).
2. **Source.** Provide the app image one of two ways:
   - **Pinned image (recommended):** set `RIVR_IMAGE=rivr-locale@sha256:<digest>` in
     `.env`. No build, no drift.
   - **Build from source:** clone/checkout https://github.com/rivr-social/rivr-locale-commons into `./src` (so
     `./src/Dockerfile` exists), then `up --build`.
3. **Configure.** `cp .env.example .env` and fill every REQUIRED value.
4. **Secrets.** Create the file-based secrets listed in `secrets-required.txt`
   under `${SECRETS_DIR}/<INSTANCE_SLUG>/` (default `/opt/pm-core/secrets/<slug>/`):
   ```sh
   mkdir -p /opt/pm-core/secrets/locale-commons
   printf 'postgresql://rivr:PW@postgres:5432/rivr_locale' > /opt/pm-core/secrets/locale-commons/db_url
   printf 'redis://:PW@redis:6379'                        > /opt/pm-core/secrets/locale-commons/redis_url
   # The app image runs as non-root (UID 1001 `nextjs`). Compose file-secrets
   # are bind-mounted with the host file's perms, so they MUST be readable by
   # that UID — use 644 (or 640 + a shared group). 600/root-only makes the
   # container's secret read fail ("Permission denied") and the app crash-loops.
   chmod 644 /opt/pm-core/secrets/locale-commons/*
   ```
   > **Migrating from our overlays?** The live `examples/rivr` overlays use a
   > flat bare-password secret `rivr_db_password` (+ `DATABASE_HOST/PORT/NAME/USER`
   > env). This module uses the cleaner full-URL convention — put the whole URL in
   > `db_url`. Convert with:
   > ```sh
   > printf 'postgresql://%s:%s@%s:%s/%s' "$DB_USER" "$(cat rivr_db_password)" \
   >        "${DB_HOST:-postgres}" "${DB_PORT:-5432}" "$DB_NAME" > db_url
   > ```
   > (URL-encode the password if it has reserved chars.) `bootstrap/start.sh`
   > still accepts a mounted `rivr_db_password` if you keep the flat model.
5. **Networks.** Ensure the external foundation networks exist:
   `pmdl_proxy-external`, `pmdl_db-internal`, `pmdl_app-internal`.
6. **Launch** via the pm-core module lifecycle (Core), which runs
   `hooks/install.sh` → `hooks/start.sh` and then brings up the compose service.

## Replicas / non-authoritative instances (`RIVR_DISABLE_CRON`)

When you run a second copy of an instance that **shares a database** with the
authoritative one (a read/serve-only twin during a pm-core cutover, a replica,
etc.), set `RIVR_DISABLE_CRON=1` in that copy's `.env`. On the global app type
the internal cron scheduler then does **not** start, so the twin cannot
double-process shared data (burn `thanks-demurrage` currency, run federation
sync/deliver twice). The secret-gated `/api/cron/*` routes stay callable, so an
external scheduler can still drive the authoritative instance. This sovereign
app type has no internal scheduler — it drives `/api/cron/*` from an external
scheduler — so for a twin here, simply don't wire an external cron to it (the
flag is honored/reserved for parity with the global module). Leave the flag
**unset** on the single authoritative instance.

## Container hardening

The compose service runs with `no-new-privileges`, `cap_drop: [ALL]`, a
`read_only` root filesystem, and `tmpfs` for the only runtime-writable paths
(`/tmp`, `/app/.next/cache`). These were proven on this same image by the live
host module and the pm-core Stage 2 pilot; keep them.

## Health

The container serves `GET /api/health` (DB-checked). `hooks/health.sh` and the
compose healthcheck both probe it.

## Files

| File | Purpose |
|---|---|
| `module.json` | Schema-validated manifest (`requires`/`provides`/`security`/`lifecycle`/`config`). |
| `docker-compose.yml` | Extends `_service-standard`; Traefik labels; file secrets; `pmdl_*` nets. |
| `.env.example` | Every operator-set variable, documented. |
| `secrets-required.txt` | The file-based secrets to place under `${SECRETS_DIR}`. |
| `bootstrap/start.sh` | Container entrypoint: loads secrets → migrations → `node server.js`. |
| `hooks/` | Host-side pm-core lifecycle hooks (install/start/stop/health/uninstall). |
