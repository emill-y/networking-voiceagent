// Supabase client for sign-in. The publishable key is designed to ship in
// apps: on its own it can't read data, because Row Level Security and the
// backend both require a signed-in user's token.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

// Where the session (refresh token) is kept between launches. During web
// static rendering there is no window, so nothing is stored.
function sessionStorage() {
  if (Platform.OS !== "web") return AsyncStorage;
  return typeof window === "undefined" ? undefined : window.localStorage;
}

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: sessionStorage(),
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;

// Without Supabase settings the app runs in local development mode: no
// sign-in, and the backend must run with NOMI_DEV_AUTH=true.
export const authEnabled = supabase !== null;

// Refresh tokens only while the app is in the foreground (Supabase's
// recommendation for React Native).
if (supabase && Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}

export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
