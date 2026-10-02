#!/usr/bin/env bash
# Build Nomi's web app into backend/web/, where the API server serves it at /app.
#
#   backend/scripts/build_web.sh
#
# The web app calls the API on its own server ("same-origin"), so the same
# build works locally (http://localhost:8000/app) and when deployed.
# Supabase settings come from mobile/.env.local (EXPO_PUBLIC_SUPABASE_*).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
mobile="$here/../../mobile"
out="$here/../web"

cd "$mobile"
EXPO_PUBLIC_API_URL=same-origin npx expo export --platform web --output-dir "$out" --clear
touch "$out/.gitkeep"
echo "Built the web app into backend/web. Start the backend and open http://localhost:8000/app"
