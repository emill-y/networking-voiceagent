# Nomi redesign: implementation plan

## What exists (keep and repair)

| Area | Today | Plan |
|---|---|---|
| App shell | Expo Router, `Stack.Protected` auth guards, desktop `Sidebar`, phone `TabBar` | Keep. New nav labels and icons. |
| Theme | `lib/theme.ts`: static dark `colors` imported by every `StyleSheet` | Replace with semantic tokens for dark + light, `ThemeProvider`, persisted choice, `useStyles(makeStyles)` |
| Icons | Hand-drawn 16-icon set | `lucide-react-native` (open source, MIT) behind the same `<Icon name>` API |
| Network map | `NetworkMap` (pinch, pan, buttons) on Map; separate `GhostNetwork` on Home; dotted "ghost seats" | One `NetworkGraph` used on Home and Map; wheel zoom on web; no phantom nodes; side detail panel |
| Contacts | `people/` list with text filter + "See how they connect" | Rename to Contacts; combinable filters; select; export view (CSV/Sheets); share |
| Search | LLM ranking + paraphrase expansion (`/search`) | Keep backend; distinct conversational page |
| Follow-ups | List grouped by due date; tiles; suggestions | Notion-like grouped list, labeled counts, real context line, Google Calendar action per item |
| Google Calendar | OAuth (offline), encrypted refresh token, auto-push follow-ups, upcoming events | Keep. Add `needs_reauth` state instead of silently deleting; explicit add/remove per follow-up; manage in Profile; Upcoming on Home |
| Go Together | Open conference data + iCal feeds + Google Calendar, LLM pairing | Rename to Plan Events; provider abstraction; Ticketmaster + SeatGeek (free keys) for concerts, sports, arts, family…; categories; dedupe; city/date/category/distance filters |
| Profile (`you`) | Name, memories, calendar card, danger zone | Real settings: photo, account, integrations, appearance, invites |

## What is new

- `ThemeProvider`, tokens, primitives: `Text` styles, `Surface/Card`, `Button` (primary/secondary/ghost/danger, sizes), `Input`, `SegmentedControl`, `Section`, `EmptyState`, `Skeleton`, `OrbitLoader`.
- Contacts filters + `POST /contacts/export` (CSV of the ids in view) + "Copy for Google Sheets" (TSV).
- Contact sharing: `contact_shares` table, `POST /shares`, `GET /shares/incoming`, `POST /shares/{id}/accept|decline`; email via Resend when `RESEND_API_KEY` is set, otherwise a copyable link (never a fake "sent").
- Invites: per-user referral code (`invite_codes`), invite card with QR (`qrcode`), redemption recorded at sign-up. No gating.
- Profile photo: `user_profiles` table (small data-URL avatar), `GET/PATCH /me/profile`.
- Demo mode: `/app/demo` loads a deterministic in-memory dataset through the same service layer; no backend calls, no auth, never touches real data.
- Website: "Features" heading, "FAQ", nomiconnect@gmail.com, no "No account".

## Order

1. Design system + shell (tokens, theme, primitives, nav, loaders)
2. Google Calendar repair (backend + Profile + Follow-ups)
3. Home + Follow-ups
4. Network graph
5. Contacts (filters, export)
6. Search, Plan Events (rename, providers)
7. Sharing + invites
8. Demo mode, website
9. QA: tests, typecheck, every route in light/dark, phone/desktop
