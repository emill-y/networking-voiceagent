// The session that's recording right now, kept above every screen so it keeps
// going while you look something up in Search or the Map. Chunks upload one
// at a time with retries; a chunk that still fails is tried again before the
// session finishes, so a bad connection at an event loses nothing.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useChunkRecorder, type Chunk, type RecorderState } from "@/hooks/useChunkRecorder";
import { ApiError } from "@/lib/api";
import { MAX_ATTEMPTS, retryable, retryDelay } from "@/lib/sessions";
import { onWatchStart, shareSessionWithWatch } from "@/lib/watch";
import { activeSession, deleteSession, finishSession, startSession, uploadSessionChunk } from "@/services/nomi";
import type { AmbientSession, ExtractedPerson } from "@/types/api";

export type LiveStage = "idle" | "starting" | "live" | "finishing";

type LiveSession = {
  stage: LiveStage;
  session: AmbientSession | null;
  people: ExtractedPerson[];
  recorder: RecorderState;
  level: number;
  // Chunks waiting to upload, and chunks that couldn't be uploaded yet.
  pending: number;
  failed: number;
  // Words transcribed so far, so you can see it's actually hearing.
  words: number;
  // Why the last upload failed (shown while it keeps retrying), or null.
  problem: string | null;
  // A session still recording on the server that this device isn't recording (app was closed).
  orphan: AmbientSession | null;
  start: (title: string | null, you: string | null) => Promise<void>;
  resume: (existing: AmbientSession) => Promise<void>;
  // Stops recording and reads the whole session. Returns the session id if anyone was found.
  end: () => Promise<{ id: string; found: number } | null>;
  discard: () => Promise<void>;
  refreshOrphan: () => void;
};

const Ctx = createContext<LiveSession | null>(null);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function LiveSessionProvider({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<LiveStage>("idle");
  const [session, setSession] = useState<AmbientSession | null>(null);
  const [people, setPeople] = useState<ExtractedPerson[]>([]);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [orphan, setOrphan] = useState<AmbientSession | null>(null);
  const [words, setWords] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const sessionRef = useRef<AmbientSession | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const leftovers = useRef<Chunk[]>([]);
  const stopped = useRef(false); // the server said this session is no longer recording

  // Try one chunk up to `attempts` times. True when it reached the server.
  const send = useCallback(async (id: string, chunk: Chunk, attempts: number) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const progress = await uploadSessionChunk(id, chunk.seq, chunk.audio);
        if (sessionRef.current?.id === id) {
          setPeople(progress.people);
          setWords(progress.words);
          setProblem(null);
        }
        return true;
      } catch (e) {
        const status = e instanceof ApiError ? e.status : null;
        setProblem(e instanceof Error && e.message ? e.message : "Couldn’t reach Nomi.");
        if (status === 409 || status === 404) {
          stopped.current = true;
          return true; // nothing more to do for this session
        }
        if (!retryable(status)) return false;
        if (attempt < attempts - 1) await wait(retryDelay(attempt));
      }
    }
    return false;
  }, []);

  const onChunk = useCallback((chunk: Chunk) => {
    const current = sessionRef.current;
    if (!current || stopped.current) return;
    setPending((n) => n + 1);
    queue.current = queue.current.then(async () => {
      const ok = await send(current.id, chunk, MAX_ATTEMPTS);
      setPending((n) => n - 1);
      if (!ok) {
        leftovers.current.push(chunk);
        setFailed(leftovers.current.length);
      }
    });
  }, [send]);

  const rec = useChunkRecorder(onChunk);
  const { start: recStart, stop: recStop } = rec;

  const refreshOrphan = useCallback(() => {
    if (sessionRef.current) return;
    activeSession().then((s) => setOrphan(sessionRef.current ? null : s)).catch(() => undefined);
  }, []);

  useEffect(refreshOrphan, [refreshOrphan]);

  const begin = useCallback(async (next: AmbientSession, firstSeq: number) => {
    stopped.current = false;
    leftovers.current = [];
    setFailed(0);
    setPending(0);
    sessionRef.current = next;
    setSession(next);
    setPeople(next.people);
    setWords(next.words);
    setProblem(null);
    setOrphan(null);
    const mic = await recStart(firstSeq);
    if (mic !== "recording") {
      sessionRef.current = null;
      setSession(null);
      throw new Error(
        mic === "denied"
          ? "Nomi needs the microphone to record a session. Turn it on in Settings."
          : "Couldn’t start the microphone. Try again.",
      );
    }
    shareSessionWithWatch(next);
  }, [recStart]);

  const start = useCallback(async (title: string | null, you: string | null) => {
    if (sessionRef.current) return;
    setStage("starting");
    try {
      const created = await startSession(title, you);
      try {
        await begin(created, 0);
      } catch (e) {
        await deleteSession(created.id).catch(() => undefined);
        throw e;
      }
      setStage("live");
    } catch (e) {
      setStage("idle");
      // Already one recording (another device, or the app was closed): offer it.
      if (e instanceof ApiError && e.status === 409) refreshOrphan();
      throw e;
    }
  }, [begin, refreshOrphan]);

  const resume = useCallback(async (existing: AmbientSession) => {
    if (sessionRef.current) return;
    setStage("starting");
    try {
      // Number new chunks after everything already uploaded (gaps are fine).
      await begin(existing, existing.chunks + 1);
      setStage("live");
    } catch (e) {
      setStage("idle");
      setOrphan(existing);
      throw e;
    }
  }, [begin]);

  const clear = useCallback(() => {
    sessionRef.current = null;
    setSession(null);
    setPeople([]);
    setPending(0);
    setFailed(0);
    leftovers.current = [];
    setStage("idle");
  }, []);

  const end = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return null;
    setStage("finishing");
    await recStop();
    await queue.current; // every chunk uploaded (or given up on) first
    // One more go for anything that failed during the session.
    const retry = leftovers.current;
    leftovers.current = [];
    for (const chunk of retry) {
      if (!(await send(current.id, chunk, 3))) leftovers.current.push(chunk);
    }
    setFailed(leftovers.current.length);
    shareSessionWithWatch(null);
    try {
      const finished = await finishSession(current.id);
      clear();
      if (!finished.people.length) {
        await deleteSession(current.id).catch(() => undefined);
        return null;
      }
      return { id: current.id, found: finished.people.length };
    } catch (e) {
      // Couldn't reach the server: keep the session so "End" can be tried again.
      setStage("live");
      throw e;
    }
  }, [clear, recStop, send]);

  const discard = useCallback(async () => {
    const current = sessionRef.current ?? orphan;
    await recStop();
    shareSessionWithWatch(null);
    clear();
    setOrphan(null);
    if (current) await deleteSession(current.id).catch(() => undefined);
  }, [clear, orphan, recStop]);

  // "Start" pressed on the Apple Watch while the app is open.
  useEffect(() => onWatchStart(() => {
    if (!sessionRef.current) void start(null, null).catch(() => undefined);
  }), [start]);

  const value = useMemo<LiveSession>(() => ({
    stage, session, people, recorder: rec.state, level: rec.level, pending, failed, words, problem, orphan,
    start, resume, end, discard, refreshOrphan,
  }), [stage, session, people, rec.state, rec.level, pending, failed, words, problem, orphan, start, resume, end, discard, refreshOrphan]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLiveSession(): LiveSession {
  const value = useContext(Ctx);
  if (!value) throw new Error("useLiveSession needs LiveSessionProvider");
  return value;
}
