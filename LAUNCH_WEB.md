# Launch the website and web app on Vercel

One Vercel project serves everything from one address:

```
https://your-app.vercel.app/            website (home, /product, /students, /demo, /privacy)
https://your-app.vercel.app/demo        live demo: voice + network map, no account
https://your-app.vercel.app/app         the Nomi web app (sign in, capture, people, map, search)
https://your-app.vercel.app/contacts …  the API (Python function in api/index.py)
```

How it's built (`vercel.json`): `scripts/build-vercel.mjs` copies the website
from `backend/app/pages/` and exports the Expo web app into `public/`; Vercel
serves those as static files and sends the API paths to the FastAPI app in
`api/index.py`. Supabase (sign-in + database) and Groq (AI) stay as they are.

## Before you start (5 min)

1. **`backend/prod.env.yaml`** exists and is filled in (copy
   `backend/prod.env.example.yaml`): database password in `DATABASE_URL`, and
   `SUPPORT_EMAIL` set to a real address (it's shown on the website).
   For Vercel, use Supabase's **transaction pooler** (port **6543**) in
   `DATABASE_URL`; it's built for serverless hosts:
   ```
   postgresql://postgres.qebslfifekeswyesddpr:YOUR-URL-ENCODED-PASSWORD@aws-0-ca-central-1.pooler.supabase.com:6543/postgres
   ```
2. **`mobile/.env.local`** has `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. The database tables exist (you ran `python -m scripts.migrate` earlier; the
   doctor shows `OK Database tables`).

## Deploy (10 min)

```bash
cd ~/networking-voiceagent
git pull
npx vercel login                 # opens the browser; sign up free with GitHub
npx vercel link                  # "Set up and deploy?" Y · pick your account · new project, name it "nomi"
scripts/vercel-env.sh            # copies your settings into Vercel (never into Git)
npx vercel --prod                # builds (~3–5 min) and prints your live URL
```

When `vercel link` asks about settings, accept the defaults: `vercel.json`
already sets the build command, output folder and Python function.

**Check** (replace the address with yours):
- `https://your-app.vercel.app/health` shows `{"status":"ok"}`
- `https://your-app.vercel.app/` shows the website, `/demo` works, and speaking
  or typing a note adds a person to the map
- `https://your-app.vercel.app/app` shows the sign-in screen

## Let people sign in (5 min)

In Supabase → **Authentication → URL Configuration → Redirect URLs**, add:
```
https://your-app.vercel.app/app/auth/callback
```
(and the same with your own domain once you add one). Keep the existing
`nomi://` and `exp://` entries. Then sign in at `/app` with Google or a magic
link, record a note, and check it appears under People.

For launch day, also connect a real email sender in Supabase → Authentication
→ Emails → SMTP (e.g. Resend's free plan). Supabase's built-in sender only
allows a few magic-link emails per hour.

## Google Calendar sync (optional, 20 min)

Two-way: Nomi reads upcoming events and suggests who to talk to at each one,
and dated follow-ups are added to the user's Google Calendar (and kept in
step when they're ticked off or dismissed). Users connect it from **You** or
the **Coming up** card.

1. **Google Cloud console** (the project you use for Google sign-in):
   - **APIs & Services → Library →** enable **Google Calendar API**.
   - **Google Auth Platform → Data access → Add or remove scopes →** add
     `openid`, `.../auth/userinfo.email` and `.../auth/calendar.events`. Save.
   - **Clients →** your *Web application* client → **Authorized redirect URIs →**
     add `https://nomi-connect.vercel.app/calendar/callback` (your address) and,
     for local testing, `http://localhost:8000/calendar/callback`. Save.
   - **Audience:** calendar access is a *sensitive* scope. Until Google verifies
     the app, only listed **test users** (up to 100) can connect: add yourselves
     there. To open it to everyone, submit the app for verification (Google asks
     for the privacy policy, homepage and a short screen recording; it takes
     days to weeks).
2. **Vercel → Settings → Environment Variables (Production):**
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from that client
   - `CALENDAR_ENCRYPTION_KEY`: run `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`
   - `PUBLIC_URL`: `https://nomi-connect.vercel.app`
   (or fill them into `backend/prod.env.yaml` and run `scripts/vercel-env.sh`).
3. **Database:** add the new table (once):
   ```bash
   cd ~/networking-voiceagent/backend && source .venv/bin/activate
   DATABASE_URL="$(grep '^DATABASE_URL:' prod.env.yaml | cut -d'"' -f2)" python -m scripts.migrate
   ```
4. Redeploy: `npx vercel --prod`. Then **You → Connect Google Calendar**.

Without the Google settings the calendar features simply stay hidden.

## Your own domain (optional, 10 min)

Vercel → your project → **Settings → Domains** → add `nomi.yourdomain.com` and
follow the DNS instructions. Then add
`https://nomi.yourdomain.com/app/auth/callback` to Supabase's Redirect URLs.

## Redeploying

After any change: `git pull && npx vercel --prod`. Settings changes:
re-run `scripts/vercel-env.sh`, then redeploy.

## Good to know

- **Cost:** Vercel's Hobby plan is free, but its terms limit it to personal,
  non-commercial use; a commercial launch belongs on Pro. Groq and Supabase
  free tiers are unchanged.
- **The demo** calls `/demo/extract` with no account. It's limited to short
  text and 6 requests a minute (40 a day) per visitor, stores nothing, and
  falls back to a simple built-in parser if the AI is busy. Voice in the demo
  uses the browser's own speech recognition (Chrome, Edge, Safari); in other
  browsers visitors type instead.
- **Logs:** Vercel → your project → **Logs** shows API errors. "Database is
  unavailable" means `DATABASE_URL` is wrong (usually the password).
- The iPhone app can use the same API: set its `EXPO_PUBLIC_API_URL` to your
  Vercel address instead of Cloud Run.
