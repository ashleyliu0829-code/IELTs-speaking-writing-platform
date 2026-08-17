#!/usr/bin/env bash
#
# Deploy the currently published main branch onto this server.
#
#   ./scripts/deploy.sh
#
# Run it from the checkout on the server. It refuses to run rather than leave a
# half-deployed app: an outage from a failed build is easier to reason about
# than a running server with a stale bundle.

set -euo pipefail

app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pm2_name="${PM2_APP_NAME:-ielts-speaking}"

cd "$app_dir"

# .env.local is deliberately untracked, so a pull never brings it. A missing
# key here means the app boots but every tenant-scoped query fails, which looks
# like "logged in but no data" rather than an obvious crash.
required_env=(
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_JWT_SECRET
)

if [[ ! -f .env.local ]]; then
  echo "error: .env.local is missing from $app_dir" >&2
  exit 1
fi

missing=()
for key in "${required_env[@]}"; do
  grep -q "^${key}=." .env.local || missing+=("$key")
done

if (( ${#missing[@]} > 0 )); then
  echo "error: .env.local is missing values for: ${missing[*]}" >&2
  exit 1
fi

echo "==> Fetching origin/main"
git fetch origin main
git checkout main
git reset --hard origin/main

# Stale files are what took the site down before: a stray directory of old
# routes was left behind by an scp, and Next.js compiled it. Untracked files
# are removed here; .gitignore still protects .env.local.
echo "==> Removing untracked files"
git clean -fd

echo "==> Installing dependencies"
npm ci

echo "==> Building"
npm run build

echo "==> Restarting $pm2_name"
pm2 restart "$pm2_name" --update-env

echo "==> Deployed $(git rev-parse --short HEAD)"
