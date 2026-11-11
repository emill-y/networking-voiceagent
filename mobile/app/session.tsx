import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/Input";
import { OrbitLoader } from "@/components/OrbitLoader";
import { Page } from "@/components/Page";
import { Reveal } from "@/components/Reveal";
import { useToast } from "@/components/Toast";
import { Txt } from "@/components/Txt";
import { useAccount } from "@/hooks/useAccount";
import { useLiveSession } from "@/hooks/useLiveSession";
import { ApiError } from "@/lib/api";
import { confirm } from "@/lib/confirm";
import { formatDuration } from "@/lib/format";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";
import { watchSupported } from "@/lib/watch";
import { deleteSession, finishSession } from "@/services/nomi";
import type { AmbientSession, ExtractedPerson } from "@/types/api";

const CONSENT_KEY = "nomi.sessionConsent";

function message(e: unknown, fallback: string): string {
  return e instanceof ApiError || e instanceof Error ? e.message || fallback : fallback;
}

// One screen for the whole session: set it up, watch people appear while it
// listens, then end it and go straight to review.
export default function SessionScreen() {
  const live = useLiveSession();
  const router = useRouter();
  const toast = useToast();
  // "End" on the lock screen or Dynamic Island opens nomi://session?end=1.
  const params = useLocalSearchParams<{ end?: string }>();
  const ending = useRef(false);
  useEffect(() => {
    if (params.end !== "1" || live.stage !== "live" || ending.current) return;
    ending.current = true;
    router.setParams({ end: undefined });
    void end().finally(() => {
      ending.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.end, live.stage]);

  async function end() {
    try {
      const result = await live.end();
      if (result) router.replace(`/sessions/${result.id}/review`);
      else {
        toast.show("No one was clearly introduced, so there’s nothing to save.");
        router.replace("/");
      }
    } catch (e) {
      toast.show(message(e, "Couldn’t finish the session. Check your connection and try again."), "danger");
    }
  }

  if (live.stage === "finishing") {
    return (
      <Page tabBar={false} scroll={false}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <OrbitLoader size={80} label="Reading back the whole conversation to find everyone you met" />
        </View>
      </Page>
    );
  }
  if (live.stage === "live" && live.session) return <Live onEnd={() => void end()} />;
  return <Setup />;
}

function Setup() {
  const s = useStyles();
  const router = useRouter();
  const toast = useToast();
  const account = useAccount();
  const live = useLiveSession();
  const { colors } = useTheme();
  const [title, setTitle] = useState("");
  const [consent, setConsent] = useState(false);
  // The home screen widget opens nomi://session?start=1: start right away
  // if you've already agreed to the consent note (otherwise, show it first).
  const params = useLocalSearchParams<{ start?: string }>();
  const autoStarted = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(CONSENT_KEY)
      .then((v) => {
        if (v !== "1") return;
        setConsent(true);
        if (params.start === "1" && !autoStarted.current && !live.orphan && live.stage === "idle") {
          autoStarted.current = true;
          router.setParams({ start: undefined });
          void start();
        }
      })
      .catch(() => undefined);
    live.refreshOrphan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.start]);

  function toggleConsent() {
    const next = !consent;
    setConsent(next);
    void AsyncStorage.setItem(CONSENT_KEY, next ? "1" : "0").catch(() => undefined);
  }

  async function start() {
    const you = account.name && account.name !== "You" && !account.name.includes("@") ? account.name : null;
    try {
      await live.start(title.trim() || null, you);
    } catch (e) {
      toast.show(message(e, "Couldn’t start the session."), "danger");
    }
  }

  async function resume(existing: AmbientSession) {
    try {
      await live.resume(existing);
    } catch (e) {
      toast.show(message(e, "Couldn’t start the microphone."), "danger");
    }
  }

  const [closing, setClosing] = useState(false);
  async function finishOrphan(existing: AmbientSession) {
    setClosing(true);
    try {
      const finished = await finishSession(existing.id);
      if (finished.people.length) router.replace(`/sessions/${existing.id}/review`);
      else {
        await deleteSession(existing.id).catch(() => undefined);
        toast.show("No one was clearly introduced, so there’s nothing to save.");
        router.replace("/");
      }
    } catch (e) {
      toast.show(message(e, "Couldn’t finish the session."), "danger");
    } finally {
      setClosing(false);
    }
  }

  const orphan = live.orphan;
  const starting = live.stage === "starting";

  return (
    <Page tabBar={false} width="narrow" back={{ label: "Sessions", href: "/" }}>
      <View style={s.intro}>
        <Txt variant="display" accessibilityRole="header">New session</Txt>
        <Txt variant="bodySecondary">
          Start it as you walk in, then put your phone away. Nomi listens for introductions and keeps track of everyone you talk to.
        </Txt>
      </View>

      {orphan ? (
        <Card padding="lg" style={s.card}>
          <View style={s.pillRow}>
            <View style={[s.dot, { backgroundColor: colors.warning }]} />
            <Txt variant="caption" weight="600" style={{ color: colors.warning }}>Still open</Txt>
          </View>
          <Txt variant="heading">{orphan.title ?? "Untitled session"}</Txt>
          <Txt variant="small">
            This session stopped recording when the app closed. {orphan.people.length
              ? `${orphan.people.length} ${orphan.people.length === 1 ? "person" : "people"} found so far.`
              : "No one found yet."}
          </Txt>
          <Button title="Keep recording" icon="mic" variant="primary" size="lg" fullWidth loading={starting} onPress={() => void resume(orphan)} />
          <Button title="End it and review" variant="secondary" fullWidth loading={closing} onPress={() => void finishOrphan(orphan)} />
          <Button title="Discard it" variant="ghost" size="sm" onPress={async () => {
            if (await confirm("Discard this session?", "Everyone it found so far will be forgotten.", "Discard")) void live.discard();
          }} style={s.center} />
        </Card>
      ) : (
        <Card padding="lg" style={s.card}>
          <Input label="Where are you?" value={title} onChangeText={setTitle} placeholder="Cal Hacks, career fair, a dinner…"
            maxLength={120} returnKeyType="go" onSubmitEditing={() => consent && void start()} />
          <Pressable onPress={toggleConsent} accessibilityRole="checkbox" accessibilityState={{ checked: consent }} style={s.consent}>
            <View style={[s.check, consent && s.checkOn]}>
              {consent && <Icon name="check" size={12} color={colors.onAccent} strokeWidth={3} />}
            </View>
            <Txt variant="small" style={s.flex}>
              I’ll let people know I’m taking notes. Some places, including California, require everyone’s consent to record.
            </Txt>
          </Pressable>
          <Button title="Start session" icon="mic" variant="primary" size="lg" fullWidth disabled={!consent} loading={starting} onPress={() => void start()} />
        </Card>
      )}

      <View style={s.facts}>
        <Fact text="Audio is transcribed in 20-second pieces and never stored" />
        <Fact text="Nothing is added to your network until you review it" />
        <Fact text="Keeps recording with the screen locked" />
        {watchSupported && <Fact text="Or start it from Nomi on your Apple Watch" />}
      </View>
    </Page>
  );
}

