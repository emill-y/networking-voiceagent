import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Card } from "@/components/Card";
import { Chip, ChipRow } from "@/components/Chip";
import { GhostNetwork } from "@/components/GhostNetwork";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { PersonRow } from "@/components/PersonRow";
import { Screen } from "@/components/Screen";
import { ApiError } from "@/lib/api";
import { contactsSupported } from "@/lib/deviceContacts";
import { subtitle } from "@/lib/memory";
import { colors, radius, spacing, type } from "@/lib/theme";
import { listContacts, search } from "@/services/nomi";
import type { ContactSummary, SearchResult } from "@/types/api";

// A seat for someone you haven't met yet.
function GhostRow({ first, onPress }: { first: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Remember someone new"
      style={({ pressed }) => [styles.ghostRow, pressed && { opacity: 0.7 }]}>
      <View style={styles.ghostAvatar}>
        <Icon name="plus" size={18} color={colors.faint} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.ghostName}>{first ? "Your first connection" : "Your next connection"}</Text>
        <Text style={type.meta}>Record a note after you meet someone</Text>
      </View>
    </Pressable>
  );
}

function GrowAction({ icon, title, detail, onPress }: {
  icon: "mic" | "pen" | "people"; title: string; detail: string; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => [styles.growAction, pressed && { opacity: 0.8 }]}>
      <View style={styles.growIcon}><Icon name={icon} size={18} color={colors.accentBright} /></View>
      <Text style={styles.growTitle}>{title}</Text>
      <Text style={type.meta}>{detail}</Text>
    </Pressable>
  );
}

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

  // Beyond exact matches: after a short pause, ask Nomi who fits by meaning
  // ("chemistry" finds the chemical engineer, "investor" finds the VC).
  const [related, setRelated] = useState<SearchResult[]>([]);
  const [thinking, setThinking] = useState(false);
  // What the smart search said: nothing yet, answered, or couldn't answer.
  const [aiState, setAiState] = useState<"idle" | "answered" | "offline">("idle");
  useEffect(() => {
    const q = query.trim();
    setRelated([]);
    setAiState("idle");
    if (q.length < 3 || !people?.length) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setThinking(true);
      search(q)
        .then((response) => {
          if (cancelled) return;
          setRelated(response.results);
          setAiState(response.interpreted ? "answered" : "offline");
        })
        .catch(() => !cancelled && setAiState("offline"))
        .finally(() => !cancelled && setThinking(false));
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setThinking(false);
    };
  }, [query, people?.length]);
  const shownIds = new Set((visible ?? []).map((p) => p.id));
  const alsoFits = related.filter((r) => !shownIds.has(r.contact.id));

  return (
    <Screen>
      <Animated.View entering={FadeInDown.duration(450)}>
        <PageHeader eyebrow="Everyone you’ve met" title="People"
          subtitle={people ? `${people.length} ${people.length === 1 ? "connection" : "connections"}` : " "} />

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
      ) : visible.length === 0 && alsoFits.length === 0 && query.trim() ? (
        <Card style={styles.empty}>
          <Text style={type.body}>
            {thinking
              ? `Looking for people who fit “${query.trim()}”…`
              : aiState === "offline"
                ? `No exact matches for “${query.trim()}”, and smart search isn’t responding right now. Try again in a moment.`
                : query
                  ? `No one fits “${query.trim()}”.`
                  : "No one yet. Record your first note from the orb below."}
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
          {alsoFits.length > 0 && (
            <View style={styles.also}>
              <Text style={type.label}>Nomi also found</Text>
              {alsoFits.map(({ contact, reasons }) => (
                <PersonRow
                  key={contact.id}
                  name={contact.name}
                  detail={reasons[0] ?? subtitle(contact)}
                  when={contact.lastInteractionAt}
                  onPress={() => router.push({ pathname: "/people/[id]", params: { id: contact.id } })}
                />
              ))}
            </View>
          )}
          {thinking && visible.length > 0 && <ActivityIndicator color={colors.accent} style={styles.thinking} />}

          {/* Few people yet: seats for the next ones, ways to add them, and the map. */}
          {!query.trim() && people && people.length < 5 && (
            <>
              {Array.from({ length: 4 - Math.min(people.length, 4) }, (_, i) => (
                <GhostRow key={i} first={i === 0 && people.length === 0} onPress={() => router.push("/record")} />
              ))}
              <Card style={styles.grow}>
                <Text style={type.heading}>Grow your network</Text>
                <Text style={[type.body, styles.growBody]}>
                  Everyone you meet gets a page with where you met, what they do and what you
                  promised.
                </Text>
                <View style={styles.growActions}>
                  <GrowAction icon="mic" title="Say it" detail="Tap and talk for 10 seconds"
                    onPress={() => router.push("/record")} />
                  <GrowAction icon="pen" title="Write it" detail="Type a quick note"
                    onPress={() => router.push("/write")} />
                  {contactsSupported && (
                    <GrowAction icon="people" title="Import" detail="Pick from your contacts"
                      onPress={() => router.push("/import-contacts")} />
                  )}
                </View>
              </Card>
              <Pressable onPress={() => router.push("/network")} accessibilityRole="button"
                accessibilityLabel="Open your network map" style={styles.mapPreview}>
                <GhostNetwork height={220} compact people={people.map((p) => ({ id: p.id, name: p.name }))} />
              </Pressable>
            </>
          )}
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
  ghostRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  ghostAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255, 220, 200, 0.25)",
  },
  ghostName: {
    fontSize: 16,
    color: colors.muted,
  },
  grow: {
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  growBody: {
    color: colors.muted,
  },
  growActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  growAction: {
    flexGrow: 1,
    flexBasis: 140,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.raised,
    gap: 4,
  },
  growIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 122, 42, 0.14)",
    marginBottom: 4,
  },
  growTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  mapPreview: {
    marginTop: spacing.lg,
  },
  also: {
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  thinking: {
    marginTop: spacing.md,
  },
});
