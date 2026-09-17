#!/usr/bin/env bash
# Setup for attendees: installs the app, provisions a database, seeds it,
# and collects the one key the assistant needs. Safe to re-run.
set -euo pipefail

cd "$(dirname "$0")/../apps/storefront"

echo "==> Checking Node.js version"
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node.js >= 22 is required (found $(node -v))."
  echo "Install it from https://nodejs.org or with nvm: nvm install 22"
  exit 1
fi

echo "==> Installing dependencies"
npm install

touch .env.local

echo "==> Checking for DATABASE_URL"
if [ -n "${DATABASE_URL:-}" ]; then
  echo "==> Using DATABASE_URL from the environment"
  grep -q '^DATABASE_URL=' .env.local 2>/dev/null || echo "DATABASE_URL=${DATABASE_URL}" >>.env.local
elif grep -q '^DATABASE_URL=.\+' .env.local 2>/dev/null; then
  echo "==> Using DATABASE_URL already set in .env.local"
else
  echo "==> Provisioning a free Postgres database on Neon (no account needed)"
  npx --yes neon@latest claim create --file .env.local
  echo "==> The database expires in 72 hours unless you claim it."
  echo "    To keep it in a free Neon account: cd apps/storefront && npx neon@latest claim accept"
fi

echo "==> Seeding the database"
npm run db:seed

echo "==> Checking for MISTRAL_API_KEY"
if ! grep -q '^MISTRAL_API_KEY=.\+' .env.local 2>/dev/null; then
  read -r -p "Enter your Mistral API key (https://console.mistral.ai/api-keys): " MISTRAL_KEY
  echo "MISTRAL_API_KEY=${MISTRAL_KEY}" >>.env.local
else
  echo "==> MISTRAL_API_KEY already set, skipping"
fi

echo "==> SENTRY_DSN is not needed yet; the labs add it later"

echo "==> Setup complete. Next: npm run dev"
