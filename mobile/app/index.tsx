import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";

import { Avatar } from "@/components/Avatar";
import { Button, IconButton } from "@/components/Button";
import { CalendarBanner } from "@/components/CalendarBanner";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { NetworkGraph } from "@/components/NetworkGraph";
import { Page } from "@/components/Page";
import { Section } from "@/components/Section";
import { SessionOrbit } from "@/components/SessionOrbit";
import { SkeletonRows } from "@/components/Skeleton";
import { Txt } from "@/components/Txt";
import { useAccount } from "@/hooks/useAccount";
import { useCalendar } from "@/hooks/useCalendar";
import { useDesktop } from "@/hooks/useDesktop";
import { eventDate } from "@/lib/calendar";
import { toDateString } from "@/lib/dates";
import { formatRelative } from "@/lib/format";
import { dayHeading, dueLabel } from "@/lib/followUps";
import { layoutNetwork } from "@/lib/networkLayout";
import { firstName } from "@/lib/suggest";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";
import { getNetwork, incomingShares, listContacts, listFollowUps, updateFollowUp, upcomingEvents } from "@/services/nomi";
import type { ContactSummary, FollowUp, IncomingShare, NetworkResponse, UpcomingEvent } from "@/types/api";

function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

type UpcomingItem =
  | { kind: "followUp"; day: string; item: FollowUp }
  | { kind: "event"; day: string; item: UpcomingEvent };

