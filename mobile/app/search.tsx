import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { OrbitLoader } from "@/components/OrbitLoader";
import { Page } from "@/components/Page";
import { Txt } from "@/components/Txt";
import { ApiError } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { matchContacts, searchSuggestions } from "@/lib/suggest";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";
import { listContacts, search } from "@/services/nomi";
import type { ContactSummary, SearchResult } from "@/types/api";

// Questions about everyone you've met, answered by meaning (not keywords).
const EXAMPLES = [
  "Who do I know at Berkeley interested in AI?",
  "Who did I meet recently who works in design?",
  "Who should I ask about biotech?",
  "Who could help me build a startup?",
];

export default function Search() {
  const s = useStyles();
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(params.q ?? "");
  const [people, setPeople] = useState<ContactSummary[]>([]);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [asked, setAsked] = useState("");
  const [smart, setSmart] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      listContacts().then(setPeople).catch(() => undefined);
    }, []),
  );

  async function run(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    setQuery(q);
    setLoading(true);
    setError(null);
    try {
      const response = await search(q);
      setResults(response.results);
      setSmart(response.interpreted);
      setAsked(q);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Search didn’t work. Try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (params.q) void run(params.q);
    // Only for a question passed in the link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q]);

  // Your own people make the best examples; general ones until you have some.
  const suggestions = people.length >= 3 ? searchSuggestions(people) : EXAMPLES;
  // While typing (before asking): people whose name, company, school or event matches.
  const typing = query.trim() !== "" && query.trim() !== asked && !loading;
  const matches = typing ? matchContacts(people, query) : [];
  const open = (id: string) => router.push({ pathname: "/contacts/[id]", params: { id } });

  return (
    <Page title="Search" width="narrow">
      <View style={s.box}>
        <Icon name="spark" size={18} color={colors.supportText} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void run(query)}
          returnKeyType="search"
          autoFocus
          placeholder="Who did I meet that…"
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.accent}
          accessibilityLabel="Ask about your network"
          style={s.input}
        />
        <Button title="Ask" variant="primary" loading={loading} disabled={!query.trim()} onPress={() => void run(query)} />
      </View>

      {matches.length > 0 && (
        <View style={s.results}>
          <Txt variant="overline">People</Txt>
          <Card padding="none">
            {matches.map((p, i) => (
              <Pressable key={p.id} onPress={() => open(p.id)} accessibilityRole="button" accessibilityLabel={`Open ${p.name}`}
                style={({ hovered }) => [s.match, i > 0 && s.border, hovered && s.hover]}>
                <Avatar name={p.name} size={32} />
                <View style={s.flex}>
                  <Txt variant="label" numberOfLines={1}>{p.name}</Txt>
                  <Txt variant="caption" numberOfLines={1}>
                    {[p.role, p.company ?? p.school].filter(Boolean).join(" · ") || p.lastEvent || ""}
                  </Txt>
                </View>
                <Icon name="chevron" size={16} color={colors.textTertiary} />
              </Pressable>
            ))}
          </Card>
          <Txt variant="caption">Or press Ask to search everything you’ve noted.</Txt>
        </View>
      )}

      {loading ? (
        <View style={s.loading}><OrbitLoader label="Searching your network" /></View>
      ) : error ? (
        <EmptyState icon="alert" title="Search didn’t work" body={error} action={<Button title="Try again" onPress={() => void run(query)} />} />
      ) : results ? (
        results.length === 0 ? (
          <NoResults asked={asked} tries={broaderTries(asked, suggestions)} onTry={(q) => void run(q)}
            onClear={() => { setResults(null); setQuery(""); setAsked(""); }} onBrowse={() => router.push("/network")} />
        ) : (
          <View style={s.results}>
            <Txt variant="small">{results.length} {results.length === 1 ? "person" : "people"}{smart ? "" : " · matched by keywords"}</Txt>
            <Card padding="none">
              {results.map((r, i) => (
                <Pressable key={r.contact.id} onPress={() => router.push({ pathname: "/contacts/[id]", params: { id: r.contact.id } })}
                  accessibilityRole="button" accessibilityLabel={r.contact.name}
                  style={({ hovered }) => [s.result, i > 0 && s.border, hovered && s.hover]}>
                  <Avatar name={r.contact.name} size={40} />
                  <View style={s.flex}>
                    <View style={s.nameRow}>
                      <Txt variant="label" numberOfLines={1} style={s.flexShrink}>{r.contact.name}</Txt>
                      <Txt variant="caption">{formatRelative(r.contact.lastInteractionAt)}</Txt>
                    </View>
                    <Txt variant="caption" numberOfLines={1}>
                      {[r.contact.role, r.contact.company ?? r.contact.school].filter(Boolean).join(" · ") || r.contact.lastEvent || ""}
                    </Txt>
                    {r.reasons[0] ? <Txt variant="small" tone="default" style={s.reason}>{r.reasons[0]}</Txt> : null}
                  </View>
                  <Icon name="chevron" size={16} color={colors.textTertiary} />
                </Pressable>
              ))}
            </Card>
          </View>
        )
      ) : matches.length > 0 ? null : (
        <View style={s.suggestions}>
          <Txt variant="overline">Try asking</Txt>
          {suggestions.map((q) => (
            <Pressable key={q} onPress={() => void run(q)} accessibilityRole="button"
              style={({ hovered }) => [s.suggestion, hovered && s.hover]}>
              <Icon name="search" size={15} color={colors.textTertiary} />
              <Txt variant="label" style={s.flex}>{q}</Txt>
              <Icon name="arrow" size={15} color={colors.textTertiary} />
            </Pressable>
          ))}
        </View>
      )}
    </Page>
  );
}

