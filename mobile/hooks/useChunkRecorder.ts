// Records continuously and hands over audio in short chunks (20 s), so a
// long networking session is transcribed as it happens instead of at the end.
// Web: MediaRecorder (a new recorder starts the moment the last one stops, so
// nothing falls between chunks). Phones: expo-audio, which keeps recording
// with the screen locked. Demo mode: no microphone, just a steady clock.
// Also reports a live input level (0..1) so the screen can show it's hearing.
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

const CHUNK_MS = 20_000;
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
  const [level, setLevel] = useState(0);
  const native = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const audioCtx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);
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

  // The input level, a few times a second.
  useEffect(() => {
    if (state !== "recording") {
      setLevel(0);
      return;
    }
    const buf = new Float32Array(1024);
    const tick = setInterval(() => {
      let next = 0;
      if (isDemo()) {
        const t = Date.now() / 260;
        next = 0.25 + 0.2 * Math.abs(Math.sin(t)) * Math.abs(Math.sin(t / 2.7)) + 0.1 * Math.random();
      } else if (Platform.OS === "web") {
        if (analyser.current) {
          analyser.current.getFloatTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += v * v;
          next = Math.min(1, Math.sqrt(sum / buf.length) * 6);
        }
      } else {
        const db = native.getStatus().metering;
        if (typeof db === "number") next = Math.max(0, Math.min(1, (db + 55) / 50));
      }
      setLevel((prev) => prev * 0.4 + next * 0.6);
    }, 120);
    return () => clearInterval(tick);
  }, [state, native]);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  // ---------- Web ----------
  function releaseWeb() {
    void audioCtx.current?.close().catch(() => undefined);
    audioCtx.current = null;
    analyser.current = null;
    void wakeLock.current?.release().catch(() => undefined);
    wakeLock.current = null;
  }

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
  // If the microphone is taken away for a moment (a phone call, Siri), try
  // again shortly instead of ending the session.
  const nativeChunk = useCallback(async () => {
    const began = Date.now();
    try {
      await native.prepareToRecordAsync();
      native.record();
    } catch {
      if (running.current) later(() => void nativeChunk(), 2_000);
      return;
    }
    later(async () => {
      const n = seq.current++;
      try {
        await native.stop();
        if (native.uri) emit.current({ seq: n, audio: native.uri, ms: Date.now() - began });
      } catch {
        // This chunk is lost; keep going.
      }
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

  // Resolves with how it went: "recording", "denied" or "error".
  const start = useCallback(async (firstSeq = 0): Promise<RecorderState> => {
    if (running.current) return "recording";
    setState("starting");
    seq.current = firstSeq;
    try {
      if (isDemo()) {
        // No microphone in the demo.
      } else if (Platform.OS === "web") {
        stream.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        try {
          const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          audioCtx.current = new Ctx();
          analyser.current = audioCtx.current.createAnalyser();
          analyser.current.fftSize = 1024;
          audioCtx.current.createMediaStreamSource(stream.current).connect(analyser.current);
        } catch {
          // No level meter; recording still works.
        }
        try {
          // Keep the screen awake: browsers pause the microphone when it locks.
          const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
          if (wl) wakeLock.current = await wl.request("screen");
        } catch {
          // Not allowed here; recording still works while the screen is on.
        }
      } else {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) {
          setState("denied");
          return "denied";
        }
        // Keep recording with the screen locked or the app in the background.
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: true });
      }
    } catch (e) {
      const denied = e instanceof Error && /denied|not allowed|permission/i.test(e.name + e.message);
      setState(denied ? "denied" : "error");
      return denied ? "denied" : "error";
    }
    running.current = true;
    startedAt.current = Date.now();
    setElapsedMs(0);
    setState("recording");
    if (isDemo()) demoChunk();
    else if (Platform.OS === "web") webChunk();
    else void nativeChunk();
    return "recording";
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
      releaseWeb();
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
    releaseWeb();
  }, []);

  return { state, elapsedMs, level, start, stop };
}
