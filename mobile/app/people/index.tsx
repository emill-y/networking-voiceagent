import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { PersonRow } from "@/components/PersonRow";
import { Screen } from "@/components/Screen";
import { ApiError } from "@/lib/api";
import { contactsSupported } from "@/lib/deviceContacts";
import { subtitle } from "@/lib/memory";
import { colors, spacing, type } from "@/lib/theme";
import { listContacts } from "@/services/nomi";
import type { ContactSummary } from "@/types/api";

export default function People() {
  const router = useRouter();
  const [people, setPeople] = useState<ContactSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      listContacts()
        .then(setPeople)
        .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn’t load people."));
    }, []),
  );

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12}>
          <Text style={type.meta}>Back</Text>
        </Pressable>
        {contactsSupported && (
          <Pressable onPress={() => router.push("/import-contacts")} accessibilityRole="button" hitSlop={12}>
            <Text style={type.meta}>Import from contacts</Text>
          </Pressable>
        )}
      </View>
      <Text style={[type.display, styles.title]}>People</Text>
      {people && people.length > 1 && (
        <Pressable onPress={() => router.push("/network")} accessibilityRole="button" style={styles.mapLink}>
          <Text style={[type.meta, styles.mapLinkText]}>See how they connect →</Text>
        </Pressable>
      )}
      {!people ? (
        <View style={styles.loading}>
          {error ? <Text style={type.body}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
        </View>
      ) : (
        people.map((person) => (
          <PersonRow
            key={person.id}
            name={person.name}
            detail={subtitle(person) || person.lastEvent || person.school}
            when={person.lastInteractionAt}
            onPress={() => router.push({ pathname: "/people/[id]", params: { id: person.id } })}
          />
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  title: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  mapLink: {
    marginTop: -spacing.md,
    marginBottom: spacing.lg,
  },
  mapLinkText: {
    color: colors.accent,
  },
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: "center",
  },
});
