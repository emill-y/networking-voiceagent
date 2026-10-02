import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

import { Card } from "@/components/Card";
import { ComingUp } from "@/components/ComingUp";
import { GhostNetwork } from "@/components/GhostNetwork";
import { Icon } from "@/components/Icon";
import { Monogram } from "@/components/Monogram";
import { eyebrowStyle } from "@/components/PageHeader";
import { PillButton } from "@/components/PillButton";
import { Screen } from "@/components/Screen";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { useDesktop } from "@/hooks/useDesktop";
import { useSession } from "@/hooks/useSession";
import { displayName } from "@/lib/account";
import { apiUrl } from "@/lib/api";
import { addDays } from "@/lib/calendar";
import { dateToDueAt, localToday } from "@/lib/dates";
import { formatRelative, formatShortDate } from "@/lib/format";
import { firstName, followUpSuggestions, type FollowUpSuggestion } from "@/lib/suggest";
import { colors, fonts, orb, radius, spacing, type } from "@/lib/theme";
import { createFollowUp, listContacts, listFollowUps, updateFollowUp } from "@/services/nomi";
import type { ContactSummary, FollowUp } from "@/types/api";

function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function savedLine(count: number): string {
  if (count === 0) return "No one saved yet. Start with someone you met today.";
  if (count === 1) return "One person saved. Pick up where you left off.";
  return `${count} people saved. Pick up where you left off.`;
}

