import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Card } from "@/components/Card";
import { Chip, ChipRow } from "@/components/Chip";
import { Icon } from "@/components/Icon";
import { MicButton } from "@/components/MicButton";
import { Monogram } from "@/components/Monogram";
import { Screen } from "@/components/Screen";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { useDesktop } from "@/hooks/useDesktop";
import { useProfile } from "@/hooks/useProfile";
import { useSession } from "@/hooks/useSession";
import { apiUrl } from "@/lib/api";
import { contactsSupported } from "@/lib/deviceContacts";
import { dueGroup } from "@/lib/dates";
import { formatRelative, formatShortDate } from "@/lib/format";
import { subtitle } from "@/lib/memory";
import { examples } from "@/lib/profile";
import { colors, fonts, radius, spacing, tintFor, type } from "@/lib/theme";
import { listContacts, listFollowUps, updateFollowUp } from "@/services/nomi";
import type { ContactSummary, FollowUp } from "@/types/api";

function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function metThisWeek(people: ContactSummary[]): number {
  const weekAgo = Date.now() - 7 * 86_400_000;
  return people.filter((p) => p.lastInteractionAt && new Date(p.lastInteractionAt).getTime() > weekAgo).length;
}

export default function Home() {
  const router = useRouter();
  const health = useBackendHealth();
  const desktop = useDesktop();
  const { session } = useSession();
  const profile = useProfile();
  const [people, setPeople] = useState<ContactSummary[] | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);

  const load = useCallback(() => {
    let active = true;
    Promise.all([listContacts(), listFollowUps("open")])
      .then(([contacts, open]) => {
        if (!active) return;
        setPeople(contacts);
        setFollowUps(open);
      })
      .catch(() => {
        if (active) setPeople((current) => current ?? []);
      });
    return () => {
      active = false;
    };
  }, []);
  useFocusEffect(load);

  const firstName = (session?.user.user_metadata?.full_name as string | undefined)?.split(" ")[0];
  const who = firstName ?? session?.user.email ?? "";
  const next = followUps[0];
  const recent = (people ?? []).filter((p) => p.lastInteractionAt).slice(0, 8);
  const dueSoon = followUps.filter((f) => ["overdue", "today", "week"].includes(dueGroup(f.dueAt))).length;

  async function complete(item: FollowUp) {
    setFollowUps((current) => current.filter((f) => f.id !== item.id));
    try {
      await updateFollowUp(item.id, { status: "done" });
    } finally {
      load();
    }
  }

  return (
    <Screen>
      {!desktop && (
        <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
          <View>
            <Text style={styles.wordmark}>Nomi</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable onPress={() => router.push("/search")} accessibilityRole="button"
              accessibilityLabel="Search your people" style={styles.iconButton} hitSlop={6}>
              <Icon name="search" size={20} color={colors.textSoft} />
            </Pressable>
            <Pressable onPress={() => router.push("/you")} accessibilityRole="button" accessibilityLabel="You">
              <Monogram name={who || "You"} size={38} />
            </Pressable>
          </View>
        </Animated.View>
      )}

      <Animated.View entering={FadeInDown.delay(80).duration(600)} style={styles.hero}>
        <Text style={styles.greeting}>
          {greeting()}{firstName ? `, ${firstName}` : ""}
        </Text>
        <Text style={[type.display, styles.prompt]}>Who did you meet?</Text>
        <Text style={styles.promptSub}>{examples(profile).prompt}</Text>

        <MicButton onPress={() => router.push("/record")} accessibilityLabel="Record a new memory" />

        <ChipRow>
          <Chip label="Write instead" icon="pen" onPress={() => router.push("/write")} />
          {people && people.length > 0 && (
            <Chip label="Ask about someone" icon="search" onPress={() => router.push("/search")} />
          )}
        </ChipRow>
      </Animated.View>

      {health.state === "error" && (
        <Pressable onPress={health.retry} accessibilityRole="button" style={styles.offline}>
          <Text style={[type.meta, styles.offlineText]}>Can’t reach Nomi’s backend. Tap to retry.</Text>
          {__DEV__ && (
            // Development only: the address this build is using (EXPO_PUBLIC_API_URL).
            <Text style={[type.meta, styles.devHint]} selectable>Dev: backend is {apiUrl || "(same origin)"}</Text>
          )}
        </Pressable>
      )}

      {people && people.length > 0 && (
        <Animated.View entering={FadeInDown.delay(180).duration(600)} style={styles.stats}>
          <Stat value={people.length} label={people.length === 1 ? "person" : "people"}
            onPress={() => router.push("/people")} />
          <Stat value={metThisWeek(people)} label="met this week" onPress={() => router.push("/network")} />
          <Stat value={dueSoon || followUps.length} label={dueSoon ? "due soon" : "to follow up"}
            onPress={() => router.push("/follow-ups")} highlight={dueSoon > 0} />
        </Animated.View>
      )}

      {next && (
        <Animated.View entering={FadeInDown.delay(260).duration(600)}>
          <Text style={[type.label, styles.sectionLabel]}>Up next</Text>
          <Card onPress={() => router.push("/follow-ups")} accessibilityLabel="All follow-ups">
            <View style={styles.nextRow}>
              <Pressable onPress={() => void complete(next)} accessibilityRole="checkbox"
                accessibilityLabel={`Mark done: ${next.action}`} hitSlop={10} style={styles.check} />
              <View style={styles.nextText}>
                <Text style={styles.nextAction}>{next.action}</Text>
                <Text style={type.meta}>
                  {next.contactName}
                  {next.dueAt ? ` · due ${formatShortDate(next.dueAt)}` : ""}
                </Text>
              </View>
              <Icon name="chevron" size={18} color={colors.faint} />
            </View>
            {followUps.length > 1 && (
              <Text style={[type.meta, styles.more]}>+{followUps.length - 1} more to remember</Text>
            )}
          </Card>
        </Animated.View>
      )}

      <Animated.View entering={FadeInDown.delay(340).duration(600)}>
        <View style={styles.sectionHeader}>
          <Text style={[type.label, styles.sectionLabel]}>Recently met</Text>
          {people && people.length > 0 && (
            <Pressable onPress={() => router.push("/people")} accessibilityRole="button" hitSlop={8}>
              <Text style={[type.meta, styles.link]}>See everyone</Text>
            </Pressable>
          )}
        </View>

        {people && people.length === 0 ? (
          <Card>
            <Text style={styles.emptyTitle}>Your people will gather here.</Text>
            <Text style={[type.body, styles.emptyBody]}>
              After your next conversation, tap the orb and say who you met, where, and what
              you talked about.
            </Text>
            {contactsSupported && (
              <ChipRow>
                <Chip label="Bring in contacts" icon="people" tone="accent"
                  onPress={() => router.push("/import-contacts")} />
              </ChipRow>
            )}
          </Card>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carousel}>
            {recent.map((person) => (
              <PersonCard key={person.id} person={person}
                onPress={() => router.push({ pathname: "/people/[id]", params: { id: person.id } })} />
            ))}
          </ScrollView>
        )}
      </Animated.View>
    </Screen>
  );
}

