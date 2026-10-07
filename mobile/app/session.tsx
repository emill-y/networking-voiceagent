import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { CloseButton } from "@/components/CloseButton";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/Input";
import { OrbitLoader } from "@/components/OrbitLoader";
import { Page } from "@/components/Page";
import { Reveal } from "@/components/Reveal";
import { SessionOrbit } from "@/components/SessionOrbit";
import { useToast } from "@/components/Toast";
import { Txt } from "@/components/Txt";
import { useDesktop } from "@/hooks/useDesktop";
import { useChunkRecorder, type Chunk } from "@/hooks/useChunkRecorder";
import { ApiError } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { onWatchStart, shareSessionWithWatch, watchSupported } from "@/lib/watch";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";
import { activeSession, deleteSession, finishSession, startSession, uploadSessionChunk } from "@/services/nomi";
import type { AmbientSession, ExtractedPerson } from "@/types/api";

type Stage = "setup" | "live" | "finishing";

// Ambient session: turn it on when you walk into an event; Nomi listens in
// 30-second chunks, finds the people you meet, and fills in what they said.
export default function Session() {
  const s = useStyles();
  const router = useRouter();
  const toast = useToast();
  const desktop = useDesktop();
  const { colors } = useTheme();
  const [stage, setStage] = useState<Stage>("setup");
  const [title, setTitle] = useState("");
  const [consent, setConsent] = useState(false);
  const [session, setSession] = useState<AmbientSession | null>(null);
  const [resumable, setResumable] = useState<AmbientSession | null>(null);
  const [people, setPeople] = useState<ExtractedPerson[]>([]);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [busy, setBusy] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const sessionRef = useRef<AmbientSession | null>(null);
  sessionRef.current = session;

  // Upload chunks one after another, retrying, so nothing is lost on a bad connection.
  const onChunk = useCallback((chunk: Chunk) => {
    const current = sessionRef.current;
    if (!current) return;
    setPending((n) => n + 1);
    queue.current = queue.current.then(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const progress = await uploadSessionChunk(current.id, chunk.seq, chunk.audio);
          setPeople(progress.people);
          setPending((n) => n - 1);
          return;
        } catch (e) {
          if (e instanceof ApiError && e.status !== null && e.status < 500 && e.status !== 429) break;
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
      setPending((n) => n - 1);
      setFailed((n) => n + 1);
    });
  }, []);

  const recorder = useChunkRecorder(onChunk);

  // A session still recording (another tab, the watch, or the app was closed)?
  useEffect(() => {
    activeSession().then(setResumable).catch(() => undefined);
  }, []);

  const begin = useCallback(async (existing?: AmbientSession) => {
    setBusy(true);
    try {
      const next = existing ?? (await startSession(title.trim() || null));
      setSession(next);
      sessionRef.current = next;
      setPeople(next.people);
      shareSessionWithWatch(next);
      await recorder.start(existing ? existing.chunks : 0);
      setStage("live");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Couldn’t start the session.", "danger");
    } finally {
      setBusy(false);
    }
  }, [recorder, title, toast]);

  // "Start" on the Apple Watch while this screen is open.
  useEffect(() => onWatchStart(() => {
    if (stage === "setup") void begin();
  }), [stage, begin]);

  async function end() {
    if (!session) return;
    setStage("finishing");
    await recorder.stop();
    await queue.current; // every chunk uploaded first
    shareSessionWithWatch(null);
    try {
      const finished = await finishSession(session.id);
      if (!finished.people.length) {
        toast.show("No one was clearly introduced, so nothing to save.");
        await deleteSession(session.id).catch(() => undefined);
        router.replace("/");
        return;
      }
      router.replace({ pathname: "/review", params: { session: session.id } });
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Couldn’t finish the session.", "danger");
      setStage("live");
    }
  }

  async function discard() {
    await recorder.stop();
    shareSessionWithWatch(null);
    if (session) await deleteSession(session.id).catch(() => undefined);
    router.replace("/");
  }

  if (stage === "finishing") {
    return (
      <Page tabBar={false} scroll={false}>
        <View style={s.centerFill}>
          <OrbitLoader size={96} label="Finding everyone you met" />
        </View>
      </Page>
    );
  }

  if (stage === "live" && session) {
    const names = people.map((p) => p.name ?? "").filter(Boolean);
    const status =
      recorder.state === "denied" ? "Microphone access is off"
      : recorder.state === "error" ? "The microphone stopped"
      : pending > 0 ? "Listening · catching up"
      : "Listening";
    return (
      <Page tabBar={false} width="narrow">
        <View style={s.liveTop}>
          <View style={s.livePill}>
            <View style={[s.liveDot, recorder.state !== "recording" && s.liveDotOff]} />
            <Txt variant="small" weight="600" tone="default">{status}</Txt>
          </View>
          <Txt variant="small" tone="secondary">{formatDuration(recorder.elapsedMs)}</Txt>
        </View>

        <View style={s.orbitWrap}>
          <SessionOrbit size={desktop ? 340 : 280} listening={recorder.state === "recording"} people={names} />
        </View>

        <View style={s.liveText}>
          <Txt variant="title" align="center">
            {names.length === 0 ? "Listening for introductions" : `${names.length} ${names.length === 1 ? "person" : "people"} so far`}
          </Txt>
          <Txt variant="small" align="center">
            {session.title ? `${session.title} · ` : ""}Keep your phone out or in a pocket. Details fill in as people talk.
          </Txt>
          {failed > 0 && <Txt variant="small" tone="danger" align="center">{failed} part{failed === 1 ? "" : "s"} couldn’t upload.</Txt>}
        </View>

        <View style={s.found}>
          {people.map((p) => (
            <Reveal key={p.name}>
              <Card style={s.personCard}>
                <Avatar name={p.name} size={36} />
                <View style={s.flex}>
                  <Txt variant="label">{p.name}</Txt>
                  <Txt variant="caption" numberOfLines={2}>
                    {[p.role && p.company ? `${p.role} at ${p.company}` : p.role || p.company, p.school, p.projects[0], p.interests[0]]
                      .filter(Boolean).join(" · ") || "Listening for details…"}
                  </Txt>
                </View>
              </Card>
            </Reveal>
          ))}
        </View>

        <View style={s.liveActions}>
          <Button title="End and review" icon="checkCircle" variant="primary" size="lg" fullWidth onPress={() => void end()} />
          <Button title="Discard session" variant="ghost" size="sm" onPress={() => void discard()} style={s.centerSelf} />
        </View>
      </Page>
    );
  }

  return (
    <Page tabBar={false} width="narrow">
      <CloseButton />
      <View style={s.hero}>
        <SessionOrbit size={desktop ? 240 : 200} listening={false} people={[]} />
        <Txt variant="display" align="center">Session</Txt>
        <Txt variant="bodySecondary" align="center" style={s.heroBody}>
          Turn it on when you walk into an event. Nomi listens, finds the people you meet, and fills in their details for you to check.
        </Txt>
      </View>

      {resumable && (
        <Card style={s.resume}>
          <Icon name="clock" size={18} color={colors.supportText} />
          <View style={s.flex}>
            <Txt variant="label">A session is still recording</Txt>
            <Txt variant="caption">{resumable.title ?? "Untitled"} · {resumable.people.length} found so far</Txt>
          </View>
          <Button title="Continue" variant="primary" size="sm" loading={busy} onPress={() => void begin(resumable)} />
        </Card>
      )}

      {!resumable && (
        <Card padding="lg" style={s.setup}>
          <Input label="Event (optional)" value={title} onChangeText={setTitle} placeholder="e.g. Cal Hacks mixer" maxLength={120} />
          <Pressable onPress={() => setConsent(!consent)} accessibilityRole="checkbox" accessibilityState={{ checked: consent }} style={s.consent}>
            <View style={[s.check, consent && s.checkOn]}>
              {consent && <Icon name="check" size={12} color={colors.onAccent} strokeWidth={3} />}
            </View>
            <Txt variant="small" tone="default" style={s.flex}>
              I’ll let people know I’m taking notes. In some places (including California) everyone in a conversation must agree to be recorded.
            </Txt>
          </Pressable>
          <Button title="Start session" icon="mic" variant="primary" size="lg" fullWidth disabled={!consent} loading={busy} onPress={() => void begin()} />
          <View style={s.facts}>
            <Fact icon="checkCircle" text="Audio is transcribed and deleted within seconds" />
            <Fact icon="checkCircle" text="Nothing is saved until you review it" />
            {watchSupported && <Fact icon="checkCircle" text="Open Nomi on your Apple Watch to record from your wrist" />}
          </View>
        </Card>
      )}
    </Page>
  );
}

