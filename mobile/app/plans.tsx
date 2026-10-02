import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";

import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { Monogram } from "@/components/Monogram";
import { PageHeader, eyebrowStyle } from "@/components/PageHeader";
import { PillButton } from "@/components/PillButton";
import { Screen } from "@/components/Screen";
import { useDesktop } from "@/hooks/useDesktop";
import { useProfile } from "@/hooks/useProfile";
import { ApiError } from "@/lib/api";
import { eventDate } from "@/lib/calendar";
import { dateToDueAt } from "@/lib/dates";
import { goAction, inviteText, parseInterests, placeLine, planWhen } from "@/lib/plans";
import { saveProfile } from "@/lib/profile";
import { colors, radius, spacing, type } from "@/lib/theme";
import { addEventFeed, createFollowUp, getPlans, listEventFeeds, removeEventFeed } from "@/services/nomi";
import type { EventFeed, Plan, PlanPerson, PlansResponse, RealEvent } from "@/types/api";

// What a plan looks like before there are any (never a blank page).
const SAMPLE: Plan = {
  event: {
    id: "sample", title: "Chemistry mixer", start: "2026-10-03", end: null, allDay: true,
    city: "Latimer Hall", country: null, online: false, url: null, source: "feed",
    sourceLabel: "Your club’s calendar", topics: [], where: "local", people: [],
  },
  people: [{ contactId: "sample", name: "Annie Park", why: null }],
  shared: "chemistry",
  why: "You’re both into chemistry, and Annie wants to meet grad students.",
};

async function shareText(message: string): Promise<"shared" | "copied"> {
  if (Platform.OS === "web") {
    if (typeof navigator.share === "function") {
      await navigator.share({ text: message });
      return "shared";
    }
    await navigator.clipboard.writeText(message);
    return "copied";
  }
  await Share.share({ message });
  return "shared";
}

