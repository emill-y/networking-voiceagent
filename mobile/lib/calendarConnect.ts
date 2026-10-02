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

export const calendarNotice: Record<string, string> = {
  connected: "Google Calendar connected. Your follow-ups with dates will show up there.",
  denied: "Google Calendar wasn’t connected. You can try again anytime.",
  failed: "Google didn’t finish connecting. Please try again.",
  expired: "That sign-in link expired. Please try connecting again.",
  scope: "Google didn’t give Nomi calendar access. Connect again and tick “See and edit events”.",
};
