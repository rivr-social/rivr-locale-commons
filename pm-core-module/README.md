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
   chmod 600 /opt/pm-core/secrets/locale-commons/*
   ```
5. **Networks.** Ensure the external foundation networks exist:
   `pmdl_proxy-external`, `pmdl_db-internal`, `pmdl_app-internal`.
6. **Launch** via the pm-core module lifecycle (Core), which runs
   `hooks/install.sh` → `hooks/start.sh` and then brings up the compose service.

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
