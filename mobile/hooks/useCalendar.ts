import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { ApiError } from "@/lib/api";
import { connectGoogleCalendar } from "@/lib/calendarConnect";
import { calendarStatus, disconnectCalendar, setCalendarPush } from "@/services/nomi";
import type { CalendarStatus } from "@/types/api";

// Google Calendar's status for this account, refreshed whenever the screen
// comes into view, plus the actions every screen needs.
export function useCalendar(returnPath: string) {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [busy, setBusy] = useState<"connect" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    calendarStatus().then(setStatus).catch(() => setStatus(null));
  }, []);
  useFocusEffect(refresh);

  async function connect() {
    setBusy("connect");
    setError(null);
    try {
      await connectGoogleCalendar(returnPath);
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t start Google sign-in.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    try {
      await disconnectCalendar();
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t disconnect.");
    } finally {
      setBusy(null);
    }
  }

  async function setPush(value: boolean) {
    setStatus((current) => (current ? { ...current, pushFollowUps: value } : current));
    try {
      setStatus(await setCalendarPush(value));
    } catch {
      refresh();
    }
  }

  // "unavailable" when this server has no Google Calendar set up.
  const state = !status ? null : !status.available ? "unavailable" : status.state;
  return { status, state, busy, error, connect, disconnect, setPush, refresh, setError };
}
