import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { MicButton } from "@/components/MicButton";
import { Screen } from "@/components/Screen";
import { formatDuration } from "@/lib/format";
import { requestSpeechPermission, startListening } from "@/lib/speech";
import { colors, fonts, spacing, type } from "@/lib/theme";
import { listContacts } from "@/services/nomi";

const MAX_MS = 3 * 60 * 1000;

type Phase = "idle" | "listening" | "blocked" | "error";

// Live, on-device transcription: words appear while you talk, and the
// transcript is ready the moment you stop. Audio never leaves the phone
// on devices that support on-device recognition.
export function LiveCapture() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [text, setText] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const stopRef = useRef<(() => void) | null>(null);
  const textRef = useRef("");
  const finishing = useRef(false);
  const starting = useRef(false);

  // People you already know, so the recognizer spells their names right.
  useEffect(() => {
    listContacts()
      .then((people) => setNames(people.map((p) => p.name)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (phase !== "listening") return;
    const started = Date.now();
    const timer = setInterval(() => {
      const ms = Date.now() - started;
      setElapsed(ms);
      if (ms >= MAX_MS) stop();
    }, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Stop listening if the screen goes away mid-sentence.
  useEffect(() => () => stopRef.current?.(), []);

  function goToReview() {
    const transcript = textRef.current.trim();
    if (!transcript) {
      setPhase("idle");
      setMessage("I didn’t catch anything. Try again a little closer to the phone.");
      return;
    }
    router.replace({ pathname: "/review", params: { transcript, source: "voice" } });
  }

  async function start() {
    // Ignore extra taps while the microphone is still starting.
    if (starting.current) return;
    starting.current = true;
    try {
      await begin();
    } finally {
      starting.current = false;
    }
  }

  async function begin() {
    setMessage(null);
    const permission = await requestSpeechPermission();
    if (permission === "blocked") return setPhase("blocked");
    if (permission !== "granted") {
      setMessage("Nomi needs the microphone and speech recognition to hear your note.");
      return;
    }
    textRef.current = "";
    finishing.current = false;
    setText("");
    setElapsed(0);
    try {
      stopRef.current = startListening(
        {
          onText: (value) => {
            textRef.current = value;
            setText(value);
          },
          onError: (code) => {
            if (code === "no-speech" || code === "aborted") return; // handled on end
            if (code === "not-allowed") {
              finishing.current = false;
              setPhase("blocked");
            }
            else {
              setMessage("Listening stopped unexpectedly. You can try again or type instead.");
              setPhase("error");
            }
          },
          onEnd: () => {
            stopRef.current = null;
            if (finishing.current) goToReview();
            else setPhase((p) => (p === "listening" ? "idle" : p));
          },
        },
        names,
      );
      setPhase("listening");
    } catch {
      setMessage("Listening couldn’t start. You can type instead.");
      setPhase("error");
    }
  }

  function stop() {
    finishing.current = true;
    if (stopRef.current) stopRef.current();
    else goToReview();
  }

  const listening = phase === "listening";

  return (
    <Screen scroll={false}>
      <Pressable
        onPress={() => {
          stopRef.current?.();
          router.back();
        }}
        accessibilityRole="button"
        hitSlop={12}
      >
        <Text style={type.meta}>Close</Text>
      </Pressable>

      <View style={styles.top}>
        <Text style={[type.display, styles.title]}>
          {listening ? "Tell me about them." : "Who did you meet?"}
        </Text>
      </View>

      <ScrollView style={styles.transcriptBox} contentContainerStyle={styles.transcriptContent}>
        {text ? (
          <Text style={styles.transcript}>{text}</Text>
        ) : listening ? (
          <Text style={[type.meta, styles.placeholder]}>Listening…</Text>
        ) : null}
      </ScrollView>

      {phase === "blocked" ? (
        <View style={styles.block}>
          <Text style={[type.body, styles.center]}>
            {Platform.OS === "web"
              ? "Your browser blocked the microphone. Click the lock or mic icon in the address bar, allow it, then try again."
              : "Microphone or speech recognition is turned off for Nomi."}
          </Text>
          {Platform.OS === "web" ? (
            <Button title="Try again" variant="quiet" onPress={() => { setPhase("idle"); void start(); }} />
          ) : (
            <Button title="Open Settings" variant="quiet" onPress={() => void Linking.openSettings()} />
          )}
        </View>
      ) : (
        <View style={styles.controls}>
          <MicButton
            recording={listening}
            onPress={listening ? stop : () => void start()}
            accessibilityLabel={listening ? "Stop and remember" : "Start listening"}
          />
          <Text style={[styles.timer, !listening && styles.hidden]}>{formatDuration(elapsed)}</Text>
          <Text style={type.meta}>{listening ? "Tap when you’re done" : "Tap to start"}</Text>
          {!listening && (
            <Pressable onPress={() => router.replace("/write")} accessibilityRole="button" hitSlop={8}
              style={styles.typeInstead}>
              <Text style={type.meta}>or type instead</Text>
            </Pressable>
          )}
          {message && <Text style={[type.meta, styles.message]}>{message}</Text>}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    marginTop: spacing.xl,
  },
  title: {
    textAlign: "center",
  },
  transcriptBox: {
    flex: 1,
    marginVertical: spacing.lg,
  },
  transcriptContent: {
    flexGrow: 1,
    justifyContent: "flex-end",
  },
  transcript: {
    fontFamily: fonts.serifItalic,
    fontSize: 24,
    lineHeight: 32,
    color: colors.textSoft,
  },
  placeholder: {
    textAlign: "center",
  },
  controls: {
    alignItems: "center",
    paddingBottom: spacing.xl,
  },
  timer: {
    fontSize: 20,
    color: colors.text,
    fontVariant: ["tabular-nums"],
    marginBottom: spacing.xs,
  },
  hidden: {
    opacity: 0,
  },
  typeInstead: {
    marginTop: spacing.lg,
  },
  message: {
    marginTop: spacing.md,
    color: colors.accent,
    textAlign: "center",
  },
  block: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  center: {
    textAlign: "center",
  },
});
