# Nomi mobile app

Expo + React Native + TypeScript, using Expo Router for screens and
`expo-audio` for recording.

## Run

Node.js 22.13+ and npm. From `mobile/`:

```bash
npm ci
npm start
```

Scan the QR code with Expo Go (SDK 57), or press `i` (iOS simulator),
`a` (Android emulator) or `w` (web).

## Connect to the backend

Start the backend first ([backend/README.md](../backend/README.md)). The app
uses `http://127.0.0.1:8000` on iOS simulator and web, and
`http://10.0.2.2:8000` on the Android emulator.

For a physical phone, copy `.env.example` to `.env.local` and set
`EXPO_PUBLIC_API_URL` to your computer's LAN address (for example
`http://192.168.1.20:8000`; on macOS, `ipconfig getifaddr en0`). Run the
backend with `--host 0.0.0.0`, keep both devices on the same network, and
restart Expo after changing `.env.local`.

## Sign-in (Supabase)

Copy `.env.example` to `.env.local` and set:

```
EXPO_PUBLIC_SUPABASE_URL=https://qebslfifekeswyesddpr.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

The publishable key is designed to ship inside apps: it can't read anything
without a signed-in user's token. `.env.local` is still kept out of Git.

People sign in three ways, with no passwords (`lib/auth.ts`):

- **Apple** (iPhone only): the native Apple sheet. Apple returns a signed
  token that Supabase verifies (`signInWithIdToken`, with a nonce so a stolen
  token can't be replayed).
- **Google**: an in-app browser sheet goes to Google and returns to
  `nomi://auth/callback` (on web, `/auth/callback`) with a one-time code.
- **Magic link**: an email link that also returns to `/auth/callback`. The
  email can include a 6-digit code too, for when the link opens elsewhere.

Google and magic links use PKCE: the code in the link only works together
with a secret kept on the device that asked, so a forwarded or intercepted
link is useless. `app/auth/callback.tsx` exchanges the code for a session.

### One-time Supabase setup (all free)

1. **Redirect URLs** (Authentication → URL Configuration): add
   `nomi://auth/callback`, `exp://**` (Expo Go during development) and
   `http://localhost:8081/auth/callback` (web preview).
2. **Google** (Authentication → Sign In / Providers → Google): in Google Cloud
   Console create an OAuth client of type *Web application* with the
   authorized redirect URI `https://qebslfifekeswyesddpr.supabase.co/auth/v1/callback`,
   then paste its client ID and secret into Supabase.
3. **Apple** (same page → Apple): add the app's bundle ID `com.nomi.app` to
   *Client IDs*, plus `host.exp.Exponent` to test inside Expo Go. Native
   sign-in needs only the IDs. Shipping your own iOS build requires the Apple
   Developer Program (also needed for the App Store) and enabling "Sign in with
   Apple" for the bundle ID.
4. **Magic link email** (Authentication → Emails → Magic Link): optionally add
   `{{ .Token }}` to the template so the email also shows the 6-digit code.
   Supabase's built-in mailer is free but sends only a few emails per hour;
   for real users, connect a free SMTP tier (e.g. Resend) under
   Authentication → Emails → SMTP.
5. Turn **Phone** and **Email password sign-ups** off if you don't want them.

If a sign-in link or Google opens `localhost` in Safari, Supabase rejected the
app's return address and fell back to the Site URL. In development the sign-in
screen prints the exact address (`Dev: sign-in returns to exp://…`); add it to
Redirect URLs. It changes when your Mac's IP changes or you switch to
`--tunnel`, which is why `exp://**` is on the list.

`lib/supabase.ts` creates the client and keeps the session in AsyncStorage
(localStorage on web). `hooks/useSession.tsx` tracks it, and `app/_layout.tsx`
uses `Stack.Protected` so signed-out users only reach `/sign-in`. `lib/api.ts`
attaches the access token to every backend request, and signs out if the
backend rejects it. Without the two settings above, the app skips sign-in
(local development; the backend then needs `NOMI_DEV_AUTH=true`).

