#!/usr/bin/env bash
# One-time Fly.io setup (PostgreSQL + secrets). Run from repo root after installing the Fly CLI.
set -euo pipefail

APP_NAME="${FLY_APP_NAME:-webhook-receiver}"
DB_NAME="${FLY_DB_NAME:-webhook-receiver-db}"

echo "Ensure you are logged in: fly auth login"
echo "Creating Postgres cluster (if needed): fly postgres create --name $DB_NAME --region iad"
echo "Attach DB to app (sets DATABASE_URL on the app): fly postgres attach --app \"$APP_NAME\" \"$DB_NAME\""
echo "Set webhook secret: fly secrets set --app \"$APP_NAME\" WEBHOOK_HMAC_SECRET='fluff-secret-abc123'"
echo "Deploy: npm run fly:deploy  (or: fly deploy --app \"$APP_NAME\")"
