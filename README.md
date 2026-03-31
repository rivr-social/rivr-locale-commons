# Rivr Locale Commons

Standalone Rivr locale commons app and deployment guide.

This repo is the sovereign locale-scale distribution for a community commons that wants its own Rivr home surface for locale-governed activity, resources, events, projects, and map context.

## Goal

Someone should be able to:

1. clone this repo,
2. provision the PM Core host stack,
3. deploy the locale commons app,
4. bind the instance into the federation,
5. expose locale-specific UI and mutations,
6. keep it updated from upstream releases.

## Required PM Core Links

You need the host/foundation stack first.

- PM Core: `https://github.com/peermesh/pm-core`
- Docker Lab / host deployment base: `https://github.com/peermesh/docker-lab`

Recommended reading before deployment:

- PM Core repo: `https://github.com/peermesh/pm-core`
- Docker Lab repo: `https://github.com/peermesh/docker-lab`
- Current upstream PM Core main branch: `https://github.com/peermesh/pm-core/tree/main`

## What PM Core Provides

PM Core / Docker Lab is the base host layer:

- Traefik / ingress
- PostgreSQL
- Redis
- MinIO / S3-compatible object storage
- secrets management patterns
- container orchestration layout
- standard domain wiring

Rivr Locale Commons sits on top of that base.

## What Is In This Repo

This repo contains the locale commons app itself, not the entire Rivr monorepo:

- Next.js locale app under `src/`
- database schema and migrations under `src/db/`
- federation routing and resolution code under `src/lib/federation/`
- map and sync scripts under `src/scripts/`
- a standalone `Dockerfile`
- example compose and env files
- operator docs under `docs/`

You do not need the full Rivr monorepo to build or run this repo.

## Spatial model

The locale commons lives inside a larger bioregional fabric and should be able to work with:

- hydrological layers
- terrestrial layers
- cultural layers

It is authoritative for locale-scale commons state, not for every person or every upstream bioregional aggregate.

## Docs

- Quick start: `docs/QUICK_LOCALE_COMMONS.md`
- Full deploy runbook: `docs/LOCALE_COMMONS_DEPLOY_RUNBOOK.md`

## Notes

- The PM Core links above are required because this app assumes the surrounding storage/network/DB foundation exists.
- The long-term product goal is guided setup from Rivr itself, but this repo is the standalone install target.
