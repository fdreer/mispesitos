# Mis Pesitos — imagen self-hosted única.
#
# Por defecto arranca la app (server.js de la build standalone de Next).
# Para correr las migraciones de la base se invoca la misma imagen con:
#   node scripts/db-setup.mjs (ver servicio `migrate` en docker-compose.yml).

FROM node:24-alpine AS base
WORKDIR /app
# pnpm en la versión exacta de `packageManager` de package.json.
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# node_modules plano (como npm) y no el de symlinks de pnpm: con el layout
# de pnpm, el trazado de la build standalone deja afuera dependencias que Next
# resuelve en runtime (p. ej. @swc/helpers) y server.js no arranca. Fuera de
# Docker el proyecto sigue usando el layout normal de pnpm.
RUN pnpm install --frozen-lockfile --node-linker=hoisted

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone
# Valores de mentira SOLO para compilar: src/db/client.ts y better-auth los
# exigen al cargar los módulos, pero ninguna página se prerenderiza contra la
# base. Los de verdad llegan en runtime por variables de entorno.
#
# `next build` directo y no `pnpm build`: antes de correr un script, pnpm
# verifica las dependencias y, como el proyecto no declara node-linker
# hoisted, reinstala node_modules con symlinks y vuelve el problema de arriba.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    BETTER_AUTH_SECRET="build-only-secret-not-used-at-runtime-0000" \
    BETTER_AUTH_URL="http://localhost:3000" \
    ./node_modules/.bin/next build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# El migrador de drizzle no entra en el trazado de la build standalone.
COPY --from=deps --chown=node:node /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node scripts/db-setup.mjs ./scripts/db-setup.mjs
COPY --chown=node:node scripts/docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/\r$//' ./docker-entrypoint.sh && chmod +x ./docker-entrypoint.sh && mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
