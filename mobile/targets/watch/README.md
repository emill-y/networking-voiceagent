# Nomi for Apple Watch

Record a networking session from your wrist. The iPhone starts the session
(or the watch asks the open iPhone app to); the watch records 30-second
chunks and uploads each one straight to that session with a token that only
works for that session while it's recording.

## Build it (Mac with Xcode 16+)

The watch app is opt-in so it can't affect the regular iPhone build.

```bash
cd mobile
NOMI_WATCH=1 npx expo prebuild --clean -p ios
open ios/*.xcworkspace   # select the NomiWatch scheme to run on a watch or simulator
```

For EAS builds, set `NOMI_WATCH=1` in the build profile's `env` (eas.json).
You'll also need an App ID for `com.nomi.app.watchkitapp` (EAS creates it
when it manages credentials).

## Limits to know

- The watch keeps recording while the Nomi app is on screen. watchOS returns
  to the clock after a while: set Settings › General › Return to Clock ›
  Nomi to "After 1 hour" for long events.
- Uploads go over the watch's own connection (via the iPhone, Wi-Fi or
  cellular). If a chunk can't upload it's retried three times, then dropped.
- Not tested on a physical watch from this repository's CI; build and try it
  on your device before shipping.