export default function Home() {
  const s = useStyles();
  const router = useRouter();
  const desktop = useDesktop();
  const { colors } = useTheme();
  const account = useAccount();
  const calendar = useCalendar("/");
  const [people, setPeople] = useState<ContactSummary[] | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[] | null>(null);
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [network, setNetwork] = useState<NetworkResponse | null>(null);
  const [shares, setShares] = useState<IncomingShare[]>([]);

  const load = useCallback(() => {
    let active = true;
    listContacts().then((p) => active && setPeople(p)).catch(() => active && setPeople((c) => c ?? []));
    listFollowUps("open").then((f) => active && setFollowUps(f)).catch(() => active && setFollowUps((c) => c ?? []));
    getNetwork().then((n) => active && setNetwork(n)).catch(() => undefined);
    incomingShares().then((x) => active && setShares(x)).catch(() => undefined);
    upcomingEvents(7).then((r) => active && setEvents(r.events)).catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  useFocusEffect(load);

  const upcoming = useMemo<UpcomingItem[] | null>(() => {
    if (!followUps) return null;
    const horizon = toDateString(new Date(Date.now() + 7 * 86_400_000));
    const items: UpcomingItem[] = [
      ...followUps
        .filter((f) => f.dueAt && toDateString(new Date(f.dueAt)) <= horizon)
        .map((f) => ({ kind: "followUp" as const, day: toDateString(new Date(f.dueAt!)), item: f })),
      ...events.map((e) => ({ kind: "event" as const, day: eventDate(e.start, e.allDay) ?? "", item: e })).filter((e) => e.day),
    ];
    return items.sort((a, b) => a.day.localeCompare(b.day) || (a.kind === "event" ? -1 : 1));
  }, [followUps, events]);

  async function complete(item: FollowUp) {
    setFollowUps((current) => current?.filter((f) => f.id !== item.id) ?? null);
    try {
      await updateFollowUp(item.id, { status: "done" });
    } catch {
      load();
    }
  }

  const layout = useMemo(() => (network && network.people.length ? layoutNetwork(network) : null), [network]);
  const recent = (people ?? []).slice(0, 8);
  // Brand new account: nothing to show yet, so show one clear way in.
  const firstRun = people?.length === 0 && followUps?.length === 0 && events.length === 0;
  const openPerson = (id: string) => router.push({ pathname: "/contacts/[id]", params: { id } });
  const first = account.name.includes("@") ? "" : firstName(account.name);
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const capture = (
    <Card style={s.capture}>
      <View style={s.captureText}>
        <Txt variant="heading">Who did you meet?</Txt>
        <Txt variant="small">Say it in a sentence, or start a session at an event and Nomi fills in everyone you meet.</Txt>
      </View>
      <View style={s.captureButtons}>
        <Button title="Record" icon="mic" variant="primary" onPress={() => router.push("/record")} />
        <Button title="Type" icon="pen" onPress={() => router.push("/write")} />
        <Button title="Session" icon="radio" onPress={() => router.push("/session")} accessibilityLabel="Start a networking session" />
      </View>
    </Card>
  );

  const upcomingPanel = (
    <Section title="Upcoming" count={upcoming?.length} action={{ label: "Follow-ups", onPress: () => router.push("/follow-ups") }}>
      <CalendarBanner calendar={calendar} prompt="Connect Google Calendar to see your meetings here." />
      <Card padding="none">
        {!upcoming ? (
          <View style={s.pad}><SkeletonRows rows={4} avatar={false} /></View>
        ) : upcoming.length === 0 ? (
          <EmptyState compact icon="calendar" title="Nothing scheduled this week"
            action={<Button title="Add a follow-up" icon="plus" size="sm" onPress={() => router.push({ pathname: "/follow-ups", params: { add: "1" } })} />} />
        ) : (
          upcoming.slice(0, 6).map((entry, i) => {
            const heading = dayHeading(entry.day);
            const showHeading = i === 0 || dayHeading(upcoming[i - 1].day) !== heading;
            return (
              <View key={`${entry.kind}-${entry.kind === "event" ? entry.item.id : entry.item.id}`}>
                {showHeading && (
                  <Txt variant="overline" style={[s.dayHeading, heading === "Overdue" && { color: colors.danger }]}>{heading}</Txt>
                )}
                {entry.kind === "followUp" ? (
                  <FollowUpRow item={entry.item} onDone={() => void complete(entry.item)} onOpen={() => openPerson(entry.item.contactId)} />
                ) : (
                  <EventRow item={entry.item} onPerson={openPerson} />
                )}
              </View>
            );
          })
        )}
      </Card>
    </Section>
  );

  // Phones: one direction per section. Upcoming stacks down; recently met
  // scrolls sideways as cards, so the page never grows in two directions.
  const recentStrip = (
    <Section title="Recently met" action={{ label: "All", onPress: () => router.push("/contacts") }}>
      {!people ? (
        <SkeletonRows rows={2} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.stripScroll} contentContainerStyle={s.strip}>
          {recent.map((p) => (
            <Card key={p.id} onPress={() => openPerson(p.id)} accessibilityLabel={p.name} style={s.personCard}>
              <Avatar name={p.name} size={44} />
              <View style={s.personCardText}>
                <Txt variant="label" numberOfLines={1}>{p.name}</Txt>
                <Txt variant="caption" numberOfLines={2}>{p.role && p.company ? `${p.role}, ${p.company}` : p.role || p.company || p.school || "Contact"}</Txt>
              </View>
              <Txt variant="caption" tone="tertiary">{formatRelative(p.lastInteractionAt)}</Txt>
            </Card>
          ))}
        </ScrollView>
      )}
    </Section>
  );

  const recentPanel = (
    <Section title="Recently met" action={{ label: "Contacts", onPress: () => router.push("/contacts") }}>
      <Card padding="none">
        {!people ? (
          <View style={s.pad}><SkeletonRows rows={4} /></View>
        ) : recent.length === 0 ? (
          <EmptyState compact icon="userPlus" title="No contacts yet"
            body="Record a note after you meet someone."
            action={<Button title="Remember someone" icon="mic" size="sm" variant="primary" onPress={() => router.push("/record")} />} />
        ) : (
          <View style={s.listPad}>
            {recent.slice(0, 5).map((p) => (
              <Pressable key={p.id} onPress={() => openPerson(p.id)} accessibilityRole="button" accessibilityLabel={p.name}
                style={({ hovered }: { hovered?: boolean }) => [s.personRow, hovered && s.hover]}>
                <Avatar name={p.name} size={32} />
                <View style={s.flex}>
                  <Txt variant="label" numberOfLines={1}>{p.name}</Txt>
                  <Txt variant="caption" numberOfLines={1}>
                    {[p.role && p.company ? `${p.role}, ${p.company}` : p.role || p.company || p.school, p.lastEvent].filter(Boolean).join(" · ") || "Contact"}
                  </Txt>
                </View>
                <Txt variant="caption">{formatRelative(p.lastInteractionAt)}</Txt>
              </Pressable>
            ))}
          </View>
        )}
      </Card>
    </Section>
  );

  const networkPanel = (
    <Section title="Network" action={{ label: "Open map", onPress: () => router.push("/network") }}>
      <Card padding="none" onPress={() => router.push("/network")} accessibilityLabel="Open your network map">
        {layout ? (
          <NetworkGraph layout={layout} compact style={s.preview} />
        ) : (
          <View style={[s.preview, s.previewEmpty]}>
            <Txt variant="small" tone="tertiary">{people?.length === 0 ? "Your network appears as you add contacts" : " "}</Txt>
          </View>
        )}
      </Card>
    </Section>
  );

  return (
    <Page
      title={desktop ? `${greeting()}${first ? `, ${first}` : ""}` : undefined}
      subtitle={desktop ? today : undefined}
    >
      {!desktop && (
        <View style={s.phoneHeader}>
          <Logo size={24} />
          <View style={s.phoneActions}>
            <IconButton icon="search" label="Search" onPress={() => router.push("/search")} tone="plain" />
            <Pressable onPress={() => router.push("/profile")} accessibilityRole="button" accessibilityLabel="Profile">
              <Avatar name={account.name} uri={account.avatarUrl} size={40} />
            </Pressable>
          </View>
        </View>
      )}
      {!desktop && (
        <View style={s.phoneGreeting}>
          <Txt variant="title">{greeting()}{first ? `, ${first}` : ""}</Txt>
          <Txt variant="small">{today}</Txt>
        </View>
      )}

      {shares.length > 0 && (
        <Card onPress={() => router.push("/contacts")} style={s.share} accessibilityLabel="Review shared contacts">
          <Icon name="inbox" size={18} color={colors.supportText} />
          <Txt variant="label" style={s.flex}>
            {shares[0].senderName} shared {shares[0].count} contact{shares[0].count === 1 ? "" : "s"} with you
          </Txt>
          <Txt variant="small" tone="support" weight="600">Review</Txt>
        </Card>
      )}

      {/* On phones the main action lives in the floating + button. */}
      {desktop && capture}

      {firstRun && !desktop ? (
        <FirstRun />
      ) : desktop ? (
        <View style={s.columns}>
          <View style={s.main}>{upcomingPanel}</View>
          <View style={s.side}>
            {recentPanel}
            {networkPanel}
          </View>
        </View>
      ) : (
        <View style={s.phoneSections}>
          {upcomingPanel}
          {recent.length > 0 && recentStrip}
          {networkPanel}
        </View>
      )}
    </Page>
  );
}

// A brand new account on a phone: one calm screen and a pointer to the +
// button, the one thing to do first.
function FirstRun() {
  const s = useStyles();
  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(withSequence(withTiming(-6, { duration: 700, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 700, easing: Easing.inOut(Easing.sin) })), -1);
  }, [bob]);
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));
  return (
    <View style={s.firstRun}>
      <View style={s.firstRunHero}>
        <SessionOrbit size={220} listening={false} people={[]} />
        <Txt variant="display" align="center">Your network starts here</Txt>
        <Txt variant="bodySecondary" align="center" style={s.firstRunBody}>
          Everyone you meet becomes part of your orbit, with what you talked about and when to follow up.
        </Txt>
      </View>
      <Animated.View style={[s.tip, bobStyle]} accessibilityRole="text">
        <Txt variant="label">Tap + after you meet someone</Txt>
        <Txt variant="small">Say who they are in a sentence. Nomi fills in the rest.</Txt>
        <View style={s.tipArrow} />
      </Animated.View>
    </View>
  );
}

