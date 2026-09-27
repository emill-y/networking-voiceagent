import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Card } from "@/components/Card";
import { Chip, ChipRow } from "@/components/Chip";
import { Icon } from "@/components/Icon";
import { PersonRow } from "@/components/PersonRow";
import { Screen } from "@/components/Screen";
import { ApiError } from "@/lib/api";
import { contactsSupported } from "@/lib/deviceContacts";
import { subtitle } from "@/lib/memory";
import { colors, radius, spacing, type } from "@/lib/theme";
import { listContacts } from "@/services/nomi";
import type { ContactSummary } from "@/types/api";

export default function People() {
  const router = useRouter();
  const [people, setPeople] = useState<ContactSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useFocusEffect(
    useCallback(() => {
      listContacts()
        .then(setPeople)
        .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn’t load people."));
    }, []),
  );

  // Instant, on-device filtering by anything shown in the list.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!people || !q) return people;
    return people.filter((p) =>
      [p.name, p.company, p.role, p.school, p.lastEvent].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [people, query]);

  return (
    <Screen>
      <Animated.View entering={FadeInDown.duration(450)}>
        <Text style={[type.display, styles.title]}>People</Text>
        {people && (
          <Text style={type.meta}>
            {people.length} {people.length === 1 ? "person" : "people"} you’ve remembered
          </Text>
        )}

        <View style={styles.search}>
          <Icon name="search" size={18} color={colors.faint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Name, company, school, event…"
            placeholderTextColor={colors.faint}
            selectionColor={colors.accent}
            accessibilityLabel="Filter people"
            style={styles.searchInput}
            autoCorrect={false}
          />
        </View>

        <ChipRow>
          {people && people.length > 1 && (
            <Chip icon="map" label="See how they connect" onPress={() => router.push("/network")} />
          )}
          {contactsSupported && (
            <Chip icon="plus" label="Import contacts" tone="accent" onPress={() => router.push("/import-contacts")} />
          )}
        </ChipRow>
      </Animated.View>

      {!visible ? (
        <View style={styles.loading}>
          {error ? <Text style={type.body}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
        </View>
      ) : visible.length === 0 ? (
        <Card style={styles.empty}>
          <Text style={type.body}>
            {query ? `No one matches “${query}”.` : "No one yet. Record your first note from the orb below."}
          </Text>
        </Card>
      ) : (
        <View style={styles.list}>
          {visible.map((person, i) => (
            <Animated.View key={person.id} entering={FadeInDown.delay(Math.min(i, 12) * 35).duration(400)}>
              <PersonRow
                name={person.name}
                detail={subtitle(person) || person.lastEvent || person.school}
                when={person.lastInteractionAt}
                onPress={() => router.push({ pathname: "/people/[id]", params: { id: person.id } })}
              />
            </Animated.View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.text,
  },
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: "center",
  },
  empty: {
    marginTop: spacing.lg,
  },
  list: {
    marginTop: spacing.lg,
  },
});
