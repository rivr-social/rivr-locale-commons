# Locale Commons Deploy Runbook

Use this repo to deploy a sovereign locale commons instance.

Required:

- PM Core / Docker Lab host foundation
- PostgreSQL with `postgis`, `vector`, and `pg_trgm`
- real `DATABASE_URL`
- real `AUTH_SECRET`

Core env:

- `INSTANCE_TYPE=locale`
- `INSTANCE_ID=<uuid>`
- `INSTANCE_SLUG=<slug>`
- `INSTANCE_NAME=Rivr Locale Commons`
- `REGISTRY_URL=<global registry url>`
- `NEXTAUTH_URL=<public url>`
- `NEXT_PUBLIC_BASE_URL=<public url>`

Verification:

- `/api/health`
- `/api/federation/status`
- `/api/app-release`
- locale UI routes load
