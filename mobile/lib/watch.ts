// Hand an ambient session to the paired Apple Watch (and hear "start" from it).
// Uses react-native-watch-connectivity, which is only built into the iOS app
// when the watch target is enabled (NOMI_WATCH=1, see targets/watch/README.md).
// Everywhere else these functions do nothing.
import { NativeModules, Platform } from "react-native";

import { apiUrl } from "@/lib/api";

type WatchModule = {
  updateApplicationContext: (context: Record<string, unknown>) => void;
  watchEvents: { on: (event: string, cb: (payload: Record<string, unknown>) => void) => () => void };
};

function watch(): WatchModule | null {
  if (Platform.OS !== "ios" || !NativeModules.RNWatch) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-watch-connectivity") as WatchModule;
  } catch {
    return null;
  }
}

export const watchSupported = Platform.OS === "ios" && !!NativeModules.RNWatch;

// The watch records and uploads straight to this session with its own token.
export function shareSessionWithWatch(session: { id: string; uploadToken?: string; title: string | null } | null) {
  const w = watch();
  if (!w) return;
  w.updateApplicationContext(
    session
      ? { sessionId: session.id, uploadToken: session.uploadToken, apiUrl, title: session.title ?? "", sentAt: Date.now() }
      : { sessionId: null, sentAt: Date.now() },
  );
}

// "Start" pressed on the watch while the phone app is open.
export function onWatchStart(callback: () => void): () => void {
  const w = watch();
  if (!w) return () => undefined;
  return w.watchEvents.on("message", (message) => {
    if (message?.action === "startSession") callback();
  });
}
