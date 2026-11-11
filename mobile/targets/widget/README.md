# Nomi widgets (iPhone)

- **Start session** widget for the home screen (small, medium) and lock screen
  (circular, rectangular). Tapping it opens `nomi://session?start=1`, which
  starts a session right away once you've agreed to the consent note.
- **Recording Live Activity** on the lock screen and in the Dynamic Island:
  timer, people found so far, and an End button (`nomi://session?end=1`).
  The app starts, updates and ends it through `modules/nomi-live-activity`.

`NomiSessionAttributes.swift` exists here and in
`modules/nomi-live-activity/ios/`; keep the two identical.

Built into every iOS build by `@bacons/apple-targets` (see `app.config.js`).
EAS creates the `com.network.nomi.widget` App ID and profile the first time.
Set `ios.appleTeamId` in `app.json` to your Apple Developer Team ID.
