import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Icon } from "@/components/Icon";
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
  const [smart, setSmart] = useState(true);
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
      setSmart(response.interpreted);
      setAsked(q);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Search didn’t work.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Text style={[type.display, styles.title]}>Who are you looking for?</Text>

      <TextInput
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => void run(query)}
        returnKeyType="search"
        autoFocus
        placeholder="Ask anything, like “who could help with my pitch?”"
        placeholderTextColor={colors.faint}
        selectionColor={colors.accent}
        accessibilityLabel="Search your people"
        style={styles.input}
      />

      {!results && !loading && (
        <>
          <Text style={[type.label, styles.sectionLabel]}>Try asking</Text>
          <View style={styles.exampleGrid}>
            {EXAMPLES.map((example) => (
              <Pressable key={example} onPress={() => void run(example)} accessibilityRole="button"
                style={({ pressed }) => [styles.exampleCard, pressed && styles.pressed]}>
                <Icon name="search" size={16} color={colors.accent} />
                <Text style={styles.exampleText}>{example}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[type.label, styles.sectionLabel]}>How it works</Text>
          <View style={styles.howGrid}>
            {[
              ["spark", "By meaning", "“Bad guy” finds “not a good guy”. “Startup” finds founders."],
              ["user", "Your own notes", "Nomi reads only what you’ve saved about people."],
              ["check", "With reasons", "Every result says why that person fits."],
            ].map(([icon, title, body]) => (
              <View key={title} style={styles.howCard}>
                <Icon name={icon as "spark" | "check" | "user"} size={18} color={colors.accentBright} />
                <Text style={styles.howTitle}>{title}</Text>
                <Text style={type.meta}>{body}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {loading && <ActivityIndicator color={colors.accent} style={styles.loading} />}
      {error && <Text style={[type.meta, styles.error]}>{error}</Text>}

      {results && !loading && (
        <View style={styles.results}>
          {!smart && (
            <Text style={[type.meta, styles.notice]}>
              Smart search didn’t respond, so these are exact matches only. Try again in a moment.
            </Text>
          )}
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
  sectionLabel: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  exampleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  exampleCard: {
    flexGrow: 1,
    flexBasis: 240,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  exampleText: {
    flex: 1,
    fontSize: 15,
    color: colors.textSoft,
  },
  howGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  howCard: {
    flexGrow: 1,
    flexBasis: 180,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    gap: 4,
  },
  howTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    marginTop: 4,
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
  notice: {
    color: colors.accent,
    marginBottom: spacing.md,
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
