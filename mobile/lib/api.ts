import { Platform } from "react-native";

import { isDemo } from "@/lib/demo";
import { getAccessToken, supabase } from "@/lib/supabase";

// Backend base URL. See mobile/README.md for device-specific values.
// "same-origin" (used by the deployed web app, which the API server itself
// serves) means: call the server this page came from.
const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
export const apiUrl = (
  configuredApiUrl === "same-origin"
    ? ""
    : configuredApiUrl || (Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://127.0.0.1:8000")
).replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    // Extra fields from the error body, e.g. {calendarState: "needs_reauth"}.
    public readonly info: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
  // Return the body as text (CSV exports) instead of JSON.
  text?: boolean;
};

// Small fetch wrapper: JSON in, JSON out, with a timeout and readable errors.
// FastAPI error bodies look like {"detail": "..."}; we surface that message.
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  // Demo mode answers from the made-up demo network; nothing leaves the app.
  if (isDemo()) {
    const { demoRequest } = await import("@/services/demoData");
    return demoRequest<T>(path, options);
  }
  const { method = "GET", body, timeoutMs = 15000 } = options;
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // Prove who we are: the signed-in user's Supabase access token.
  const token = await getAccessToken();
  const headers: Record<string, string> = {};
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method,
      signal: controller.signal,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch (error) {
    if (__DEV__) console.warn(`[api] ${method} ${path} failed before a response:`, error);
    // Our own timeout aborts the request; say so rather than "unreachable".
    if (controller.signal.aborted) {
      throw new ApiError("Nomi's backend took too long to respond. Please try again.", null);
    }
    throw new ApiError("Could not reach Nomi's backend.", null);
  } finally {
    clearTimeout(timeout);
  }

  // The backend no longer accepts this session: sign out, which returns
  // the app to the sign-in screen.
  if (response.status === 401 && token && supabase) {
    void supabase.auth.signOut();
  }

  if (!response.ok) {
    let detail = `Request failed (${response.status}).`;
    let info: Record<string, unknown> = {};
    try {
      const data = await response.json();
      if (typeof data?.detail === "string") detail = data.detail;
      else if (data?.detail && typeof data.detail.message === "string") {
        detail = data.detail.message;
        info = data.detail;
      }
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new ApiError(detail, response.status, info);
  }

  if (response.status === 204) return undefined as T;
  if (options.text) return (await response.text()) as T;
  return (await response.json()) as T;
}
