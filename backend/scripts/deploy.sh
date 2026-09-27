#!/usr/bin/env bash
# Build the web app and deploy the API + website to Google Cloud Run.
#
#   backend/scripts/deploy.sh            (run from anywhere)
#
# Needs: gcloud (logged in, project set), Node, backend/prod.env.yaml
# (copy prod.env.example.yaml), mobile/.env.local with EXPO_PUBLIC_SUPABASE_*.
# Prints the public URL: the website is at /, the web app at /app.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
backend="$here/.."
region="${REGION:-northamerica-northeast1}"
service="${SERVICE:-nomi-api}"

[ -f "$backend/prod.env.yaml" ] || { echo "Missing backend/prod.env.yaml — copy prod.env.example.yaml and fill it in."; exit 1; }
grep -q "YOUR-PASSWORD\|URL-ENCODED-PASSWORD" "$backend/prod.env.yaml" && { echo "Put your database password in backend/prod.env.yaml (DATABASE_URL)."; exit 1; }
[ -f "$backend/../mobile/.env.local" ] || { echo "Missing mobile/.env.local (EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY)."; exit 1; }

"$here/build_web.sh"

cd "$backend"
gcloud run deploy "$service" \
  --source . \
  --region "$region" \
  --allow-unauthenticated \
  --env-vars-file prod.env.yaml \
  --memory 512Mi --cpu 1 \
  --min-instances 0 --max-instances 3 \
  --quiet

url="$(gcloud run services describe "$service" --region "$region" --format 'value(status.url)')"
echo
echo "Live:"
echo "  Website        $url/"
echo "  Privacy policy $url/privacy"
echo "  Web app        $url/app"
echo "  Health         $(curl -fsS "$url/health" || echo 'not responding yet')"
echo
echo "Next: add $url/app/auth/callback to Supabase → Authentication → URL Configuration → Redirect URLs,"
echo "and point the iPhone build at it:  cd mobile && eas env:create --environment production --name EXPO_PUBLIC_API_URL --value $url --visibility plaintext"
