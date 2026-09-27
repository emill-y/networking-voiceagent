// The three ways into Nomi: Apple (iOS), Google, and an email magic link.
// Each ends with a Supabase session; the session listener in _layout then
// shows the signed-in screens.
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import { supabase } from "@/lib/supabase";

// Where Google and magic links send people back to: the app's
// /auth/callback screen (a deep link on phones, a page on web).
export function authRedirectUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    // The web app lives under a base path (/app, see app.json).
    return `${window.location.origin}${process.env.EXPO_BASE_URL ?? ""}/auth/callback`;
  }
  return Linking.createURL("auth/callback");
}

if (__DEV__) {
  // Handy when setting up Supabase's Redirect URLs list.
  console.log(`[auth] sign-in redirect: ${authRedirectUrl()}`);
}

function client() {
  if (!supabase) throw new Error("Sign-in isn’t configured.");
  return supabase;
}

// Turns the one-time code from a redirect into a session.
export async function completeSignIn(url: string): Promise<void> {
  const { queryParams } = Linking.parse(url);
  const error = queryParams?.error_description ?? queryParams?.error;
  if (error) throw new Error(String(error));
  const code = queryParams?.code;
  if (typeof code !== "string") throw new Error("That sign-in link is incomplete.");
  const { error: exchangeError } = await client().auth.exchangeCodeForSession(code);
  if (exchangeError) {
    // On Android the /auth/callback screen may have used the code first.
    const { data } = await client().auth.getSession();
    if (!data.session) throw exchangeError;
  }
}

export async function signInWithGoogle(): Promise<void> {
  const redirectTo = authRedirectUrl();
  if (Platform.OS === "web") {
    // The browser leaves for Google and comes back to /auth/callback.
    const { error } = await client().auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) throw error;
    return;
  }
  const { data, error } = await client().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  // An in-app browser sheet that closes itself when Google redirects back.
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === "success") await completeSignIn(result.url);
}

export const appleSignInSupported = Platform.OS === "ios";

export async function signInWithApple(): Promise<void> {
  // Apple signs a hash of this random value into its token; Supabase checks
  // it against the original, so a stolen token can't be replayed.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") return; // user closed the sheet
    throw e;
  }
  if (!credential.identityToken) throw new Error("Apple didn’t return a sign-in token.");
  const { error } = await client().auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;
  // Apple shares the name only the first time; keep it on the account.
  const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(" ");
  if (fullName) await client().auth.updateUser({ data: { full_name: fullName } });
}

export async function sendMagicLink(email: string): Promise<void> {
  const { error } = await client().auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: authRedirectUrl() },
  });
  if (error) throw error;
}

// The same email can also carry a 6-digit code (see mobile/README.md), for
// when the link opens on a different device than the one signing in.
export async function verifyEmailCode(email: string, code: string): Promise<void> {
  const { error } = await client().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
  if (error) throw error;
}
