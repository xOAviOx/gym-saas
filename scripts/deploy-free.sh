#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker Engine with the Compose plugin first." >&2
  exit 1
fi

if [[ ! -f .env.production ]]; then
  echo "Missing .env.production. Copy .env.production.example and fill every value." >&2
  exit 1
fi

required=(
  APP_DOMAIN
  ACME_EMAIL
  NEXT_PUBLIC_APP_URL
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  PORTAL_TOKEN_SECRET
  SECRETS_ENCRYPTION_KEY
  CRON_SECRET
)

for key in "${required[@]}"; do
  if ! grep -Eq "^${key}=.+" .env.production; then
    echo "Missing value for ${key} in .env.production." >&2
    exit 1
  fi
done

docker compose \
  --env-file .env.production \
  --file deploy/free/compose.yml \
  up --detach --build --remove-orphans

docker compose \
  --env-file .env.production \
  --file deploy/free/compose.yml \
  ps
