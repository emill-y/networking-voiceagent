import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Divider } from "@/components/Divider";
import { MicButton } from "@/components/MicButton";
import { PersonRow } from "@/components/PersonRow";
import { Screen } from "@/components/Screen";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { contactsSupported } from "@/lib/deviceContacts";
import { subtitle } from "@/lib/memory";
import { colors, spacing, type } from "@/lib/theme";
import { listContacts, listFollowUps } from "@/services/nomi";
import type { ContactSummary, FollowUp } from "@/types/api";

const RECENT_COUNT = 5;

function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function Home() {
  const router = useRouter();
  const health = useBackendHealth();
  const [people, setPeople] = useState<ContactSummary[] | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);

  useFocusEffect(
    useCallback(() => {
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
    }, []),
  );

  return (
    <Screen>
      <View style={styles.topBar}>
        <Text style={styles.wordmark}>Nomi</Text>
        <View style={styles.nav}>
          {people && people.length > 0 && (
            <Pressable onPress={() => router.push("/search")} accessibilityRole="button" hitSlop={12}>
              <Text style={type.meta}>Search</Text>
            </Pressable>
          )}
          <Pressable onPress={() => router.push("/you")} accessibilityRole="button" hitSlop={12}>
            <Text style={type.meta}>You</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.hero}>
        <Text style={type.meta}>{greeting()}</Text>
        <Text style={[type.display, styles.prompt]}>Who did you meet?</Text>

        <MicButton
          onPress={() => router.push("/record")}
          accessibilityLabel="Record a new memory"
        />
        <Text style={[type.meta, styles.hint]}>Tap to record</Text>
      </View>

      {health.state === "error" && (
        <Pressable onPress={health.retry} accessibilityRole="button" style={styles.offline}>
          <Text style={[type.meta, styles.offlineText]}>
            Can’t reach Nomi’s backend. Tap to retry.
          </Text>
        </Pressable>
      )}

      {followUps.length > 0 && (
        <>
          <Divider />
          <Pressable onPress={() => router.push("/follow-ups")} accessibilityRole="button">
            <Text style={type.label}>Follow-ups</Text>
            <Text style={[type.heading, styles.followUpCount]}>
              {followUps.length === 1 ? "1 thing to remember" : `${followUps.length} things to remember`}
            </Text>
            <Text style={type.meta} numberOfLines={1}>
              {followUps[0].action} · {followUps[0].contactName}
            </Text>
          </Pressable>
        </>
      )}

      <Divider />

      <View style={styles.sectionHeader}>
        <Text style={type.label}>Recent people</Text>
        {people && people.length > 0 && (
          <Pressable onPress={() => router.push("/people")} accessibilityRole="button" hitSlop={8}>
            <Text style={type.meta}>See all</Text>
          </Pressable>
        )}
      </View>
      {people && people.length === 0 && (
        <>
          <Text style={[type.body, styles.empty]}>
            No one yet. The people you meet will gather here.
          </Text>
          {contactsSupported && (
            <Pressable onPress={() => router.push("/import-contacts")} accessibilityRole="button" hitSlop={8}>
              <Text style={[type.meta, styles.importLink]}>Or bring in people from your contacts</Text>
            </Pressable>
          )}
        </>
      )}
      <View style={styles.list}>
        {people?.slice(0, RECENT_COUNT).map((person) => (
          <PersonRow
            key={person.id}
            name={person.name}
            detail={subtitle(person) || person.lastEvent || person.school}
            when={person.lastInteractionAt}
            onPress={() => router.push({ pathname: "/people/[id]", params: { id: person.id } })}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  nav: {
    flexDirection: "row",
    gap: spacing.lg,
  },
  wordmark: {
    ...type.heading,
    color: colors.muted,
    letterSpacing: 1,
  },
  hero: {
    alignItems: "center",
    paddingTop: spacing.xl,
  },
  prompt: {
    textAlign: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  hint: {
    marginTop: spacing.xs,
  },
  offline: {
    marginTop: spacing.lg,
    alignSelf: "center",
    paddingVertical: spacing.sm,
  },
  offlineText: {
    color: colors.danger,
    textAlign: "center",
  },
  followUpCount: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  empty: {
    marginTop: spacing.sm,
    color: colors.muted,
  },
  list: {
    marginTop: spacing.sm,
  },
  importLink: {
    marginTop: spacing.md,
    color: colors.accent,
  },
});
