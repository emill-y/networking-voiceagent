// On-device speech recognition (Apple's Speech framework on iOS, the
// system recognizer on Android) via expo-speech-recognition.
//
// It's a native module, so it's missing in Expo Go. We load it defensively;
// callers check `liveTranscriptionAvailable()` and otherwise fall back to
// recording audio and transcribing on the backend. On the web we use the
// browser's own speech recognition (Chrome, Edge, Safari) the same way.
import { Platform } from "react-native";

import { createTranscriptAccumulator } from "./speechText.ts";

type SpeechPackage = typeof import("expo-speech-recognition");

let speech: SpeechPackage | null = null;
if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    speech = require("expo-speech-recognition") as SpeechPackage;
  } catch {
    speech = null; // e.g. running inside Expo Go
  }
}

// The browser's recognizer, where there is one.
type WebRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
function webRecognizer(): (new () => WebRecognition) | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => WebRecognition) | null;
}

export function liveTranscriptionAvailable(): boolean {
  if (Platform.OS === "web") return !!webRecognizer();
  try {
    return !!speech && speech.ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

export type SpeechHandlers = {
  onText: (text: string) => void;
  onError: (code: string, message: string) => void;
  onEnd: () => void;
};

export type PermissionResult = "granted" | "denied" | "blocked";

export async function requestSpeechPermission(): Promise<PermissionResult> {
  if (Platform.OS === "web") {
    // Ask for the microphone up front so a blocked mic shows a clear message.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return "granted";
    } catch (e) {
      return (e as { name?: string }).name === "NotAllowedError" ? "blocked" : "denied";
    }
  }
  if (!speech) return "denied";
  const result = await speech.ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (result.granted) return "granted";
  return result.canAskAgain ? "denied" : "blocked";
}

// Starts listening. Returns a function that stops (and delivers the final text).
export function startListening(handlers: SpeechHandlers, contextualStrings: string[] = []): () => void {
  if (Platform.OS === "web") return startWebListening(handlers);
  if (!speech) throw new Error("Speech recognition isn't available in this build.");
  const module = speech.ExpoSpeechRecognitionModule;
  const accumulator = createTranscriptAccumulator();

  const subscriptions = [
    module.addListener("result", (event) => {
      const text = event.results[0]?.transcript ?? "";
      handlers.onText(accumulator.push(text, event.isFinal));
    }),
    module.addListener("error", (event) => handlers.onError(event.error, event.message)),
    module.addListener("end", () => {
      subscriptions.forEach((s) => s.remove());
      handlers.onEnd();
    }),
  ];

  module.start({
    lang: "en-US",
    interimResults: true,
    continuous: true,
    addsPunctuation: true,
    // Keep audio on the phone whenever the device can recognize offline.
    requiresOnDeviceRecognition: module.supportsOnDeviceRecognition(),
    // Names you already know help the recognizer spell them right.
    contextualStrings: contextualStrings.slice(0, 100),
    iosTaskHint: "dictation",
  });

  return () => module.stop();
}

// Browsers end a "continuous" session on their own after pauses; we quietly
// restart it (keeping what was already heard) until the user taps stop.
function startWebListening(handlers: SpeechHandlers): () => void {
  const Recognition = webRecognizer();
  if (!Recognition) throw new Error("Speech recognition isn't available in this browser.");
  let heard = ""; // final text from earlier sessions
  let stopped = false;
  let restarts = 0;

  const run = () => {
    const rec = new Recognition();
    rec.lang = (typeof navigator !== "undefined" && navigator.language) || "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    let final = "";
    rec.onresult = (e) => {
      let interim = "";
      final = "";
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      handlers.onText(join(heard, final, interim));
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return; // restart or end handles it
      // Anything else (network, no microphone, blocked) ends the session.
      stopped = true;
      const blocked = e.error === "not-allowed" || e.error === "service-not-allowed";
      handlers.onError(blocked ? "not-allowed" : e.error, e.message ?? "");
    };
    rec.onend = () => {
      heard = join(heard, final, "");
      if (!stopped && restarts < 20) {
        restarts++;
        try { current = run(); return; } catch { /* fall through to end */ }
      }
      handlers.onEnd();
    };
    rec.start();
    return rec;
  };

  let current = run();
  return () => {
    stopped = true;
    current.stop();
  };
}

function join(...parts: string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).join(" ");
}