function Fact({ text }: { text: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.fact}>
      <Icon name="check" size={14} color={colors.textTertiary} />
      <Txt variant="small" style={s.flex}>{text}</Txt>
    </View>
  );
}

function Live({ onEnd }: { onEnd: () => void }) {
  const s = useStyles();
  const router = useRouter();
  const live = useLiveSession();
  const { colors } = useTheme();
  const session = live.session!;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsed = now - Date.parse(session.startedAt);
  const people = live.people.filter((p) => p.name || p.label);
  const micProblem = live.recorder === "denied" ? "Microphone access is off" : live.recorder === "error" ? "The microphone stopped" : null;
  const status = micProblem ?? "Listening";
  const sync =
    live.problem && (live.failed > 0 || live.pending > 0) ? `Having trouble sending audio: ${live.problem} Still recording; it’ll keep retrying.`
    : live.failed > 0 ? `${live.failed} ${live.failed === 1 ? "piece is" : "pieces are"} waiting for a connection. They’ll be sent before the session ends.`
    : live.pending > 1 ? "Catching up…"
    : null;

  async function discard() {
    if (await confirm("Discard this session?", "Nothing from it will be saved.", "Discard")) {
      await live.discard();
      router.replace("/");
    }
  }

  return (
    <Page tabBar={false} width="narrow" back={{ label: "Sessions", href: "/" }}>
      <View style={s.liveHead}>
        <View style={[s.pillRow, s.livePill, micProblem && { backgroundColor: colors.dangerSoft }]}>
          <View style={[s.dot, { backgroundColor: micProblem ? colors.danger : colors.live }]} />
          <Txt variant="caption" weight="600" style={{ color: micProblem ? colors.danger : colors.live }}>{status}</Txt>
        </View>
        <Txt variant="display" style={s.timer} accessibilityLabel={`Recording for ${formatDuration(elapsed)}`}>{clock(elapsed)}</Txt>
        <Txt variant="bodySecondary" align="center">{session.title ?? "Untitled session"}</Txt>
        <Level level={micProblem ? 0 : live.level} />
        <Txt variant="caption">
          {live.words > 0 ? `Heard ${live.words.toLocaleString()} words` : "Waiting for the first 20 seconds of audio…"}
        </Txt>
      </View>

      <View style={s.found}>
        <View style={s.foundHead}>
          <Txt variant="overline">{people.length ? `${people.length} ${people.length === 1 ? "person" : "people"} so far` : "People you meet"}</Txt>
          {sync && <Txt variant="caption">{sync}</Txt>}
        </View>
        {people.length === 0 ? (
          <Card style={s.waiting}>
            <Txt variant="small" align="center">
              People appear here within a minute of talking to them, even if you never catch their name. What they do and what you talked about fill in as you go.
            </Txt>
          </Card>
        ) : (
          <View style={s.list}>
            {people.map((p, i) => (
              <Reveal key={p.name ?? p.label ?? String(i)}>
                <PersonRow person={p} first={i === 0} />
              </Reveal>
            ))}
          </View>
        )}
      </View>

      <View style={s.actions}>
        <Button title="End session" icon="check" variant="primary" size="lg" fullWidth onPress={onEnd} />
        <Txt variant="caption" align="center">You can leave this screen. Recording continues until you end it.</Txt>
        <Button title="Discard" variant="ghost" size="sm" onPress={() => void discard()} style={s.center} />
      </View>
    </Page>
  );
}

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

