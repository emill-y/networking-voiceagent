import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { Monogram } from "@/components/Monogram";
import { eyebrowStyle } from "@/components/PageHeader";
import { PillButton } from "@/components/PillButton";
import { ApiError } from "@/lib/api";
import { eventDate, eventWhen } from "@/lib/calendar";
import { calendarNotice, connectGoogleCalendar } from "@/lib/calendarConnect";
import { dateToDueAt } from "@/lib/dates";
import { firstName } from "@/lib/suggest";
import { colors, radius, spacing, type } from "@/lib/theme";
import { calendarStatus, createFollowUp, upcomingEvents } from "@/services/nomi";
import type { CalendarStatus, UpcomingEvent } from "@/types/api";

type Props = {
  // Where Google sends you back to after connecting (a path in the app).
  returnPath: string;
  limit?: number;
  onAdded?: () => void;
};

// Your next calendar events, each with the people worth talking to there.
// Before Google Calendar is connected, it offers to connect it.
export function ComingUp({ returnPath, limit = 4, onAdded }: Props) {
  const router = useRouter();
  const params = useLocalSearchParams<{ calendar?: string }>();
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [events, setEvents] = useState<UpcomingEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(() => {
    let active = true;
    calendarStatus()
      .then((s) => {
        if (!active) return;
        setStatus(s);
        if (s.connected) {
          upcomingEvents()
            .then((r) => active && setEvents(r.events))
            .catch((e) => active && setError(e instanceof ApiError ? e.message : "Couldn’t read your calendar."));
        }
      })
      .catch(() => active && setStatus(null));
    return () => {
      active = false;
    };
  }, []);
  useFocusEffect(load);

  async function connect() {
    setConnecting(true);
    try {
      await connectGoogleCalendar(returnPath);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t start Google sign-in.");
    } finally {
      setConnecting(false);
    }
  }

  async function followUp(event: UpcomingEvent, person: UpcomingEvent["people"][number]) {
    const key = `${event.id}:${person.contactId}`;
    setAdded((current) => new Set(current).add(key));
    const day = eventDate(event.start, event.allDay);
    try {
      await createFollowUp(person.contactId, `Talk to ${firstName(person.name)} at ${event.title}`, day ? dateToDueAt(day) : null);
      onAdded?.();
    } catch {
      setAdded((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  const notice = params.calendar ? calendarNotice[params.calendar] : null;
  if (!status?.available) return null;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconTile}><Icon name="calendar" size={18} color={colors.accentBright} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Coming up</Text>
          <Text style={type.meta}>
            {status.connected ? `From ${status.email ?? "your Google Calendar"}` : "Google Calendar"}
          </Text>
        </View>
      </View>

      {notice && <Text style={[type.meta, styles.notice]}>{notice}</Text>}

      {!status.connected ? (
        <>
          <Text style={styles.body}>
            Connect your calendar to see who to talk to before each class, meeting or event, and
            to put your follow-ups on your calendar automatically.
          </Text>
          <PillButton title="Connect Google Calendar" icon="calendar" variant="primary"
            loading={connecting} onPress={() => void connect()} />
        </>
      ) : error ? (
        <Text style={styles.body}>{error}</Text>
      ) : !events ? (
        <ActivityIndicator color={colors.accent} style={styles.loading} />
      ) : events.length === 0 ? (
        <Text style={styles.body}>Nothing on your calendar this week. Enjoy the quiet.</Text>
      ) : (
        events.slice(0, limit).map((event) => (
          <View key={event.id ?? event.title} style={styles.event}>
            <Pressable onPress={() => event.link && void Linking.openURL(event.link)} accessibilityRole="link">
              <Text style={styles.when}>{eventWhen(event.start, event.allDay)}</Text>
              <Text style={styles.title}>{event.title}</Text>
              {event.location ? <Text style={type.meta}>{event.location}</Text> : null}
            </Pressable>
            {event.people.length === 0 ? (
              <Text style={[type.meta, styles.nobody]}>No one from your notes matches this yet.</Text>
            ) : (
              event.people.map((person) => {
                const done = added.has(`${event.id}:${person.contactId}`);
                return (
                  <View key={person.contactId} style={styles.person}>
                    <Pressable onPress={() => router.push({ pathname: "/people/[id]", params: { id: person.contactId } })}
                      style={styles.personMain} accessibilityRole="link">
                      <Monogram name={person.name} size={30} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.personName}>Talk to {person.name}</Text>
                        <Text style={type.meta}>{person.why}</Text>
                      </View>
                    </Pressable>
                    <Pressable onPress={() => !done && void followUp(event, person)} disabled={done}
                      accessibilityRole="button" accessibilityLabel={`Follow up with ${person.name}`}
                      style={[styles.addChip, done && styles.addChipDone]} hitSlop={6}>
                      <Text style={styles.addChipText}>{done ? "Added ✓" : "+ Follow up"}</Text>
                    </Pressable>
                  </View>
                );
              })
            )}
          </View>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconTile: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 122, 42, 0.14)",
  },
  eyebrow: {
    ...eyebrowStyle,
    color: colors.textSoft,
  },
  notice: {
    color: colors.accentBright,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  loading: {
    paddingVertical: spacing.md,
  },
  event: {
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    gap: spacing.sm,
  },
  when: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.accent,
    letterSpacing: 0.4,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.text,
  },
  nobody: {
    fontStyle: "italic",
  },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  personMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  personName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSoft,
  },
  addChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255, 122, 42, 0.14)",
  },
  addChipDone: {
    backgroundColor: "rgba(143, 227, 176, 0.14)",
  },
  addChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.accentBright,
  },
});