export default function Home() {
  const router = useRouter();
  const health = useBackendHealth();
  const desktop = useDesktop();
  const { session } = useSession();
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

  const name = displayName(session);
  const first = name.includes("@") ? "" : firstName(name);
  const recent = (people ?? []).filter((p) => p.lastInteractionAt).slice(0, 5);
  const suggestions = followUpSuggestions(people ?? []).slice(0, 2);

  async function complete(item: FollowUp) {
    setFollowUps((current) => current.filter((f) => f.id !== item.id));
    try {
      await updateFollowUp(item.id, { status: "done" });
    } finally {
      load();
    }
  }

  async function addSuggestion(s: FollowUpSuggestion) {
    await createFollowUp(s.contactId, s.action, dateToDueAt(addDays(localToday(), s.dueInDays)));
    load();
  }

  const openPerson = (id: string) => router.push({ pathname: "/people/[id]", params: { id } });

  const main = (
    <View style={[styles.column, desktop && styles.mainColumn]}>
      <NewMemoryCard onRecord={() => router.push("/record")} onWrite={() => router.push("/write")} />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>Recently met</Text>
        <Pressable onPress={() => router.push("/people")} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.link}>See all people →</Text>
        </Pressable>
      </View>
      <Card style={styles.listCard}>
        {recent.map((person) => (
          <Pressable key={person.id} onPress={() => openPerson(person.id)} accessibilityRole="button"
            accessibilityLabel={person.name}
            style={({ pressed }) => [styles.personRow, pressed && styles.pressed]}>
            <Monogram name={person.name} size={40} />
            <View style={styles.personText}>
              <Text style={styles.personName} numberOfLines={1}>{person.name}</Text>
              <Text style={type.meta} numberOfLines={1}>
                {[`Met ${formatRelative(person.lastInteractionAt)}`, person.lastEvent].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <Icon name="chevron" size={16} color={colors.faint} />
          </Pressable>
        ))}
        {people && Array.from({ length: Math.max(0, 3 - recent.length) }, (_, i) => (
          <Pressable key={`ghost-${i}`} onPress={() => router.push("/record")} accessibilityRole="button"
            accessibilityLabel="Remember someone new"
            style={({ pressed }) => [styles.personRow, styles.ghostRow, pressed && styles.pressed]}>
            <View style={styles.ghostAvatar}><Icon name="plus" size={16} color={colors.faint} /></View>
            <View style={styles.personText}>
              <Text style={[styles.personName, styles.ghostText]}>
                {recent.length === 0 && i === 0 ? "Your first connection" : "Your next connection"}
              </Text>
              <Text style={type.meta}>Record a note after you meet someone</Text>
            </View>
          </Pressable>
        ))}
      </Card>
    </View>
  );

  const side = (
    <View style={[styles.column, desktop && styles.sideColumn]}>
      <View style={!desktop && styles.sideLabelMobile}>
        <ComingUp returnPath="/" limit={3} onAdded={load} />
      </View>
      <Card style={styles.sideCard} onPress={() => router.push("/plans")} accessibilityLabel="Go together: plan real events with your people">
        <View style={styles.iconTile}><Icon name="people" size={20} color={colors.accentBright} /></View>
        <Text style={styles.miniLabel}>Go together</Text>
        <Text style={type.heading}>Real events, with your people</Text>
        <Text style={styles.body}>
          Conferences, meetups and mixers coming up, and who from your notes to bring. “Go to the
          chemistry mixer with Annie: you’re both into chemistry.”
        </Text>
        <Text style={styles.link}>See plans →</Text>
      </Card>

      <Text style={[styles.sectionLabel, !desktop && styles.sideLabelMobile]}>Up next</Text>
      <Card style={styles.sideCard}>
        {followUps.length > 0 ? (
          <>
            {followUps.slice(0, 3).map((item) => (
              <View key={item.id} style={styles.followRow}>
                <Pressable onPress={() => void complete(item)} accessibilityRole="checkbox"
                  accessibilityLabel={`Mark done: ${item.action}`} hitSlop={10} style={styles.check} />
                <Pressable style={styles.followText} onPress={() => openPerson(item.contactId)}>
                  <Text style={styles.followAction}>{item.action}</Text>
                  <Text style={type.meta}>
                    {item.contactName}{item.dueAt ? ` · due ${formatShortDate(item.dueAt)}` : ""}
                  </Text>
                </Pressable>
              </View>
            ))}
            <PillButton title={followUps.length > 3 ? `See all ${followUps.length}` : "See all follow-ups"}
              onPress={() => router.push("/follow-ups")} />
          </>
        ) : (
          <>
            <View style={styles.iconTile}><Icon name="check" size={20} color={colors.accentBright} /></View>
            <Text style={type.heading}>No follow-ups yet</Text>
            <Text style={styles.body}>When you make a promise, add it here so it doesn’t slip away.</Text>
            <PillButton title="Add a follow-up" icon="plus"
              onPress={() => router.push({ pathname: "/follow-ups", params: { add: "1" } })} />
          </>
        )}
        {suggestions.length > 0 && (
          <View style={styles.suggestions}>
            <Text style={styles.miniLabel}>Suggested for your people</Text>
            {suggestions.map((s) => (
              <View key={s.contactId} style={styles.suggestion}>
                <Monogram name={s.name} size={30} />
                <View style={styles.followText}>
                  <Text style={styles.suggestionAction}>{s.action}</Text>
                  <Text style={type.meta}>{s.why}</Text>
                </View>
                <Pressable onPress={() => void addSuggestion(s)} accessibilityRole="button"
                  accessibilityLabel={`Add follow-up: ${s.action}`} hitSlop={8} style={styles.addChip}>
                  <Text style={styles.addChipText}>+ Add</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card style={styles.sideCard}>
        <View style={styles.exampleHeader}>
          <Text style={styles.miniLabel}>A quick example</Text>
          <View style={styles.sampleBadge}><Text style={styles.sampleText}>Sample, not saved</Text></View>
        </View>
        <View style={styles.quote}>
          <Text style={styles.quoteText}>
            “Met Priya at the career fair. I should send her my resume Friday.”
          </Text>
        </View>
        <Text style={styles.body}>Nomi turns that into Priya’s page, and the last sentence into a dated follow-up.</Text>
      </Card>
    </View>
  );

  return (
    <Screen wide={desktop}>
      {!desktop && (
        <View style={styles.mobileHeader}>
          <Text style={styles.wordmark}>Nomi</Text>
          <View style={styles.headerActions}>
            <Pressable onPress={() => router.push("/search")} accessibilityRole="button"
              accessibilityLabel="Search your people" style={styles.iconButton} hitSlop={6}>
              <Icon name="search" size={20} color={colors.textSoft} />
            </Pressable>
            <Pressable onPress={() => router.push("/you")} accessibilityRole="button" accessibilityLabel="You">
              <Monogram name={name} size={38} />
            </Pressable>
          </View>
        </View>
      )}

      <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
        <Text style={eyebrowStyle}>{greeting()}{first ? `, ${first}` : ""}</Text>
        <Text style={[type.display, styles.title]}>Remember the people you meet.</Text>
        <Text style={styles.subtitle}>{people ? savedLine(people.length) : " "}</Text>
      </Animated.View>

      {health.state === "error" && (
        <Pressable onPress={health.retry} accessibilityRole="button" style={styles.offline}>
          <Text style={[type.meta, styles.offlineText]}>Can’t reach Nomi’s backend. Tap to retry.</Text>
          {__DEV__ && (
            <Text style={[type.meta, styles.devHint]} selectable>Dev: backend is {apiUrl || "(same origin)"}</Text>
          )}
        </Pressable>
      )}

      <Animated.View entering={FadeInDown.delay(120).duration(600)} style={desktop ? styles.columns : undefined}>
        {main}
        {side}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(220).duration(600)}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Your network</Text>
          <Pressable onPress={() => router.push("/network")} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.link}>Open map →</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => router.push("/network")} accessibilityRole="button"
          accessibilityLabel="Open your network map">
          <GhostNetwork height={desktop ? 260 : 220} compact={!desktop}
            people={(people ?? []).map((p) => ({ id: p.id, name: p.name }))} />
        </Pressable>
      </Animated.View>
    </Screen>
  );
}

// The main action: a warm card with the two ways to remember someone.
function NewMemoryCard({ onRecord, onWrite }: { onRecord: () => void; onWrite: () => void }) {
  return (
    <Card style={styles.newCard}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
        <Defs>
          <RadialGradient id="new-glow" cx="88%" cy="8%" r="55%">
            <Stop offset="0" stopColor={orb.glow} stopOpacity={0.35} />
            <Stop offset="1" stopColor={orb.glow} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="88%" cy="8%" r="75%" fill="url(#new-glow)" />
      </Svg>
      <View style={styles.newInner}>
        <Text style={eyebrowStyle}>New memory</Text>
        <Text style={styles.newTitle}>Who did you meet?</Text>
        <Text style={styles.body}>Say it in a sentence. Check the details before they’re saved.</Text>
        <View style={styles.buttons}>
          <PillButton title="Record who you met" icon="mic" variant="primary" onPress={onRecord} />
          <PillButton title="Type a note" icon="pen" onPress={onWrite} />
        </View>
        <Text style={type.meta}>Nothing is saved until you confirm it.</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  mobileHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  wordmark: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.text,
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
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  header: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  title: {
    fontSize: 40,
    lineHeight: 46,
  },
  subtitle: {
    fontSize: 16,
    color: colors.muted,
  },
  offline: {
    marginBottom: spacing.lg,
    paddingVertical: spacing.sm,
  },
  offlineText: {
    color: colors.danger,
  },
  devHint: {
    marginTop: spacing.xs,
    color: colors.faint,
  },
  columns: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.lg,
  },
  column: {
    gap: spacing.md,
  },
  mainColumn: {
    flex: 1.45,
  },
  sideColumn: {
    flex: 1,
  },
  newCard: {
    overflow: "hidden",
    padding: 0,
  },
  newInner: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  newTitle: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.text,
    letterSpacing: -0.6,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  buttons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  sectionLabel: {
    ...eyebrowStyle,
    color: colors.textSoft,
  },
  sideLabelMobile: {
    marginTop: spacing.lg,
  },
  link: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.accent,
  },
  listCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "rgba(255, 255, 255, 0.035)",
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  personText: {
    flex: 1,
    gap: 2,
  },
  personName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  ghostRow: {
    borderStyle: "dashed",
    borderColor: "rgba(255, 220, 200, 0.14)",
    backgroundColor: "transparent",
  },
  ghostAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255, 220, 200, 0.25)",
  },
  ghostText: {
    color: colors.muted,
    fontWeight: "500",
  },
  pressed: {
    opacity: 0.8,
  },
  sideCard: {
    gap: spacing.sm,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 122, 42, 0.14)",
    marginBottom: spacing.sm,
  },
  followRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  followText: {
    flex: 1,
    gap: 2,
  },
  followAction: {
    fontSize: 16,
    color: colors.text,
  },
  suggestions: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    gap: spacing.sm,
  },
  miniLabel: {
    ...eyebrowStyle,
    fontSize: 11,
    color: colors.muted,
  },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  suggestionAction: {
    fontSize: 14,
    color: colors.textSoft,
  },
  addChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255, 122, 42, 0.14)",
  },
  addChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.accentBright,
  },
  exampleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  sampleBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255, 122, 42, 0.18)",
  },
  sampleText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.accentBright,
  },
  quote: {
    marginTop: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255, 150, 100, 0.3)",
  },
  quoteText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSoft,
  },
});