function Fact({ icon, text }: { icon: "checkCircle"; text: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.fact}>
      <Icon name={icon} size={14} color={colors.success} />
      <Txt variant="caption" tone="secondary">{text}</Txt>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    centerFill: { flex: 1, alignItems: "center", justifyContent: "center" },
    centerSelf: { alignSelf: "center" },
    hero: { alignItems: "center", gap: space.sm },
    heroBody: { maxWidth: 440 },
    resume: { flexDirection: "row", alignItems: "center", gap: space.sm, borderColor: colors.support },
    setup: { gap: space.md },
    consent: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
    check: {
      width: 18,
      height: 18,
      marginTop: 1,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      alignItems: "center",
      justifyContent: "center",
    },
    checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    facts: { gap: space.xxs },
    fact: { flexDirection: "row", alignItems: "center", gap: space.xs },
    liveTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    livePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.xs,
      paddingVertical: 6,
      paddingHorizontal: space.sm,
      borderRadius: radius.pill,
      backgroundColor: colors.dangerSoft,
    },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
    liveDotOff: { backgroundColor: colors.textTertiary },
    orbitWrap: { alignItems: "center" },
    liveText: { gap: space.xxs, alignItems: "center" },
    found: { gap: space.xs },
    personCard: { flexDirection: "row", alignItems: "center", gap: space.sm },
    liveActions: { gap: space.xs, marginTop: space.sm },
  }),
);
