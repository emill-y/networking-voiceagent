import { Platform } from "react-native";

// Backend base URL. See mobile/README.md for device-specific values.
export const apiUrl = (
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  (Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://127.0.0.1:8000")
).replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
  ) {
    super(message);
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
};

// Small fetch wrapper: JSON in, JSON out, with a timeout and readable errors.
// FastAPI error bodies look like {"detail": "..."}; we surface that message.
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, timeoutMs = 15000 } = options;
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method,
      signal: controller.signal,
      headers: body !== undefined && !isForm ? { "Content-Type": "application/json" } : undefined,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Could not reach Nomi's backend.", null);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let detail = `Request failed (${response.status}).`;
    try {
      const data = await response.json();
      if (typeof data?.detail === "string") detail = data.detail;
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new ApiError(detail, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
