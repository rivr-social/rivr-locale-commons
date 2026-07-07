FROM node:20-slim AS deps

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@8.15.9 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-rivr-locale,target=/pnpm/store pnpm install --frozen-lockfile

FROM node:20-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@8.15.9 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV AUTH_SECRET="build-placeholder"
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"

# Semantic parser v1 (NL IF/WHEN/THEN conditionals) rollout. Default "1" = ON:
# the composer uses src/lib/semantic/ instead of legacy parseNaturalLanguageV2.
# Override with --build-arg NEXT_PUBLIC_SEMANTIC_PARSER_V1=0.
ARG NEXT_PUBLIC_SEMANTIC_PARSER_V1="1"
ENV NEXT_PUBLIC_SEMANTIC_PARSER_V1=$NEXT_PUBLIC_SEMANTIC_PARSER_V1

RUN pnpm build

FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Standalone output only (Next traces the runtime node_modules it needs) — NOT
# the whole /app. Keeps the image ~1GB+ smaller; parity with global + group.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
RUN mkdir -p .next/cache && chown -R nextjs:nodejs .next/cache

# Runtime migration bits (standalone does not trace the migrate path)
COPY --from=builder --chown=nextjs:nodejs /app/src/db/migrations ./src/db/migrations
COPY --from=builder --chown=nextjs:nodejs /app/docker/migrate-runner.cjs ./migrate-runner.cjs
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/postgres ./node_modules/postgres

# Entrypoint: reads secrets, runs migrate-runner.cjs, execs node server.js
COPY --from=builder --chown=nextjs:nodejs /app/docker/start.sh ./start.sh
RUN chmod +x ./start.sh

USER nextjs

EXPOSE 3000

ENTRYPOINT ["./start.sh"]
