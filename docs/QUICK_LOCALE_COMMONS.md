# Quick Locale Commons

1. Provision PM Core / Docker Lab first.
2. Clone `rivr-locale-commons`.
3. Copy `.env.example` to `.env` and set real secrets.
4. Set `INSTANCE_TYPE=locale`, `INSTANCE_ID`, `INSTANCE_SLUG`, and public URLs.
5. Preinstall `postgis`, `vector`, and `pg_trgm` in Postgres.
6. Run `pnpm install`.
7. Run `pnpm build`.
8. Deploy with the included `Dockerfile` or your PM Core compose stack.