// A few bars that move with your voice, so it's obvious the mic is hearing.
function Level({ level }: { level: number }) {
  const s = useStyles();
  const shape = [0.45, 0.75, 1, 0.7, 0.5, 0.85, 0.6];
  return (
    <View style={s.level} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {shape.map((k, i) => (
        <View key={i} style={[s.bar, { height: 4 + Math.round(26 * Math.min(1, level * k * (0.8 + 0.4 * ((i * 37) % 10) / 10))) }]} />
      ))}
    </View>
  );
}

function PersonRow({ person, first }: { person: ExtractedPerson; first: boolean }) {
  const s = useStyles();
  const work = person.role && person.company ? `${person.role} at ${person.company}` : person.role || person.company;
  const line = [work, person.school, person.projects[0], person.needs[0] && `looking for ${person.needs[0]}`].filter(Boolean).join(" · ");
  return (
    <View style={[s.person, !first && s.personBorder]}>
      <Avatar name={person.name ?? "?"} size={36} />
      <View style={s.flex}>
        {person.name ? (
          <Txt variant="label">{person.name}</Txt>
        ) : (
          <Txt variant="label">{person.label} <Txt variant="caption">· name not heard</Txt></Txt>
        )}
        <Txt variant="small" numberOfLines={2}>{line || "Listening for details…"}</Txt>
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    center: { alignSelf: "center" },
    intro: { gap: space.xs },
    card: { gap: space.md },
    consent: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
    check: {
      width: 20,
      height: 20,
      marginTop: 1,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    facts: { gap: space.xs, paddingHorizontal: space.xxs },
    fact: { flexDirection: "row", alignItems: "center", gap: space.xs },
    pillRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    liveHead: { alignItems: "center", gap: space.xs, paddingTop: space.md },
    livePill: { paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.liveSoft },
    timer: { fontSize: 56, lineHeight: 64, letterSpacing: -1, fontVariant: ["tabular-nums"] },
    level: { flexDirection: "row", alignItems: "center", gap: 4, height: 34, marginTop: space.xs },
    bar: { width: 4, borderRadius: 2, backgroundColor: colors.live },
    found: { gap: space.xs },
    foundHead: { gap: 2 },
    waiting: { paddingVertical: space.lg },
    list: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
    person: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md },
    personBorder: { borderTopWidth: 1, borderTopColor: colors.border },
    actions: { gap: space.xs, marginTop: space.sm },
  }),
);
