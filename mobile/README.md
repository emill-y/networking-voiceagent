# Mobile app

Expo + React Native + TypeScript client for the networking voice agent.

Milestone 1 contains one home screen with a prompt, a disabled microphone
placeholder, and an empty recent-contacts section. Recording, microphone
permissions, backend calls, and data storage are not implemented.

## Run

Use Node.js 22 LTS (22.13 or newer) and npm. See the
[Expo SDK requirements](https://docs.expo.dev/versions/v57.0.0/).

From the repository root:

```bash
cd mobile
npm ci
npm start
```

Scan the QR code in an Expo Go version that supports SDK 57. With a simulator
or emulator installed, press `i` for iOS or `a` for Android. Press `w` for web.
You can also use `npm run ios`, `npm run android`, or `npm run web` directly.

## Important files

| File | Purpose |
| --- | --- |
| `package.json` | Lists the libraries the app needs and commands such as `npm start`. Its `main` field starts Expo Router. `devDependencies` contains development tools such as TypeScript. |
| `package-lock.json` | Records exact dependency versions so `npm ci` reproduces the installation. Commit it when dependencies change. |
| `app/index.tsx` | The home screen at `/`. Its React component returns JSX describing native views, text, and the disabled button. `StyleSheet` defines their appearance. `.tsx` means TypeScript with JSX. |
| `app/_layout.tsx` | Configures the shared navigation stack and status bar before the home screen appears. |
| `app.json` | Expo configuration: app name, icons, splash screen, platforms, and plugins. |
| `tsconfig.json` | Enables strict TypeScript checking using Expo's defaults. |
| `assets/` | Starter app icons and splash-screen images. |
| `.gitignore` | Keeps dependencies, caches, generated native projects, and build output out of Git. |

Startup flows from `package.json` → Expo Router → `app/_layout.tsx` →
`app/index.tsx`. Editing the home screen while Expo is running updates the app
through Fast Refresh.

## Verify

Run from `mobile/`:

```bash
npm run typecheck
npx expo install --check
npx expo-doctor
npx expo export --platform all
```

The export checks that iOS, Android, and web bundles can be generated; it does
not install a native app. For a runtime check, launch the app using the commands
above and confirm the home screen appears without an error overlay. The
microphone placeholder should remain disabled and request no permissions.
