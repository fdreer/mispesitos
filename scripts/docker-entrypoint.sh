#!/bin/sh
set -eu

if [ -z "${BETTER_AUTH_SECRET:-}" ]; then
  SECRET_FILE="/app/data/auth-secret"
  if [ ! -s "$SECRET_FILE" ]; then
    mkdir -p /app/data
    node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))" > "$SECRET_FILE"
    chmod 600 "$SECRET_FILE"
  fi
  BETTER_AUTH_SECRET="$(cat "$SECRET_FILE")"
  export BETTER_AUTH_SECRET
fi

exec node server.js
