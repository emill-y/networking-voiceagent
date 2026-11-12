import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { Txt } from "@/components/Txt";
import { useChunkRecorder, type Chunk } from "@/hooks/useChunkRecorder";
import { ApiError } from "@/lib/api";
import { confirm } from "@/lib/confirm";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";
import { deleteMyVoice, getMyVoice, saveMyVoice, type MyVoice } from "@/services/nomi";

// About 15 seconds of natural speech, with a mix of sounds.
const PASSAGE =
  "Hi, this is my voice for Nomi. I’m reading this out loud so it can learn how I sound. " +
  "When I meet someone new at an event, Nomi will know which voice is mine and which one is theirs. " +
  "That way it only remembers the people I actually talked to.";
const RECORD_MS = 15_000;
const MIN_MS = 8_000;

type Phase = "loading" | "idle" | "recording" | "saving";

// Record your voice once, so sessions know which voice is yours. Used on the
// You page and the "teach Nomi your voice" screen.
export function VoiceSetup({ onSaved }: { onSaved?: (voice: MyVoice) => void }) {
  const s = useStyles();
  const toast = useToast();
  const { colors } = useTheme();
  const [voice, setVoice] = useState<MyVoice | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<Chunk["audio"] | null>(null);
  const recorder = useChunkRecorder((chunk) => {
    audio.current = chunk.audio; // one recording, shorter than a chunk
  });

  useEffect(() => {
    getMyVoice()
      .then((v) => setVoice(v))
      .catch(() => setVoice({ saved: false, seconds: null, updatedAt: null }))
      .finally(() => setPhase("idle"));
  }, []);

  const finish = useCallback(async () => {
    setPhase("saving");
    await recorder.stop();
    // The browser hands over the recording a moment after it stops.
    for (let i = 0; i < 20 && !audio.current; i++) await new Promise((r) => setTimeout(r, 100));
    const recorded = audio.current;
    if (!recorded) {
      setError("Nothing was recorded. Check your microphone and try again.");
      setPhase("idle");
      return;
    }
    try {
      const saved = await saveMyVoice(recorded);
      setVoice(saved);
      toast.show("Your voice is saved", "success");
      onSaved?.(saved);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t save your voice. Check your connection and try again.");
    }
    setPhase("idle");
  }, [recorder, toast, onSaved]);

  // Stop by itself once the passage has had time to be read.
  useEffect(() => {
    if (phase === "recording" && recorder.elapsedMs >= RECORD_MS) void finish();
  }, [phase, recorder.elapsedMs, finish]);

  async function record() {
    setError(null);
    audio.current = null;
    const started = await recorder.start();
    if (started === "recording") setPhase("recording");
    else setError(started === "denied" ? "Nomi needs your microphone to learn your voice." : "Couldn’t start the microphone.");
  }

  async function forget() {
    if (!(await confirm("Delete your saved voice?", "Sessions will guess which voice is yours instead.", "Delete"))) return;
    try {
      await deleteMyVoice();
      setVoice({ saved: false, seconds: null, updatedAt: null });
    } catch {
      toast.show("Couldn’t delete your voice.", "danger");
    }
  }

  if (phase === "loading") return <Txt variant="small" tone="secondary">Checking…</Txt>;

  if (phase === "recording" || phase === "saving") {
    const left = Math.max(0, Math.ceil((RECORD_MS - recorder.elapsedMs) / 1000));
    return (
      <View style={s.wrap}>
        <Txt variant="label">{phase === "saving" ? "Learning your voice…" : "Read this aloud, at your normal volume:"}</Txt>
        <View style={s.passage}>
          <Txt variant="body">{PASSAGE}</Txt>
        </View>
        {phase === "recording" && (
          <>
            <View style={s.meterRow}>
              <View style={s.liveDot} />
              <View style={s.meter}>
                <View style={[s.meterFill, { width: `${Math.round(Math.min(1, recorder.level) * 100)}%` }]} />
              </View>
              <Txt variant="caption" style={s.timer}>{left}s</Txt>
            </View>
            <Button title="Done" variant="primary" disabled={recorder.elapsedMs < MIN_MS} onPress={() => void finish()} />
          </>
        )}
        {phase === "saving" && <Button title="Saving" variant="primary" loading disabled onPress={() => undefined} />}
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      {voice?.saved ? (
        <View style={s.status}>
          <Icon name="check" size={18} color={colors.success} />
          <View style={s.flex}>
            <Txt variant="label">Your voice is saved</Txt>
            <Txt variant="small">In sessions, Nomi knows which voice is yours and never adds you as someone you met.</Txt>
          </View>
        </View>
      ) : (
        <Txt variant="small">
          Record about 15 seconds of yourself reading a short passage. In sessions, Nomi can then tell your voice apart from
          the people you talk to. Only a voiceprint is kept, never the recording.
        </Txt>
      )}
      {error && <Txt variant="small" tone="danger">{error}</Txt>}
      <View style={s.buttons}>
        <Button title={voice?.saved ? "Record again" : "Record my voice"} icon="mic" variant={voice?.saved ? "secondary" : "primary"}
          size="sm" onPress={() => void record()} />
        {voice?.saved && <Button title="Delete" variant="ghost" size="sm" onPress={() => void forget()} />}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    wrap: { gap: space.sm },
    flex: { flex: 1, minWidth: 0 },
    status: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
    passage: { backgroundColor: colors.sunken, borderRadius: radius.md, padding: space.md },
    meterRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live },
    meter: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.sunken, overflow: "hidden" },
    meterFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
    timer: { width: 28, textAlign: "right" },
    buttons: { flexDirection: "row", gap: space.xs, flexWrap: "wrap" },
  }),
);
