// Records continuously and hands over audio in short chunks (about 30 s), so a
// long networking session is transcribed as it happens instead of at the end.
// Web: MediaRecorder (a new recorder starts the moment the last one stops, so
// nothing falls between chunks). Phones: expo-audio, which keeps recording
// with the screen locked. Demo mode: no microphone, just a steady clock.
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { isDemo } from "@/lib/demo";

export type RecorderState = "idle" | "starting" | "recording" | "denied" | "error";
export type Chunk = { seq: number; audio: string | Blob; ms: number };

const CHUNK_MS = 30_000;
const DEMO_CHUNK_MS = 4_000;

function webMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

export function useChunkRecorder(onChunk: (chunk: Chunk) => void) {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const native = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const running = useRef(false);
  const seq = useRef(0);
  const startedAt = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const current = useRef<MediaRecorder | null>(null);
  const emit = useRef(onChunk);
  emit.current = onChunk;

  // The session clock.
  useEffect(() => {
    if (state !== "recording") return;
    const tick = setInterval(() => setElapsedMs(Date.now() - startedAt.current), 500);
    return () => clearInterval(tick);
  }, [state]);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  // ---------- Web ----------
  const webChunk = useCallback(() => {
    if (!stream.current) return;
    const mimeType = webMimeType();
    const recorder = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
    const parts: Blob[] = [];
    const began = Date.now();
    const n = seq.current++;
    recorder.ondataavailable = (e) => e.data.size && parts.push(e.data);
    recorder.onstop = () => {
      if (parts.length) emit.current({ seq: n, audio: new Blob(parts, { type: recorder.mimeType }), ms: Date.now() - began });
    };
    recorder.start();
    current.current = recorder;
    later(() => {
      if (running.current) webChunk(); // the next one starts before this stops
      recorder.stop();
    }, CHUNK_MS);
  }, []);

  // ---------- Phones ----------
  const nativeChunk = useCallback(async () => {
    const began = Date.now();
    await native.prepareToRecordAsync();
    native.record();
    later(async () => {
      const n = seq.current++;
      await native.stop();
      if (native.uri) emit.current({ seq: n, audio: native.uri, ms: Date.now() - began });
      if (running.current) void nativeChunk();
    }, CHUNK_MS);
  }, [native]);

  // ---------- Demo ----------
  const demoChunk = useCallback(() => {
    later(() => {
      if (!running.current) return;
      emit.current({ seq: seq.current++, audio: new Blob(["demo"], { type: "audio/webm" }), ms: DEMO_CHUNK_MS });
      demoChunk();
    }, DEMO_CHUNK_MS);
  }, []);

  const start = useCallback(async (firstSeq = 0) => {
    if (running.current) return;
    setState("starting");
    seq.current = firstSeq;
    try {
      if (isDemo()) {
        // No microphone in the demo.
      } else if (Platform.OS === "web") {
        stream.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } else {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) {
          setState("denied");
          return;
        }
        // Keep recording with the screen locked or the app in the background.
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: true });
      }
    } catch (e) {
      const denied = e instanceof Error && /denied|not allowed|permission/i.test(e.name + e.message);
      setState(denied ? "denied" : "error");
      return;
    }
    running.current = true;
    startedAt.current = Date.now();
    setElapsedMs(0);
    setState("recording");
    if (isDemo()) demoChunk();
    else if (Platform.OS === "web") webChunk();
    else void nativeChunk();
  }, [demoChunk, nativeChunk, webChunk]);

  // Stop and hand over whatever was recorded since the last chunk.
  const stop = useCallback(async () => {
    if (!running.current) return;
    running.current = false;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (isDemo()) {
      // nothing to flush
    } else if (Platform.OS === "web") {
      if (current.current?.state === "recording") current.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    } else {
      const n = seq.current++;
      try {
        await native.stop();
        if (native.uri) emit.current({ seq: n, audio: native.uri, ms: 0 });
      } finally {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false });
      }
    }
    setState("idle");
  }, [native]);

  useEffect(() => () => {
    running.current = false;
    timers.current.forEach(clearTimeout);
    stream.current?.getTracks().forEach((t) => t.stop());
  }, []);

  return { state, elapsedMs, start, stop };
}