## Screens

| Route | File | What it does |
| --- | --- | --- |
| `/sign-in` | `app/sign-in.tsx` | Apple, Google, or an email link |
| `/auth/callback` | `app/auth/callback.tsx` | Finishes Google and magic-link sign-in |
| `/` | `app/index.tsx` | Greeting, the mic, open follow-ups, recent people |
| `/record` | `app/record.tsx` | Ask for mic permission, record (auto-stops at 3 min), listen back |
| `/write` | `app/write.tsx` | Type a note instead of speaking |
| `/review` | `app/review.tsx` | Transcribe → extract → "have you met before?" → edit → save |
| `/people` | `app/people/index.tsx` | Everyone, most recently seen first |
| `/people/[id]` | `app/people/[id]/index.tsx` | Memory page: last conversation, follow-ups, timeline |
| `/people/[id]/edit` | `app/people/[id]/edit.tsx` | Edit details and contact info |
| `/follow-ups` | `app/follow-ups.tsx` | Complete or dismiss commitments |
| `/search` | `app/search.tsx` | Ask in plain language; results show why each person matched |
| `/import-contacts` | `app/import-contacts.tsx` | Pick people from the phone's contacts to add, or to fill in phone/email for people you know |
| `/you` | `app/you.tsx` | Account, sign out, export, delete memories or the account |

## Code layout

```
app/          screens (file name = route)
components/   shared UI: Screen, Button, Field, MicButton, Monogram, PersonRow
hooks/        useBackendHealth
lib/          theme tokens, fetch helper, formatting, pure review/memory logic
services/     nomi.ts: one function per backend endpoint
types/        api.ts: the backend's JSON shapes
```

**Design system.** `lib/theme.ts` holds the palette (warm ivory on charcoal),
spacing, radii and type styles. Cormorant Garamond is used for names and titles
(memory and emotion); the platform sans-serif for everything functional. Screens
use these tokens rather than raw colors.

**Recording.** In real builds (development, TestFlight, App Store), the
record screen (`components/LiveCapture.tsx`) uses on-device speech recognition
via `expo-speech-recognition`: words appear live, and the transcript is ready the
moment you stop. Expo Go doesn't include that native module, so there, and on
web, the app falls back to `components/AudioCapture.tsx`, described next. To
test live transcription, build the development app (`eas build --profile
development`; see `DEPLOY.md`).

**Fallback recording.** `expo-audio`'s `useAudioRecorder` records AAC (`.m4a`) on iOS
and Android and WebM in browsers. Audio stays on the device until you tap
"Remember this"; the backend deletes it right after transcribing. Background
recording is disabled in `app.json`.

**Briefing.** `lib/memory.ts` builds "Before you meet again" on each profile
from stored facts only: when and where you last met, open follow-ups, and
questions drawn from their projects, needs and uncertain notes.

**Contacts.** `lib/deviceContacts.ts` reads the address book with
`expo-contacts` (after the system permission prompt; iOS 18's "limited access"
is supported). `lib/addressBook.ts` matches entries to people already in Nomi
by phone number, then email, then a name only one person has, all on the
phone. Only the entries the user ticks are sent to `POST /contacts/import`,
which fills blanks but never overwrites what the user wrote. On a profile,
"Add from contacts" opens the system picker for that one person, and Call,
Text and Email open the phone's own apps; Nomi never sends anything itself.
Contacts need the iOS or Android app; the web preview explains that instead.

**Review.** `lib/review.ts` converts extracted people into editable drafts and
back into the save payload. A strong duplicate match must be answered
("Yes — Jason Chen" or "No, someone new") before saving. Only fields Nomi heard
are shown; the rest sit behind "More details".

## Verify

```bash
npm run typecheck
npm test                     # unit tests for lib/ (Node's built-in test runner)
npx expo export --platform web
```
