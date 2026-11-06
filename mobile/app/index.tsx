import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { Page } from "@/components/Page";
import { SkeletonRows } from "@/components/Skeleton";
import { Txt } from "@/components/Txt";
import { useAccount } from "@/hooks/useAccount";
import { useDesktop } from "@/hooks/useDesktop";
import { formatShortDate } from "@/lib/format";
import { groupSessions, namesLine, sessionLength } from "@/lib/sessions";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";
import { listSessions } from "@/services/nomi";
import type { AmbientSession } from "@/types/api";

// Home is your sessions: start one, pick up one that's running, review one
// that's finished, and look back at everyone you met at each.
export default function Sessions() {
  const s = useStyles();
  const router = useRouter();
  const desktop = useDesktop();
  const account = useAccount();
  const { colors } = useTheme();
  const [sessions, setSessions] = useState<AmbientSession[] | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listSessions()
        .then((list) => {
          if (!active) return;
          setSessions(list);
          setFailed(false);
        })
        .catch(() => {
          if (!active) return;
          setFailed(true);
          setSessions((c) => c ?? []);
        });
      return () => {
        active = false;
      };
    }, []),
  );

  const live = sessions?.find((x) => x.status === "recording") ?? null;
  const toReview = sessions?.filter((x) => x.status === "ready") ?? [];
  const past = sessions?.filter((x) => x.status === "saved") ?? [];
  const met = past.reduce((n, x) => n + (x.contacts?.length ?? 0), 0);

  return (
    <Page>
      {!desktop && (
        <View style={s.topBar}>
          <Logo size={24} />
          <Pressable onPress={() => router.push("/profile")} accessibilityRole="button" accessibilityLabel="Profile and settings" hitSlop={8}>
            <Avatar name={account.name} uri={account.avatarUrl} size={34} />
          </Pressable>
        </View>
      )}

      <View style={s.heading}>
        <Txt variant="display" accessibilityRole="header">Sessions</Txt>
        <Txt variant="bodySecondary">
          {past.length
            ? `${met} ${met === 1 ? "person" : "people"} from ${past.length} ${past.length === 1 ? "session" : "sessions"}`
            : "Start one when you walk into an event. Nomi listens and remembers everyone you meet."}
        </Txt>
      </View>

      {live ? (
        <LiveCard session={live} onPress={() => router.push("/session")} />
      ) : (
        <StartCard onPress={() => router.push("/session")} />
      )}

      {toReview.map((x) => (
        <Card key={x.id} onPress={() => router.push(`/sessions/${x.id}/review`)} style={s.review} accessibilityLabel={`Review ${x.title ?? "session"}`}>
          <View style={s.reviewDot} />
          <View style={s.flex}>
            <Txt variant="label">Ready to review · {x.title ?? "Untitled session"}</Txt>
            <Txt variant="small" numberOfLines={1}>
              {x.people.length
                ? `${x.people.length} ${x.people.length === 1 ? "person" : "people"} found: ${namesLine(x.people.map((p) => p.name ?? "").filter(Boolean))}`
                : "No one was found"}
            </Txt>
          </View>
          <Icon name="chevron" size={18} color={colors.textTertiary} />
        </Card>
      ))}

      {sessions === null ? (
        <SkeletonRows rows={4} avatar={false} />
      ) : past.length === 0 ? (
        failed ? (
          <Txt variant="small" align="center">Couldn’t load your sessions. Check your connection.</Txt>
        ) : (
          <HowItWorks />
        )
      ) : (
        <View style={s.groups}>
          {groupSessions(past).map(({ group, items }) => (
            <View key={group} style={s.group}>
              <Txt variant="overline">{group}</Txt>
              <View style={s.list}>
                {items.map((x, i) => (
                  <SessionRow key={x.id} session={x} first={i === 0} onPress={() => router.push(`/sessions/${x.id}`)} />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </Page>
  );
}

function StartCard({ onPress }: { onPress: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Card padding="lg" style={s.start}>
      <View style={s.startText}>
        <View style={s.startIcon}>
          <Icon name="mic" size={20} color={colors.text} />
        </View>
        <View style={s.flex}>
          <Txt variant="heading">New session</Txt>
          <Txt variant="small">Put your phone in your pocket and talk to people. You’ll review everyone at the end.</Txt>
        </View>
      </View>
      <Button title="Start session" icon="mic" variant="primary" size="lg" onPress={onPress} fullWidth />
    </Card>
  );
}

function LiveCard({ session, onPress }: { session: AmbientSession; onPress: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const names = session.people.map((p) => p.name ?? "").filter(Boolean);
  return (
    <Card onPress={onPress} padding="lg" style={s.live} accessibilityLabel="Return to the session that's recording">
      <View style={s.livePill}>
        <View style={s.liveDot} />
        <Txt variant="caption" weight="600" style={{ color: colors.live }}>Recording</Txt>
      </View>
      <Txt variant="heading">{session.title ?? "Session in progress"}</Txt>
      <Txt variant="small">
        {names.length ? `${names.length} found so far: ${namesLine(names)}` : "Listening for introductions"}
      </Txt>
      <Button title="Return to session" variant="primary" onPress={onPress} fullWidth />
    </Card>
  );
}

function SessionRow({ session, first, onPress }: { session: AmbientSession; first: boolean; onPress: () => void }) {
  const s = useStyles();
  const contacts = session.contacts ?? [];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={session.title ?? "Session"}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [s.row, !first && s.rowBorder, (hovered || pressed) && s.rowHover]}>
      <View style={s.flex}>
        <Txt variant="label" numberOfLines={1}>{session.title ?? "Untitled session"}</Txt>
        <Txt variant="small" numberOfLines={1}>
          {formatShortDate(session.startedAt)} · {sessionLength(session)}
          {contacts.length ? ` · ${namesLine(contacts.map((c) => c.name))}` : ""}
        </Txt>
      </View>
      <View style={s.faces}>
        {contacts.slice(0, 3).map((c, i) => (
          <View key={c.id} style={[s.face, i > 0 && s.faceOverlap]}>
            <Avatar name={c.name} size={26} />
          </View>
        ))}
        {contacts.length > 3 && <Txt variant="caption" style={s.more}>+{contacts.length - 3}</Txt>}
      </View>
    </Pressable>
  );
}

function HowItWorks() {
  const s = useStyles();
  const steps = [
    ["Start a session", "When you walk into an event, career fair or dinner."],
    ["Just talk", "Nomi listens in the background and picks out each person you meet: name, what they do, what you talked about."],
    ["Review at the end", "Check everyone in one list, fix anything, and save. Audio is never kept."],
  ];
  return (
    <View style={s.how}>
      <Txt variant="overline">How it works</Txt>
      {steps.map(([title, body], i) => (
        <View key={title} style={s.step}>
          <Txt variant="title" style={s.stepNum}>{i + 1}</Txt>
          <View style={s.flex}>
            <Txt variant="label">{title}</Txt>
            <Txt variant="small">{body}</Txt>
          </View>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    heading: { gap: space.xxs },
    start: { gap: space.md },
    startText: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
    startIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.sunken,
    },
    live: { gap: space.xs, borderColor: colors.live, backgroundColor: colors.surface },
    livePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      paddingHorizontal: space.xs,
      paddingVertical: 3,
      borderRadius: radius.pill,
      backgroundColor: colors.liveSoft,
    },
    liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.live },
    review: { flexDirection: "row", alignItems: "center", gap: space.sm },
    reviewDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning },
    groups: { gap: space.lg },
    group: { gap: space.xs },
    list: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 64 },
    rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
    rowHover: { backgroundColor: colors.surfaceHover },
    faces: { flexDirection: "row", alignItems: "center" },
    face: { borderRadius: 14, borderWidth: 2, borderColor: colors.surface },
    faceOverlap: { marginLeft: -8 },
    more: { marginLeft: space.xxs },
    how: { gap: space.md, paddingTop: space.xs },
    step: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
    stepNum: { width: 22, color: colors.textTertiary },
  }),
);
