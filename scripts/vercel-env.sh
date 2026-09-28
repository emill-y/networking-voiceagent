#!/usr/bin/env bash
# Copy Nomi's production settings into your Vercel project (Production environment).
#
#   scripts/vercel-env.sh
#
# Reads backend/prod.env.yaml (the same file Cloud Run uses) for the API, and
# mobile/.env.local for the web app's public Supabase settings. Run
# `npx vercel link` once first. Re-running replaces existing values.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f backend/prod.env.yaml ] || { echo "Missing backend/prod.env.yaml. Copy backend/prod.env.example.yaml and fill it in."; exit 1; }
[ -f mobile/.env.local ] || { echo "Missing mobile/.env.local (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY)."; exit 1; }
grep -q "YOUR-PASSWORD\|URL-ENCODED-PASSWORD" backend/prod.env.yaml && { echo "Put your database password in backend/prod.env.yaml (DATABASE_URL) first."; exit 1; }

put() {
  local name="$1" value="$2"
  [ -n "$value" ] || return 0
  npx vercel env rm "$name" production --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | npx vercel env add "$name" production >/dev/null
  echo "  set $name"
}

echo "API settings from backend/prod.env.yaml:"
# Lines look like  KEY: "value"  (comments and blank lines skipped).
while IFS= read -r line; do
  [[ "$line" =~ ^([A-Z_][A-Z0-9_]*):[[:space:]]*\"?(.*[^\"])?\"?[[:space:]]*$ ]] || continue
  put "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]:-}"
done < backend/prod.env.yaml

echo "Web app settings from mobile/.env.local:"
for name in EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY; do
  value="$(grep -E "^$name=" mobile/.env.local | head -1 | cut -d= -f2- | tr -d '"'"'"' ')"
  put "$name" "$value"
done
echo "Done. Deploy with: npx vercel --prod"
