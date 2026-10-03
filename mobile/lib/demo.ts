// Demo mode: /app/demo opens Nomi with a fixed, made-up network so the
// product can be shown and screen-recorded. Every service call is answered
// from services/demoData.ts; nothing reaches the backend or real accounts.
import { Platform } from "react-native";

const KEY = "nomi.demo";
let demo = readFlag();
const listeners = new Set<() => void>();

// For useSyncExternalStore: re-render when demo mode starts or ends.
export function subscribeDemo(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readFlag(): boolean {
  if (Platform.OS !== "web") return false;
  try {
    return globalThis.sessionStorage?.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function isDemo(): boolean {
  return demo;
}

export function startDemo(): void {
  demo = true;
  listeners.forEach((l) => l());
  try {
    globalThis.sessionStorage?.setItem(KEY, "1");
  } catch {
    // Private windows: demo lasts until reload.
  }
}

export function exitDemo(): void {
  demo = false;
  listeners.forEach((l) => l());
  try {
    globalThis.sessionStorage?.removeItem(KEY);
  } catch {
    // ignore
  }
}
