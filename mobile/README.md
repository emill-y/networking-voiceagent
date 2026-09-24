# Mobile app

Expo + React Native + TypeScript client for the networking voice agent.

The home screen checks the backend's `GET /health` endpoint and displays
"Backend connected" after an HTTP success response with `{"status":"ok"}`.
It also contains a prompt, a disabled microphone placeholder, and an empty
recent-contacts section. Recording and data storage are not implemented.

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

## Connect to the backend

Start the backend using the [backend instructions](../backend/README.md).
The app defaults to `http://127.0.0.1:8000` for iOS and web, and
`http://10.0.2.2:8000` for the Android emulator.

For a physical phone, copy the example configuration from `mobile/`:

```bash
cp .env.example .env.local
```

Set `EXPO_PUBLIC_API_URL` in `.env.local` to your Mac's LAN address, for example
`http://192.168.1.20:8000`. Find the address under macOS System Settings → Wi-Fi →
Details → TCP/IP, or run `ipconfig getifaddr en0` for the usual Wi-Fi interface.
The phone and Mac should be on the same local network, and the backend must run
with `--host 0.0.0.0` as documented in the backend README. Use the Mac's actual
IP in the app, not `0.0.0.0`.

Reload the app after changing `.env.local`; restart Expo if the value does not
update. This local file is ignored by Git. The committed `.env.example` shows
the setting without a machine-specific address.

Use `http://localhost:8081` or `http://127.0.0.1:8081` for the Expo web preview.
These are the browser origins allowed by the backend's CORS configuration.
Native Expo Go requests do not use browser CORS rules.

The screen checks once when it mounts. A failed request, unexpected response,
or five-second timeout displays "Could not connect to backend" with a retry
button. This is a startup check, not continuous monitoring.

## Networking concepts

- **`fetch`** sends an HTTP request and returns a promise for the response.
  `await` lets this function wait for the result while the UI remains usable.
  The code checks `response.ok` because HTTP errors such as 500 do not make
  `fetch` reject automatically. `response.json()` reads the body as JavaScript data.
- **HTTP request**: a message from a client to a server containing a method,
  a path, and headers (and sometimes a body). Here the app sends `GET /health`
  and the backend responds with status `200` and a JSON body.
- **`localhost`** means the device making the request; `127.0.0.1` is its IPv4
  loopback address. On your phone it points to your phone, not your Mac.
- **LAN IP**: an address that other devices on the same local network can use
  to reach your Mac. This is why a physical phone needs the Mac's LAN IP.
  An iOS simulator can reach the Mac using `127.0.0.1`; the standard Android
  emulator provides the special host address `10.0.2.2`.

See [React Native networking](https://reactnative.dev/docs/network) and
[Expo environment variables](https://docs.expo.dev/guides/environment-variables/).

## Important files

| File | Purpose |
| --- | --- |
| `package.json` | Lists the libraries the app needs and commands such as `npm start`. Its `main` field starts Expo Router. `devDependencies` contains development tools such as TypeScript. |
| `package-lock.json` | Records exact dependency versions so `npm ci` reproduces the installation. Commit it when dependencies change. |
| `app/index.tsx` | The home screen at `/`. Its React component returns JSX describing native views, text, and the disabled button. `StyleSheet` defines their appearance. `.tsx` means TypeScript with JSX. |
| `.env.example` | Documents `EXPO_PUBLIC_API_URL`, the backend address. Copy it to the ignored `.env.local` for your device. |
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

With the backend running, confirm "Backend connected" appears. Stop the backend
and reload the app: it should show the error message and retry button. Restart
the backend and tap "Retry connection" to confirm it recovers.
