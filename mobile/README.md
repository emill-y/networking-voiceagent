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

People sign in with **email and password** or a **text-message code**. Phone
codes need an SMS provider (Twilio, MessageBird, Vonage or TextLocal) set up in
the Supabase dashboard under Authentication → Sign In / Providers → Phone.
Until then, use email, or add test numbers with fixed codes there.

`lib/supabase.ts` creates the client and keeps the session in AsyncStorage
(localStorage on web). `hooks/useSession.tsx` tracks it, and `app/_layout.tsx`
uses `Stack.Protected` so signed-out users only reach `/sign-in`. `lib/api.ts`
attaches the access token to every backend request, and signs out if the
backend rejects it. Without the two settings above, the app skips sign-in
(local development; the backend then needs `NOMI_DEV_AUTH=true`).

## Screens

| Route | File | What it does |
| --- | --- | --- |
| `/sign-in` | `app/sign-in.tsx` | Email/password or phone code |
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

**Recording.** `expo-audio`'s `useAudioRecorder` records AAC (`.m4a`) on iOS
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
