import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { CloseButton } from "@/components/CloseButton";
import { Button } from "@/components/Button";
import { MicButton } from "@/components/MicButton";
import { Page } from "@/components/Page";
import { formatDuration } from "@/lib/format";
import { makeStyles, space, useTheme } from "@/lib/theme";

// Matches the backend's upload limit comfortably: 3 minutes of AAC is ~3 MB.
const MAX_RECORDING_MS = 3 * 60 * 1000;

type Phase = "idle" | "denied" | "recording" | "recorded" | "error";

// Fallback capture: record audio, then transcribe it on the backend.
// Used where on-device speech recognition isn't available (Expo Go, web).
export function AudioCapture() {
  const styles = useStyles();
  const { type } = useTheme();
  const router = useRouter();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [phase, setPhase] = useState<Phase>("idle");
  const [uri, setUri] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const stopping = useRef(false);
  const starting = useRef(false);

  const player = useAudioPlayer(uri);
  const playback = useAudioPlayerStatus(player);

  // Know up front if permission was already denied, so we can explain it
  // instead of showing a mic that silently does nothing.
  useEffect(() => {
    getRecordingPermissionsAsync()
      .then((permission) => {
        if (!permission.granted && !permission.canAskAgain) setPhase("denied");
      })
      .catch(() => undefined);
  }, []);

  async function startRecording() {
    // Ignore extra taps while the microphone is still starting.
    if (starting.current) return;
    starting.current = true;
    setMessage(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setPhase("denied");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setUri(null);
      setPhase("recording");
    } catch {
      setMessage("The microphone couldn’t start. Please try again.");
      setPhase("error");
    } finally {
      starting.current = false;
    }
  }

  async function stopRecording() {
    if (stopping.current) return;
    stopping.current = true;
    try {
      const elapsed = recorderState.durationMillis;
      await recorder.stop();
      // Route audio back to the speaker for playback on iOS.
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (!recorder.uri) throw new Error("No recording file");
      setDurationMs(elapsed);
      setUri(recorder.uri);
      setPhase("recorded");
    } catch {
      setMessage("Something went wrong saving that recording.");
      setPhase("error");
    } finally {
      stopping.current = false;
    }
  }

  // Auto-stop long recordings so uploads stay within the backend's limit.
  useEffect(() => {
    if (phase === "recording" && recorderState.durationMillis >= MAX_RECORDING_MS) {
      void stopRecording();
    }
    // stopRecording is stable enough for this check; re-running on duration is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, recorderState.durationMillis]);

  function togglePlayback() {
    if (playback.playing) {
      player.pause();
      return;
    }
    if (playback.didJustFinish || playback.currentTime >= playback.duration - 0.05) {
      void player.seekTo(0);
    }
    player.play();
  }

  function discard() {
    player.pause();
    setUri(null);
    setDurationMs(0);
    setPhase("idle");
  }

  function remember() {
    if (!uri) return;
    player.pause();
    router.replace({ pathname: "/review", params: { uri } });
  }

  const recording = phase === "recording";

  return (
    <Page scroll={false}>
      <CloseButton />

      <View style={styles.center}>
        <Text style={[type.display, styles.title]}>
          {recording
            ? "Tell me about them."
            : phase === "recorded"
              ? "Listen back."
              : "Who did you meet?"}
        </Text>

        {phase === "denied" ? (
          <View style={styles.block}>
            <Text style={[type.body, styles.centerText]}>
              Nomi needs microphone access to hear your notes. Recording only
              happens while you hold this screen open and tap record.
            </Text>
            {Platform.OS !== "web" && (
              <Button title="Open Settings" variant="secondary" onPress={() => void Linking.openSettings()} />
            )}
          </View>
        ) : phase === "recorded" ? (
          <View style={styles.block}>
            <Pressable
              onPress={togglePlayback}
              accessibilityRole="button"
              accessibilityLabel={playback.playing ? "Pause playback" : "Play recording"}
              style={styles.playRow}
            >
              <Text style={styles.playGlyph}>{playback.playing ? "❚❚" : "▶"}</Text>
              <Text style={type.small}>
                {formatDuration((playback.currentTime || 0) * 1000)} / {formatDuration(durationMs)}
              </Text>
            </Pressable>
            <Button variant="primary" size="lg" title="Remember this" onPress={remember} />
            <Button title="Record again" variant="secondary" onPress={discard} />
          </View>
        ) : (
          <>
            <MicButton
              recording={recording}
              onPress={recording ? () => void stopRecording() : () => void startRecording()}
              accessibilityLabel={recording ? "Stop recording" : "Start recording"}
            />
            <Text style={[styles.timer, !recording && styles.hidden]} accessibilityLiveRegion="polite">
              {formatDuration(recorderState.durationMillis)}
            </Text>
            <Text style={type.small}>{recording ? "Tap to stop" : "Tap to record"}</Text>
            {recording ? (
              <Text style={[type.small, styles.recordingNote]}>● Recording</Text>
            ) : (
              <Pressable
                onPress={() => router.replace("/write")}
                accessibilityRole="button"
                hitSlop={8}
                style={styles.typeInstead}
              >
                <Text style={type.small}>or type instead</Text>
              </Pressable>
            )}
          </>
        )}

        {message && <Text style={[type.small, styles.error]}>{message}</Text>}
      </View>
    </Page>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: space.xxl,
  },
  title: {
    textAlign: "center",
    marginBottom: space.xl,
  },
  block: {
    alignSelf: "stretch",
    gap: space.md,
  },
  centerText: {
    textAlign: "center",
  },
  timer: {
    fontSize: 20,
    color: colors.text,
    fontVariant: ["tabular-nums"],
    marginBottom: space.xxs,
  },
  hidden: {
    opacity: 0,
  },
  recordingNote: {
    marginTop: space.md,
    color: colors.accent,
  },
  playRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
    paddingVertical: space.md,
    marginBottom: space.xs,
    backgroundColor: colors.sunken,
    borderRadius: 999,
  },
  playGlyph: {
    color: colors.text,
    fontSize: 16,
    width: 20,
    textAlign: "center",
  },
  typeInstead: {
    marginTop: space.xl,
  },
  error: {
    marginTop: space.lg,
    color: colors.danger,
    textAlign: "center",
  },
}),
);