function FollowUpRow({ item, onDone, onOpen }: { item: FollowUp; onDone: () => void; onOpen: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const label = dueLabel(item.dueAt);
  const late = label.includes("late") || label === "Yesterday";
  return (
    <View style={s.row}>
      <Pressable onPress={onDone} accessibilityRole="checkbox" accessibilityState={{ checked: false }}
        accessibilityLabel={`Mark done: ${item.action}`} hitSlop={8}
        style={({ hovered }: { hovered?: boolean }) => [s.check, hovered && { borderColor: colors.accent }]} />
      {/* Just what to do and with whom; the day heading already says when. */}
      <Pressable onPress={onOpen} style={s.flex} accessibilityRole="link">
        <Txt variant="label" numberOfLines={1}>{item.action}</Txt>
        {item.contactName ? <Txt variant="caption" numberOfLines={1}>{item.contactName}</Txt> : null}
      </Pressable>
      {item.onCalendar && <Icon name="calendarCheck" size={15} color={colors.success} />}
      {late && <Txt variant="caption" style={{ color: colors.danger }}>{label}</Txt>}
    </View>
  );
}

function EventRow({ item, onPerson }: { item: UpcomingEvent; onPerson: (id: string) => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const time = item.allDay || !item.start ? "All day"
    : new Date(item.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return (
    <View style={s.row}>
      <View style={s.eventIcon}><Icon name="calendar" size={14} color={colors.supportText} /></View>
      <View style={s.flex}>
        <Txt variant="label" numberOfLines={1}>{item.title}</Txt>
        <Txt variant="caption" numberOfLines={1}>{time}</Txt>
      </View>
      {/* Who to catch there, as faces; tap one to open them. */}
      {item.people.length > 0 && (
        <View style={s.faces}>
          {item.people.slice(0, 3).map((p) => (
            <Pressable key={p.contactId} onPress={() => onPerson(p.contactId)} accessibilityRole="link"
              accessibilityLabel={`Talk to ${p.name}`} style={s.face}>
              <Avatar name={p.name} size={22} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    pad: { padding: space.md },
    listPad: { padding: space.xxs },
    phoneHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    phoneActions: { flexDirection: "row", alignItems: "center", gap: space.xs },
    phoneGreeting: { gap: 2, marginTop: -space.xs },
    capture: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },
    captureText: { flex: 1, minWidth: 200, gap: 2 },
    captureButtons: { flexDirection: "row", gap: space.xs },
    share: { flexDirection: "row", alignItems: "center", gap: space.sm, borderColor: colors.support },
    columns: { flexDirection: "row", alignItems: "flex-start", gap: space.lg },
    main: { flex: 1.5, minWidth: 0 },
    side: { flex: 1, minWidth: 0, gap: space.lg },
    phoneSections: { gap: space.xl },
    stripScroll: { marginHorizontal: -space.md },
    strip: { gap: space.sm, paddingHorizontal: space.md },
    personCard: { width: 156, gap: space.sm },
    personCardText: { gap: 2, minHeight: 56 },
    firstRun: { flex: 1, justifyContent: "space-between", gap: space.xl, minHeight: 520 },
    firstRunHero: { alignItems: "center", gap: space.md, paddingTop: space.lg },
    firstRunBody: { maxWidth: 320 },
    tip: {
      alignSelf: "flex-end",
      maxWidth: 270,
      gap: 2,
      padding: space.md,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.support,
      marginRight: 0,
    },
    // Points down at the + button (64pt wide, flush with the page edge).
    tipArrow: {
      position: "absolute",
      bottom: -7,
      right: 25,
      width: 14,
      height: 14,
      backgroundColor: colors.surface,
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.support,
      transform: [{ rotate: "45deg" }],
    },
    dayHeading: { paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.xxs },
    row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 52 },
    check: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.borderStrong },
    eventIcon: { width: 18, alignItems: "center" },
    faces: { flexDirection: "row" },
    face: { marginLeft: -6, borderRadius: 12, borderWidth: 2, borderColor: colors.surface },
    personRow: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.xs, borderRadius: radius.md },
    hover: { backgroundColor: colors.surfaceHover },
    preview: { height: 220, borderWidth: 0, borderRadius: 0 },
    previewEmpty: { alignItems: "center", justifyContent: "center" },
  }),
);
