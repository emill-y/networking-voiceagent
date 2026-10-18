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

**If connecting doesn't work** (check Vercel → Logs; Nomi logs Google's own message):

| You see | Fix |
|---|---|
| Google page: `redirect_uri_mismatch` | The redirect URI in step 1 must be exactly `PUBLIC_URL` + `/calendar/callback` (https, no trailing slash). |
| Google page: "Access blocked … has not completed verification" | Add that Google account under **Audience → Test users**. |
| Back in Nomi: "Google didn’t give Nomi calendar access" | They unticked "See and edit events" on Google's screen. Connect again and tick it. |
| Logs: `403 … Calendar API has not been used in project` | Enable **Google Calendar API** (step 1) and wait a minute. |
| Connected, but disconnected again a week later | Apps in *Testing* get 7-day tokens. Publish the app (**Audience → Publish app**) to keep people connected. |
| Signed out after coming back from Google | Fixed: Nomi now returns to the domain you started on. Keep `PUBLIC_URL` set to the domain in the redirect URI. |

## Database update for this version (once)

New tables for ambient sessions (this version), profile photos, contact
sharing, invites and the calendar "reconnect" state. Run once against
production (safe to re-run; it skips what is already there), then redeploy:

```bash
cd ~/networking-voiceagent/backend && source .venv/bin/activate
DATABASE_URL="$(grep '^DATABASE_URL:' prod.env.yaml | cut -d'"' -f2)" python -m scripts.migrate
```

## Sessions: ambient recording at events

**Session** (Home → Session, or long-press the record button on phones)
records in 30-second pieces while you network. Each piece is transcribed,
Nomi finds the people introduced and fills in what they said, and you
review everyone before anything is saved. Audio is never stored; the
transcript is deleted after you save or discard.

It needs one new table. Run the migration above once (it includes
`supabase/migrations/20261007000000_ambient_sessions.sql`), then redeploy.
It uses the same transcription and Groq keys as voice notes, nothing new.

Phones keep recording with the screen locked (background audio is on in
`app.json`). In a browser, keep the tab open.

**Apple Watch (optional).** The watch app is off by default so normal builds
are unchanged. To build it on a Mac with Xcode:

```bash
cd mobile
NOMI_WATCH=1 npx expo prebuild --clean -p ios
NOMI_WATCH=1 npx expo run:ios
```

Then open Nomi on the watch: it records from your wrist into the session
running on the phone. Details and limits: `mobile/targets/watch/README.md`.

## Plan Events: event sources (free)

Plan Events suggests real events near you and who from your notes to bring.
**Plan it** adds a dated follow-up for each person (and puts it on Google
Calendar when connected). **Invite** shares a ready-to-send message.

| Source | What it adds | Setup |
|---|---|---|
| Open conference data ([tech-conferences/conference-data](https://github.com/tech-conferences/conference-data)) | Tech conferences | None |
| [Ticketmaster Discovery API](https://developer.ticketmaster.com) | Concerts, sports, arts & theatre, comedy, family | Free key → `TICKETMASTER_API_KEY` |
| [SeatGeek Platform API](https://seatgeek.com/account/develop) | Concerts, sports, theater, comedy | Free client id → `SEATGEEK_CLIENT_ID` |
| Calendars people follow (iCal: Luma, Meetup, school or club calendars) | Workshops, mixers, student and community events | In the app: Plan Events → Follow a calendar |

Without the two keys, Plan Events still works with conferences and followed
calendars; add them for concerts, sports, arts and more. Add each key in
Vercel → Settings → Environment Variables (Production) and redeploy.

## Sharing contacts and invites

Select contacts (or a filtered view) in Contacts → **Share**, enter an email.
The recipient sees them after signing in to Nomi with that email (or from the
link) and chooses to add them; nothing is imported silently.

To send these as real emails, add a free [Resend](https://resend.com) key:
`RESEND_API_KEY`, and `EMAIL_FROM` with a sender on a domain you verified there
(e.g. `Nomi <hello@yourdomain.com>`). Without it, Nomi gives the sender a link
to send themselves and never claims an email was sent.

**Invite friends** (sidebar) has a share card with a QR code and a personal
link (`/?invite=CODE`). Sign-ups through it are counted per user, ready for
"invite 3 friends" rewards later; nothing is gated today.

## Emails for free (waitlist welcomes and shares)

No domain needed: Nomi can send through a Gmail account (about 500 emails a
day). Turn on 2-Step Verification for the account, then create an app
password at https://myaccount.google.com/apppasswords. In Vercel ->
Settings -> Environment Variables (Production) add `GMAIL_ADDRESS` (e.g.
`nomi.officialteam@gmail.com`) and `GMAIL_APP_PASSWORD` (the 16 letters), and
redeploy. If `RESEND_API_KEY` is also set, Resend is used instead.

## Demo mode (for screen recordings)

Open `https://nomi-connect.vercel.app/app/demo`. It loads a made-up network
(people, follow-ups, a connected calendar, events) kept only in the browser
tab. Nothing is read from or written to real accounts. **Profile → Exit demo**
leaves it. A good recording order: Home → Map → Contacts → Search ("Who do I
know at Berkeley interested in AI?") → Follow-ups → Plan Events → Profile.

## Your own domain (optional, 10 min)

Vercel → your project → **Settings → Domains** → add `nomi.yourdomain.com` and
follow the DNS instructions. Then add
`https://nomi.yourdomain.com/app/auth/callback` to Supabase's Redirect URLs.

## Redeploying

After any change: `git pull && npx vercel --prod`. Settings changes:
re-run `scripts/vercel-env.sh`, then redeploy.

## FAQ

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
