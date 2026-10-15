# Shipping Nomi to the App Store

> **Launching the website and web app?** See [LAUNCH_WEB.md](LAUNCH_WEB.md): one
> Vercel project serves the site, the live demo, the web app and the API.

> **In a hurry?** After Parts 1–2 are set up once, every deploy is one command:
> `backend/scripts/deploy.sh` — it builds the web app, ships the API + website to
> Cloud Run, and prints the live URLs. Then Part 7 (`eas build` + `eas submit`).
> Apple review itself usually takes 1–3 days and needs a paid Apple Developer
> account ($99/yr) — nothing can make that part instant.

This is the path from "works on my laptop" to "anyone can download it".
Do the parts in order; each ends with a check.

How the production app works:

```
iPhone (Nomi app)
 ├─ speech → text on the phone (Apple Speech; audio stays on device when supported)
 ├─ sign-in → Supabase Auth (Apple, Google, magic link)
 └─ HTTPS → Nomi API on Google Cloud Run (always on, no laptop)
              ├─ extraction + search → Groq (hosted LLM, ~1–3 s)
              └─ data → Supabase Postgres (row-level security)
```

## What it costs

| Thing | Cost |
|---|---|
| Apple Developer Program | **$99/year**, required to publish on the App Store |
| Expo / EAS builds | Free tier (limited builds per month) is enough to start |
| Groq (AI model) | Free tier: about 8 notes a minute across all users on gpt-oss-120b (more with the fallback model). Enough for testing; switch to Groq's pay-as-you-go Dev tier before launch (fractions of a cent per note) |
| Google Cloud Run (API) | Free tier covers light use (a billing account is still required) |
| Supabase | Free tier. **Free projects pause after a week without activity**; move to Pro ($25/mo) before real users depend on it |
| Email for magic links | Supabase's built-in mailer is fine for testing; use Resend's free tier for real users |
| Privacy and support pages | Free, served by the API itself |

---

## Part 1: Fast AI with Groq (5 min)

The Groq key is already in `backend/.env.example` and `prod.env.example.yaml`
(committed on purpose; the repository is private). If your `backend/.env`
predates that, copy the `LLM_*` lines from `.env.example` into it. Then:

```bash
cd ~/networking-voiceagent/backend && source .venv/bin/activate
python -m scripts.doctor
python -m scripts.eval_extraction
```

**Check:** doctor shows `OK  Language model`, and each eval case takes a
second or two instead of tens of seconds.

**If the repository ever becomes public or is shared**, revoke the key at
https://console.groq.com/keys, create a new one, and remove the old one from
the files (it stays in Git history, so revoking is the part that matters).

## Part 2: Put the API online with Google Cloud Run (20 min)

Use the same Google Cloud project you created for Google sign-in.

```bash
brew install --cask google-cloud-sdk
gcloud auth login
gcloud projects list                         # find your PROJECT_ID
gcloud config set project PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

Cloud Run needs a billing account linked to the project (Google Cloud console →
Billing). Light use stays within the free tier.

Create the production settings file (it's ignored by Git):

```bash
cd ~/networking-voiceagent/backend
cp prod.env.example.yaml prod.env.yaml
# URL-encode your database password for DATABASE_URL:
read -rs -p "DB password: " P; echo; python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$P"; unset P
open -e prod.env.yaml
```

In `prod.env.yaml`, paste the encoded password into `DATABASE_URL` (the Groq
key is already filled in) and, optionally, for the rare server-side
transcription fallback, a Hugging Face token into `HF_TOKEN`.

Build the web version (it ships inside the same server and is served at
`/app`), then deploy:

```bash
cd ~/networking-voiceagent/backend
scripts/build_web.sh
gcloud run deploy nomi-api \
  --source . \
  --region northamerica-northeast1 \
  --allow-unauthenticated \
  --env-vars-file prod.env.yaml \
  --memory 512Mi --cpu 1 \
  --min-instances 0 --max-instances 3
```

`--allow-unauthenticated` only means the address is reachable from the
internet; every endpoint except `/health` still requires a signed-in Nomi user.

**Check:** the command prints a `Service URL` like `https://nomi-api-xxxxx.a.run.app`.
```bash
curl https://nomi-api-xxxxx.a.run.app/health        # {"status":"ok"}
curl -i https://nomi-api-xxxxx.a.run.app/contacts   # 401
```
Save that URL; the app needs it in Part 5.

**The web version** is now live at `https://nomi-api-xxxxx.a.run.app/app`.
Add its sign-in return address in Part 4.

To redeploy after code changes, run `scripts/build_web.sh` and the same
`gcloud run deploy` command.
The first request after a quiet period takes a couple of seconds while an
instance starts; `--min-instances 1` removes that at a small monthly cost.

## Part 3: Privacy policy and support pages (5 min)

Apple requires both URLs. The API serves them, so they're live as soon as
Part 2 is done, and the repository can stay private:

- Support URL: `https://nomi-api-xxxxx.a.run.app/`
- Privacy policy URL: `https://nomi-api-xxxxx.a.run.app/privacy`

1. Set `SUPPORT_EMAIL` in `backend/prod.env.yaml` to the address people should
   write to. It's filled into the website and the privacy policy. Read the
   privacy policy and adjust anything that isn't true for you. This isn't
   legal advice.
2. Redeploy: `backend/scripts/deploy.sh`.

