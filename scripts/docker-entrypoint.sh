#!/bin/sh
set -eu

SECRETS_DIR="${SECRETS_DIR:-/secrets}"

# Sin DATABASE_URL explícita, se arma con la contraseña de app_user que dejó
# scripts/init-secrets.mjs (o la de APP_USER_PASSWORD, si llega por entorno).
if [ -z "${DATABASE_URL:-}" ]; then
  if [ -z "${APP_USER_PASSWORD:-}" ] && [ -r "$SECRETS_DIR/app-user-password" ]; then
    APP_USER_PASSWORD="$(cat "$SECRETS_DIR/app-user-password")"
  fi
  if [ -z "${APP_USER_PASSWORD:-}" ]; then
    echo "Falta DATABASE_URL, APP_USER_PASSWORD o $SECRETS_DIR/app-user-password." >&2
    exit 1
  fi
  DATABASE_URL="postgresql://app_user:${APP_USER_PASSWORD}@${DB_HOST:-db}:${DB_PORT:-5432}/${DB_NAME:-mispesitos}"
  export DATABASE_URL
  unset APP_USER_PASSWORD
fi

if [ -z "${BETTER_AUTH_SECRET:-}" ]; then
  SECRET_FILE="/app/data/auth-secret"
  if [ ! -s "$SECRET_FILE" ]; then
    mkdir -p /app/data
    (umask 077 && node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))" > "$SECRET_FILE")
  fi
  BETTER_AUTH_SECRET="$(cat "$SECRET_FILE")"
  export BETTER_AUTH_SECRET
fi

exec node server.js
