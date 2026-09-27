import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Screen } from "@/components/Screen";
import { useProfile } from "@/hooks/useProfile";
import { examples } from "@/lib/profile";
import { ApiError } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { colors, radius, spacing, type } from "@/lib/theme";
import { search } from "@/services/nomi";
import type { SearchResult } from "@/types/api";

export default function Search() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const EXAMPLES = examples(useProfile()).searches;
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [asked, setAsked] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(text: string) {
    const q = text.trim();
    if (!q) return;
    setQuery(q);
    setLoading(true);
    setError(null);
    try {
      const response = await search(q);
      setResults(response.results);
      setAsked(q);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Search didn’t work.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12}>
        <Text style={type.meta}>Back</Text>
      </Pressable>
      <Text style={[type.display, styles.title]}>Who are you looking for?</Text>

      <TextInput
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => void run(query)}
        returnKeyType="search"
        autoFocus
        placeholder="Who did I meet at Cal Hacks?"
        placeholderTextColor={colors.faint}
        selectionColor={colors.accent}
        accessibilityLabel="Search your people"
        style={styles.input}
      />

      {!results && !loading && (
        <View style={styles.examples}>
          {EXAMPLES.map((example) => (
            <Pressable key={example} onPress={() => void run(example)} accessibilityRole="button">
              <Text style={[type.body, styles.example]}>{example}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {loading && <ActivityIndicator color={colors.accent} style={styles.loading} />}
      {error && <Text style={[type.meta, styles.error]}>{error}</Text>}

      {results && !loading && (
        <View style={styles.results}>
          {results.length === 0 ? (
            <Text style={[type.body, styles.muted]}>No one matches “{asked}” yet.</Text>
          ) : (
            results.map(({ contact, reasons }) => (
              <Pressable
                key={contact.id}
                onPress={() => router.push({ pathname: "/people/[id]", params: { id: contact.id } })}
                accessibilityRole="button"
                style={({ pressed }) => [styles.result, pressed && styles.pressed]}
              >
                <Text style={styles.name}>{contact.name}</Text>
                {reasons.map((reason) => (
                  <Text key={reason} style={[type.body, styles.reason]}>{reason}</Text>
                ))}
                {contact.lastInteractionAt && (
                  <Text style={type.meta}>
                    Last seen {formatRelative(contact.lastInteractionAt)}
                    {contact.lastEvent ? ` · ${contact.lastEvent}` : ""}
                  </Text>
                )}
              </Pressable>
            ))
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 17,
    color: colors.text,
  },
  examples: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  example: {
    color: colors.muted,
    fontStyle: "italic",
  },
  loading: {
    marginTop: spacing.xl,
  },
  error: {
    marginTop: spacing.md,
    color: colors.danger,
  },
  results: {
    marginTop: spacing.lg,
  },
  muted: {
    color: colors.muted,
  },
  result: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
    gap: 4,
  },
  pressed: {
    opacity: 0.7,
  },
  name: {
    ...type.heading,
    marginBottom: 2,
  },
  reason: {
    color: colors.text,
  },
});