function Stat({ value, label, onPress, highlight }: { value: number; label: string; onPress: () => void; highlight?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${value} ${label}`}
      style={({ pressed }) => [styles.stat, pressed && styles.pressed]}>
      <Text style={[styles.statValue, highlight && styles.statHighlight]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

function PersonCard({ person, onPress }: { person: ContactSummary; onPress: () => void }) {
  const tint = tintFor(person.name);
  const context = [person.lastEvent, formatRelative(person.lastInteractionAt)].filter(Boolean).join(" · ");
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={person.name}
      style={({ pressed }) => [styles.personCard, { borderColor: `${tint}33` }, pressed && styles.pressed]}>
      <View style={[styles.personGlow, { backgroundColor: `${tint}14` }]} />
      <Monogram name={person.name} size={48} />
      <Text style={styles.personName} numberOfLines={1}>{person.name}</Text>
      <Text style={styles.personSub} numberOfLines={1}>{subtitle(person) || person.school || " "}</Text>
      <Text style={styles.personContext} numberOfLines={2}>{context}</Text>
      {person.openFollowUps > 0 && (
        <View style={[styles.badge, { backgroundColor: `${tint}2E` }]}>
          <Text style={[styles.badgeText, { color: tint }]}>{person.openFollowUps} to do</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  wordmark: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.text,
    letterSpacing: 0.5,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(242, 238, 232, 0.06)",
  },
  hero: {
    alignItems: "center",
    paddingTop: spacing.xl,
    gap: spacing.xs,
  },
  greeting: {
    fontSize: 14,
    color: colors.accent,
    letterSpacing: 0.4,
  },
  prompt: {
    textAlign: "center",
    fontSize: 42,
    lineHeight: 48,
  },
  promptSub: {
    fontFamily: fonts.serifItalic,
    fontSize: 19,
    color: colors.muted,
    textAlign: "center",
    marginBottom: -spacing.md,
  },
  offline: {
    marginTop: spacing.lg,
    alignSelf: "center",
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  offlineText: {
    color: colors.danger,
    textAlign: "center",
  },
  devHint: {
    marginTop: spacing.xs,
    color: colors.faint,
    textAlign: "center",
  },
  stats: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  stat: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 2,
  },
  statValue: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "600",
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  statHighlight: {
    color: colors.accentBright,
  },
  statLabel: {
    fontSize: 12,
    color: colors.muted,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  sectionLabel: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  link: {
    color: colors.accent,
  },
  nextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  nextText: {
    flex: 1,
    gap: 2,
  },
  nextAction: {
    fontSize: 17,
    color: colors.text,
  },
  more: {
    marginTop: spacing.sm,
    marginLeft: 24 + spacing.md,
  },
  carousel: {
    gap: spacing.md,
    paddingRight: spacing.lg,
  },
  personCard: {
    width: 170,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    gap: 4,
    overflow: "hidden",
  },
  personGlow: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  personName: {
    marginTop: spacing.sm,
    fontFamily: fonts.serifBold,
    fontSize: 20,
    color: colors.text,
  },
  personSub: {
    fontSize: 13,
    color: colors.textSoft,
  },
  personContext: {
    fontSize: 12,
    color: colors.muted,
    minHeight: 32,
  },
  badge: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  emptyTitle: {
    fontFamily: fonts.serifBold,
    fontSize: 22,
    color: colors.text,
  },
  emptyBody: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    color: colors.muted,
  },
});
