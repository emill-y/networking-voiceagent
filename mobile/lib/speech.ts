// On-device speech recognition (Apple's Speech framework on iOS, the
// system recognizer on Android) via expo-speech-recognition.
//
// It's a native module, so it's missing in Expo Go and on web. We load it
// defensively; callers check `liveTranscriptionAvailable()` and otherwise
// fall back to recording audio and transcribing on the backend.
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

export function liveTranscriptionAvailable(): boolean {
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
  if (!speech) return "denied";
  const result = await speech.ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (result.granted) return "granted";
  return result.canAskAgain ? "denied" : "blocked";
}

// Starts listening. Returns a function that stops (and delivers the final text).
export function startListening(handlers: SpeechHandlers, contextualStrings: string[] = []): () => void {
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