// When nothing matches: a shorter version of the question (one word can
// sink a search), then the usual suggestions.
function broaderTries(asked: string, suggestions: string[]): string[] {
  const words = asked.replace(/[?“”"]/g, "").split(/\s+/).filter((w) => w.length > 3 && !/^(who|what|know|with|from|that|into|about|met)$/i.test(w));
  const broader = words.length > 1 ? [...words].sort((a, b) => b.length - a.length)[0] : null;
  return [...(broader ? [broader] : []), ...suggestions.filter((q) => q !== asked)].slice(0, 3);
}

// Say plainly that nothing matched these words, offer a way to recover
// from a typo, and a way out.
function NoResults({ asked, tries, onTry, onClear, onBrowse }: {
  asked: string;
  tries: string[];
  onTry: (q: string) => void;
  onClear: () => void;
  onBrowse: () => void;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.none}>
      <View style={s.noneText}>
        <Txt variant="title" align="center">No one matches “{asked}”</Txt>
        <Txt variant="small" align="center">Check the spelling, or try a broader question.</Txt>
      </View>
      <View style={s.tries}>
        {tries.map((q) => (
          <Pressable key={q} onPress={() => onTry(q)} accessibilityRole="button"
            style={({ hovered, pressed }) => [s.try, (hovered || pressed) && s.hover]}>
            <Icon name="search" size={15} color={colors.supportText} />
            <Txt variant="small" tone="default" numberOfLines={1} style={s.flexShrink}>{q}</Txt>
          </Pressable>
        ))}
      </View>
      <View style={s.noneActions}>
        <Button title="Clear search" icon="close" onPress={onClear} />
        <Button title="Look at the map" variant="ghost" onPress={onBrowse} />
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    flexShrink: { flexShrink: 1 },
    box: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
      paddingLeft: space.md,
      paddingRight: space.xs,
      paddingVertical: space.xs,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      ...shadow.card,
    },
    input: { flex: 1, minWidth: 0, fontSize: 17, color: colors.text, paddingVertical: space.xs, outlineStyle: "none" } as object,
    loading: { paddingVertical: space.xxl, alignItems: "center" },
    results: { gap: space.xs },
    result: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
    match: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.xs, minHeight: 52 },
    border: { borderTopWidth: 1, borderTopColor: colors.border },
    hover: { backgroundColor: colors.surfaceHover },
    nameRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.xs },
    reason: { marginTop: 4 },
    suggestions: { gap: space.xxs },
    none: { alignItems: "center", gap: space.md, paddingVertical: space.lg },
    noneText: { gap: space.xxs, maxWidth: 420 },
    tries: { alignSelf: "stretch", gap: space.xs },
    try: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
      minHeight: 48,
      paddingHorizontal: space.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    noneActions: { flexDirection: "row", gap: space.xs, flexWrap: "wrap", justifyContent: "center" },
    suggestion: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm, minHeight: 44, borderRadius: radius.md },
  }),
);
