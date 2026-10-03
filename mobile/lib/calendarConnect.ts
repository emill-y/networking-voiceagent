// Start Google Calendar sign-in and come back to the same screen.
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import { startCalendarConnect } from "@/services/nomi";

export async function connectGoogleCalendar(returnPath: string): Promise<void> {
  if (Platform.OS === "web") {
    // The web app lives under /app. A full address, so Google's sign-in
    // returns to this exact site (where you're signed in), whichever domain it is.
    const { url } = await startCalendarConnect(`${window.location.origin}${process.env.EXPO_BASE_URL ?? ""}${returnPath}`);
    window.location.assign(url);
    return;
  }
  const back = Linking.createURL(returnPath.replace(/^\//, ""));
  const { url } = await startCalendarConnect(back);
  await WebBrowser.openAuthSessionAsync(url, back);
}

export const calendarNotice: Record<string, { text: string; ok: boolean }> = {
  connected: { text: "Google Calendar connected", ok: true },
  denied: { text: "Google Calendar wasn’t connected", ok: false },
  failed: { text: "Google didn’t finish connecting. Try again.", ok: false },
  expired: { text: "That sign-in took too long. Try again.", ok: false },
  scope: { text: "Calendar access wasn’t granted. Reconnect and allow “See and edit events”.", ok: false },
};
