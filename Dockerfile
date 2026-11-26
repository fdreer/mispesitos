# Mis Pesitos — imagen self-hosted.
#
# Dos imágenes finales, elegidas con `target` (ver docker-compose.yml):
#   - runner:   la app (server.js de la build standalone de Next).
#   - migrator: corre scripts/db-setup.mjs (roles, migraciones, contraseña de
#               app_user) y termina. Lleva node_modules completos porque el
#               migrador de drizzle no entra en el trazado de la standalone.

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

FROM base AS migrator
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY drizzle ./drizzle
COPY scripts ./scripts
USER node
CMD ["node", "scripts/db-setup.mjs"]

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