The same URL is Nomi's public marketing site: `/` is the landing page and
`/app` is the full web version. Use it as the App Store **Marketing URL** too,
and share it anywhere. To put it on your own domain, run
`gcloud beta run domain-mappings create --service nomi-api --domain nomi.yourdomain.com --region northamerica-northeast1`
and add the DNS records it prints.

**Check:** both URLs open in a browser.

## Part 4: Production sign-in settings (15 min)

In the **Supabase** dashboard:
1. **Authentication → Sign In / Providers → Apple → Client IDs**: make sure it
   contains `com.network.nomi` (the app's bundle ID) as well as `host.exp.Exponent`.
2. **Authentication → URL Configuration → Redirect URLs** must include
   `nomi://auth/callback` (phone app) and
   `https://nomi-api-xxxxx.a.run.app/app/auth/callback` (web app). Set **Site URL**
   to `nomi://auth/callback`.
3. **Authentication → Emails → SMTP Settings**: connect a real mail sender
   (e.g. a free Resend account) so magic links aren't limited to a few per hour.
4. Before real users: consider upgrading to Pro so the project never pauses.

In **Google Cloud → APIs & Services → OAuth consent screen**:
5. Add the privacy policy URL and support email, then **Publish app** so anyone
   (not just test users) can sign in. Nomi only asks for basic profile and email,
   which doesn't need Google's verification review.

## Part 5: Apple and EAS setup (30 min, once)

1. Join the **Apple Developer Program** at https://developer.apple.com/programs/ ($99/year).
   Approval can take a day or two.
2. Install the EAS command-line tool and connect the project:
   ```bash
   npm install -g eas-cli
   cd ~/networking-voiceagent/mobile
   eas login
   eas init            # links to an Expo project; adds its id to app.json
   git add app.json && git commit -m "Link EAS project" && git push
   ```
3. Store the app's settings in EAS (so they aren't in Git). Use your Cloud Run URL:
   ```bash
   for ENV in development preview production; do
     eas env:create --environment $ENV --name EXPO_PUBLIC_API_URL --value https://nomi-api-xxxxx.a.run.app --visibility plaintext --non-interactive
     eas env:create --environment $ENV --name EXPO_PUBLIC_SUPABASE_URL --value https://qebslfifekeswyesddpr.supabase.co --visibility plaintext --non-interactive
     eas env:create --environment $ENV --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value YOUR_SB_PUBLISHABLE_KEY --visibility plaintext --non-interactive
   done
   ```
4. **Bundle ID:** the app uses `com.network.nomi`. Bundle IDs are unique across the
   whole App Store. If EAS reports it's taken in the next step, change it in
   `mobile/app.json` (`ios.bundleIdentifier` and `android.package`, e.g.
   `com.yourname.nomi`) and in Supabase's Apple Client IDs, then retry.

## Part 6: Test the real app on your iPhone (20 min)

Expo Go can't run on-device speech recognition, so build Nomi's own
development app once:

```bash
cd ~/networking-voiceagent/mobile
eas device:create                                  # register your iPhone (opens a link on the phone)
eas build --profile development --platform ios     # ~15 min in the cloud; EAS sets up certificates
```

Install it from the link EAS gives you (on iOS 16+, also turn on
Settings → Privacy & Security → Developer Mode). Then:

```bash
npx expo start --dev-client
```

Open the **Nomi** app (not Expo Go) and connect to the server.

**Check:**
- Recording shows your words live as you speak; tapping stop jumps straight to review in a couple of seconds.
- Sign in with Apple, Google and magic link each work.
- Import from contacts, Call/Text/Email, export and delete account work.

## Part 7: Build and submit to the App Store (1 hour + review)

```bash
cd ~/networking-voiceagent/mobile
eas build --profile production --platform ios
eas submit --platform ios --latest
```

`eas submit` creates the app in App Store Connect if needed and uploads the
build. It appears in **TestFlight** after processing (10–30 min); install it on
your phone from the TestFlight app and do one last pass through Part 6's checks.

Then in **App Store Connect → your app**:

1. **App Information**: name *Nomi*, subtitle (e.g. *Remember everyone you meet*),
   category *Productivity*, privacy policy URL from Part 3 (`…/privacy`).
2. **Version page**: description, keywords, support URL from Part 3, and
   screenshots. Take them on your iPhone from the TestFlight build (a 6.9" or
   6.5" iPhone set is required).
3. **App Privacy** (be conservative and accurate):
   - *Contact Info → Email address, Name*: App Functionality, linked to the user.
   - *Contacts*: App Functionality, linked (only people the user selects).
   - *User Content → Other User Content* (notes): App Functionality, linked.
   - *Audio Data*: App Functionality, linked, only used in the server fallback path.
   - Tracking: **No**. No data used for advertising.
4. **App Review Information**: Nomi's sign-in is Sign in with Apple, Google or an
   email link, so in the notes write: "Use Sign in with Apple to create an
   account instantly. Account deletion: You → Delete my account." Add a phone
   number and email Apple can reach you at.
5. Select the build, answer the export question (already declared: no custom
   encryption), and **Submit for Review**. Reviews usually take 1–3 days.

## After launch

- Code change to the API: `gcloud run deploy …` (Part 2).
- Code change to the app: `eas build --profile production --platform ios && eas submit --platform ios --latest`
  (build numbers increase automatically). JavaScript-only fixes can later ship
  instantly with EAS Update.
- Watch Cloud Run logs (Google Cloud console → Cloud Run → nomi-api → Logs) and
  Supabase usage.
