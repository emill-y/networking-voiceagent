import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

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
  const recent = (people ?? []).slice(0, 5);
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
          upcoming.slice(0, 9).map((entry, i) => {
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
            {recent.map((p) => (
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
            <IconButton icon="search" label="Search" onPress={() => router.push("/search")} />
            <IconButton icon="map" label="Map" onPress={() => router.push("/network")} />
            <Pressable onPress={() => router.push("/profile")} accessibilityRole="button" accessibilityLabel="Profile">
              <Avatar name={account.name} uri={account.avatarUrl} size={34} />
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

      {capture}

      {desktop ? (
        <View style={s.columns}>
          <View style={s.main}>{upcomingPanel}</View>
          <View style={s.side}>
            {recentPanel}
            {networkPanel}
          </View>
        </View>
      ) : (
        <>
          {upcomingPanel}
          {recentPanel}
          {networkPanel}
        </>
      )}
    </Page>
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
      <Pressable onPress={onOpen} style={s.flex} accessibilityRole="link">
        <Txt variant="label" numberOfLines={2}>{item.action}</Txt>
        <Txt variant="caption" numberOfLines={1}>{[item.contactName, item.context].filter(Boolean).join(" · ")}</Txt>
      </Pressable>
      {item.onCalendar && <Icon name="calendarCheck" size={15} color={colors.success} />}
      <Txt variant="caption" style={late ? { color: colors.danger } : undefined}>{label}</Txt>
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
        <Txt variant="caption" numberOfLines={1}>{[time, item.location].filter(Boolean).join(" · ")}</Txt>
        {item.people.length > 0 && (
          <View style={s.talkRow}>
            {item.people.slice(0, 2).map((p) => (
              <Pressable key={p.contactId} onPress={() => onPerson(p.contactId)} accessibilityRole="link" style={s.talk}>
                <Avatar name={p.name} size={18} />
                <Txt variant="caption" tone="secondary" weight="500">Talk to {firstName(p.name)}</Txt>
              </Pressable>
            ))}
          </View>
        )}
      </View>
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
    dayHeading: { paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.xxs },
    row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 52 },
    check: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.borderStrong },
    eventIcon: { width: 18, alignItems: "center" },
    talkRow: { flexDirection: "row", gap: space.xs, marginTop: 6, flexWrap: "wrap" },
    talk: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 3,
      paddingLeft: 3,
      paddingRight: space.xs,
      borderRadius: radius.pill,
      backgroundColor: colors.sunken,
    },
    personRow: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.xs, borderRadius: radius.md },
    hover: { backgroundColor: colors.surfaceHover },
    preview: { height: 220, borderWidth: 0, borderRadius: 0 },
    previewEmpty: { alignItems: "center", justifyContent: "center" },
  }),
);