export default function GoTogether() {
  const router = useRouter();
  const desktop = useDesktop();
  const profile = useProfile();
  const [city, setCity] = useState(profile?.city ?? "");
  const [interests, setInterests] = useState(
    (profile?.interests ?? [profile?.major].filter(Boolean) as string[]).join(", "),
  );
  const [data, setData] = useState<PlansResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [feeds, setFeeds] = useState<EventFeed[]>([]);
  const [feedUrl, setFeedUrl] = useState("");
  const [feedNote, setFeedNote] = useState<string | null>(null);
  const [addingFeed, setAddingFeed] = useState(false);

  async function load(nextCity = city, nextInterests = interests) {
    setLoading(true);
    setError(null);
    try {
      setData(await getPlans(nextCity.trim(), parseInterests(nextInterests)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t find events right now.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    listEventFeeds().then(setFeeds).catch(() => undefined);
    // Only on open; "Update" reloads with new settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function update() {
    const wanted = parseInterests(interests);
    void saveProfile({ ...(profile ?? { persona: "other" }), city: city.trim(), interests: wanted }).catch(() => undefined);
    await load(city, wanted.join(", "));
  }

  async function plan(event: RealEvent, people: PlanPerson[]) {
    const key = `${event.id}:${people.map((p) => p.contactId).join(",")}`;
    setDone((d) => ({ ...d, [key]: "saving" }));
    try {
      const day = eventDate(event.start, event.allDay);
      for (const person of people) {
        await createFollowUp(person.contactId, goAction(person.name, event.title), day ? dateToDueAt(day) : null);
      }
      setDone((d) => ({ ...d, [key]: "planned" }));
    } catch {
      setDone((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
    }
  }

  async function invite(event: RealEvent, person: PlanPerson, shared: string) {
    const key = `invite:${event.id}:${person.contactId}`;
    try {
      const how = await shareText(inviteText(person.name, event, shared));
      setDone((d) => ({ ...d, [key]: how }));
    } catch {
      // Closing the share sheet isn't an error.
    }
  }

  async function addFeed() {
    setAddingFeed(true);
    setFeedNote(null);
    try {
      const { feed, upcoming } = await addEventFeed(feedUrl.trim());
      setFeeds((current) => [...current, feed]);
      setFeedUrl("");
      setFeedNote(`Added ${feed.label}: ${upcoming} upcoming event${upcoming === 1 ? "" : "s"}.`);
      void load();
    } catch (e) {
      setFeedNote(e instanceof ApiError ? e.message : "Couldn’t add that calendar.");
    } finally {
      setAddingFeed(false);
    }
  }

  async function dropFeed(feed: EventFeed) {
    setFeeds((current) => current.filter((f) => f.id !== feed.id));
    await removeEventFeed(feed.id).catch(() => undefined);
    void load();
  }

  const plans = data?.plans ?? [];
  const planned = new Set(plans.map((p) => p.event.id));
  const more = (data?.events ?? []).filter((e) => !planned.has(e.id)).slice(0, 12);
  const hasCalendar = data?.sources.some((s) => s.kind === "calendar");

  return (
    <Screen wide={desktop}>
      <PageHeader eyebrow="Real events, real people" title="Go together"
        subtitle="Real events coming up, and who from your notes to bring. Plan it and it lands in your follow-ups and calendar." />

      <Card style={styles.settings}>
        <View style={[styles.settingsRow, !desktop && styles.stack]}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Your city</Text>
            <TextInput value={city} onChangeText={setCity} placeholder="e.g. San Francisco, CA"
              placeholderTextColor={colors.faint} selectionColor={colors.accent} style={styles.input}
              accessibilityLabel="Your city" onSubmitEditing={() => void update()} />
          </View>
          <View style={[styles.field, styles.fieldWide]}>
            <Text style={styles.fieldLabel}>You’re into</Text>
            <TextInput value={interests} onChangeText={setInterests} placeholder="e.g. startups, chemistry, design"
              placeholderTextColor={colors.faint} selectionColor={colors.accent} style={styles.input}
              accessibilityLabel="Your interests, separated by commas" onSubmitEditing={() => void update()} />
          </View>
          <View style={styles.updateButton}>
            <PillButton title="Find events" icon="search" variant="primary" loading={loading} onPress={() => void update()} />
          </View>
        </View>
      </Card>

      {error && <Text style={[type.body, styles.error]}>{error}</Text>}

      <Text style={styles.sectionLabel}>Plans for you</Text>
      {loading && !data ? (
        <Card style={styles.loadingCard}>
          <ActivityIndicator color={colors.accent} />
          <Text style={type.meta}>Finding real events and matching them to your people…</Text>
        </Card>
      ) : (
        <View style={[styles.grid, desktop && styles.gridDesktop]}>
          {(plans.length ? plans : [SAMPLE]).map((p) => {
            const sample = p.event.id === "sample";
            const key = `${p.event.id}:${p.people.map((x) => x.contactId).join(",")}`;
            const state = done[key];
            const names = p.people.map((x) => x.name.split(" ")[0]).join(" & ");
            return (
              <Card key={key} style={[styles.planCard, desktop && styles.planCardDesktop]}>
                <View style={styles.planTop}>
                  <View style={styles.datePill}><Text style={styles.dateText}>{planWhen(p.event)}</Text></View>
                  {sample ? (
                    <View style={styles.sampleBadge}><Text style={styles.sampleText}>Example</Text></View>
                  ) : (
                    <Text style={styles.sourceText} numberOfLines={1}>{p.event.sourceLabel}</Text>
                  )}
                </View>
                <Pressable disabled={!p.event.url} onPress={() => p.event.url && void Linking.openURL(p.event.url)}
                  accessibilityRole="link">
                  <Text style={styles.planTitle}>{p.event.title}</Text>
                </Pressable>
                {placeLine(p.event) ? <Text style={type.meta}>{placeLine(p.event)}</Text> : null}
                <View style={styles.withRow}>
                  <View style={styles.faces}>
                    {p.people.map((x) => <Monogram key={x.contactId} name={x.name} size={34} />)}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.withText}>Go with {names}</Text>
                    {p.shared ? <Text style={styles.shared}>Both into {p.shared}</Text> : null}
                  </View>
                </View>
                <Text style={styles.why}>{p.why}</Text>
                {sample ? (
                  <Text style={type.meta}>
                    Remember people and add your city and interests: real plans show up here.
                  </Text>
                ) : (
                  <View style={styles.actions}>
                    <PillButton
                      title={state === "planned" ? "Planned ✓" : "Plan it"}
                      icon={state === "planned" ? undefined : "calendar"}
                      variant="primary" loading={state === "saving"} disabled={state === "planned"}
                      onPress={() => void plan(p.event, p.people)} />
                    {p.people.map((x) => {
                      const sent = done[`invite:${p.event.id}:${x.contactId}`];
                      return (
                        <PillButton key={x.contactId} icon="message"
                          title={sent === "copied" ? "Invite copied" : `Invite ${x.name.split(" ")[0]}`}
                          onPress={() => void invite(p.event, x, p.shared)} />
                      );
                    })}
                  </View>
                )}
                {state === "planned" && (
                  <Text style={[type.meta, styles.plannedNote]}>
                    Added to your follow-ups{hasCalendar ? " and Google Calendar" : ""}.
                  </Text>
                )}
              </Card>
            );
          })}
        </View>
      )}

      {more.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>More real events</Text>
          <Card style={styles.listCard}>
            {more.map((event) => {
              const person = event.people[0];
              const key = person ? `${event.id}:${person.contactId}` : event.id;
              const state = done[key];
              return (
                <View key={event.id} style={styles.eventRow}>
                  <View style={styles.eventDate}>
                    <Text style={styles.eventDateText}>{planWhen(event)}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Pressable disabled={!event.url} onPress={() => event.url && void Linking.openURL(event.url)}
                      accessibilityRole="link">
                      <Text style={styles.eventTitle}>{event.title}</Text>
                    </Pressable>
                    <Text style={type.meta} numberOfLines={1}>
                      {[placeLine(event), event.sourceLabel].filter(Boolean).join(" · ")}
                    </Text>
                    {person ? (
                      <Text style={styles.eventPeople} numberOfLines={1}>
                        Bring {event.people.map((x) => x.name.split(" ")[0]).join(", ")} · {person.why}
                      </Text>
                    ) : (
                      <Text style={[type.meta, styles.nobody]}>No one from your notes matches yet</Text>
                    )}
                  </View>
                  {person && (
                    <Pressable onPress={() => state !== "planned" && void plan(event, [person])}
                      disabled={state === "planned" || state === "saving"} accessibilityRole="button"
                      accessibilityLabel={`Plan ${event.title} with ${person.name}`} hitSlop={6}
                      style={[styles.addChip, state === "planned" && styles.addChipDone]}>
                      <Text style={styles.addChipText}>{state === "planned" ? "Planned ✓" : "+ Plan"}</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </Card>
        </>
      )}

      <Text style={styles.sectionLabel}>Where events come from</Text>
      <Card style={styles.sourcesCard}>
        {(data?.sources ?? []).filter((s) => s.kind !== "feed").map((s) => (
          <View key={s.label} style={styles.sourceRow}>
            <View style={styles.iconTile}>
              <Icon name={s.kind === "calendar" ? "calendar" : "spark"} size={16} color={colors.accentBright} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sourceName}>{s.label}</Text>
              <Text style={type.meta}>
                {s.kind === "conferences"
                  ? `${s.events} upcoming · free, community-maintained data on GitHub`
                  : `${s.events} upcoming events you’re already going to`}
              </Text>
            </View>
            {s.url && (
              <Pressable onPress={() => void Linking.openURL(s.url!)} accessibilityRole="link" hitSlop={6}>
                <Text style={styles.link}>Source ↗</Text>
              </Pressable>
            )}
          </View>
        ))}
        {data && !hasCalendar && (
          <Pressable onPress={() => router.push("/you")} style={styles.sourceRow} accessibilityRole="link">
            <View style={styles.iconTile}><Icon name="calendar" size={16} color={colors.faint} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sourceName}>Google Calendar</Text>
              <Text style={type.meta}>Connect it on You to plan around events you’re already going to</Text>
            </View>
            <Icon name="chevron" size={16} color={colors.faint} />
          </Pressable>
        )}
        {feeds.map((feed) => {
          const count = data?.sources.find((s) => s.kind === "feed" && s.url === feed.url)?.events;
          return (
            <View key={feed.id} style={styles.sourceRow}>
              <View style={styles.iconTile}><Icon name="calendar" size={16} color={colors.accentBright} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sourceName} numberOfLines={1}>{feed.label}</Text>
                <Text style={type.meta} numberOfLines={1}>
                  {count !== undefined ? `${count} upcoming · ` : ""}{feed.url}
                </Text>
              </View>
              <Pressable onPress={() => void dropFeed(feed)} accessibilityRole="button"
                accessibilityLabel={`Remove ${feed.label}`} hitSlop={8}>
                <Icon name="close" size={16} color={colors.muted} />
              </Pressable>
            </View>
          );
        })}
        <View style={styles.addFeed}>
          <Text style={styles.fieldLabel}>Add a calendar of events</Text>
          <Text style={type.meta}>
            Paste an iCal link (webcal:// or .ics) from Luma, Meetup, Eventbrite, your school, or a club,
            e.g. SF Tech Week on Luma, or your chemistry club’s calendar. On Luma: open the calendar,
            choose Subscribe, then copy the iCal link.
          </Text>
          <View style={[styles.settingsRow, !desktop && styles.stack]}>
            <TextInput value={feedUrl} onChangeText={setFeedUrl} placeholder="webcal://… or https://….ics"
              placeholderTextColor={colors.faint} selectionColor={colors.accent} autoCapitalize="none"
              autoCorrect={false} style={[styles.input, styles.fieldWide]} accessibilityLabel="Calendar link" />
            <PillButton title="Add" icon="plus" loading={addingFeed} disabled={feedUrl.trim().length < 8}
              onPress={() => void addFeed()} />
          </View>
          {feedNote && <Text style={[type.meta, styles.feedNote]}>{feedNote}</Text>}
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  settings: {
    gap: spacing.sm,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.md,
  },
  stack: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  field: {
    flex: 1,
    gap: spacing.xs,
  },
  fieldWide: {
    flex: 2,
  },
  updateButton: {
    paddingBottom: 2,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSoft,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.text,
  },
  error: {
    color: colors.danger,
    marginTop: spacing.md,
  },
  sectionLabel: {
    ...eyebrowStyle,
    color: colors.textSoft,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  loadingCard: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  grid: {
    gap: spacing.md,
  },
  gridDesktop: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  planCard: {
    gap: spacing.sm,
  },
  planCardDesktop: {
    width: "48.8%",
  },
  planTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  datePill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255, 122, 42, 0.14)",
  },
  dateText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.accentBright,
    letterSpacing: 0.3,
  },
  sourceText: {
    flexShrink: 1,
    fontSize: 12,
    color: colors.faint,
  },
  sampleBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  sampleText: {
    fontSize: 11,
    color: colors.muted,
  },
  planTitle: {
    fontSize: 21,
    lineHeight: 26,
    fontWeight: "700",
    color: colors.text,
  },
  withRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  faces: {
    flexDirection: "row",
    gap: -8,
  },
  withText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textSoft,
  },
  shared: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: "600",
  },
  why: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  plannedNote: {
    color: "#8FE3B0",
  },
  listCard: {
    paddingVertical: spacing.xs,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  eventDate: {
    width: 86,
  },
  eventDateText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.accent,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  eventPeople: {
    fontSize: 13,
    color: colors.accentBright,
  },
  nobody: {
    fontStyle: "italic",
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
  sourcesCard: {
    gap: spacing.md,
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 122, 42, 0.12)",
  },
  sourceName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textSoft,
  },
  link: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.accent,
  },
  addFeed: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  feedNote: {
    color: colors.accentBright,
  },
});
