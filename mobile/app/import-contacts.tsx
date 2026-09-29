import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CloseButton } from "@/components/CloseButton";
import { Button } from "@/components/Button";
import { matchEntries, toImportedPerson, type EntryMatch } from "@/lib/addressBook";
import { ApiError } from "@/lib/api";
import {
  chooseMoreContacts,
  contactsAccess,
  contactsSupported,
  loadAddressBook,
  type ContactsAccess,
} from "@/lib/deviceContacts";
import { colors, radius, spacing, type } from "@/lib/theme";
import { importContacts, listContacts } from "@/services/nomi";

type Phase = "checking" | "ask" | "denied" | "loading" | "ready" | "error";

const ADD_LABELS = { phone: "phone", email: "email", company: "company", role: "role" } as const;

export default function ImportContacts() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(contactsSupported ? "checking" : "error");
  const [access, setAccess] = useState<ContactsAccess>("undetermined");
  const [matches, setMatches] = useState<EntryMatch[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(
    contactsSupported ? null : "Importing contacts works in the iPhone and Android app.",
  );

  async function load(ask: boolean) {
    try {
      const result = await contactsAccess(ask);
      setAccess(result);
      if (result === "undetermined") return setPhase("ask");
      if (result === "denied") return setPhase("denied");
      setPhase("loading");
      // Matching happens here on the phone; the address book isn't uploaded.
      const [entries, people] = await Promise.all([loadAddressBook(), listContacts()]);
      setMatches(matchEntries(entries, people));
      setPhase("ready");
    } catch (e) {
      console.warn("[contacts] load failed:", e);
      setMessage(
        e instanceof ApiError
          ? e.message
          : `Couldn’t read your contacts${e instanceof Error && e.message ? ` (${e.message})` : ""}.`,
      );
      setPhase("error");
    }
  }

  useEffect(() => {
    if (contactsSupported) void load(false);
  }, []);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = matches.filter(
      (m) => !q || m.entry.name.toLowerCase().includes(q) || m.entry.company?.toLowerCase().includes(q),
    );
    return [
      { key: "updates", title: "Add details to people you know", data: visible.filter((m) => m.match && m.adds.length) },
      { key: "new", title: "Everyone else", data: visible.filter((m) => !m.match) },
    ].filter((s) => s.data.length > 0);
  }, [matches, query]);

  const alreadyKnown = matches.filter((m) => m.match && m.adds.length === 0).length;
  const chosen = matches.filter((m) => selected.has(m.entry.id));
  const newCount = chosen.filter((m) => !m.match).length;
  const updateCount = chosen.length - newCount;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllUpdates() {
    setSelected((current) => {
      const next = new Set(current);
      for (const m of matches) if (m.match && m.adds.length) next.add(m.entry.id);
      return next;
    });
  }

  async function save() {
    if (chosen.length === 0) return;
    setSaving(true);
    setMessage(null);
    try {
      // Import in chunks to stay within the backend's per-request limit.
      for (let i = 0; i < chosen.length; i += 200) {
        await importContacts(chosen.slice(i, i + 200).map(toImportedPerson));
      }
      router.replace("/people");
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "Import didn’t work.");
      setSaving(false);
    }
  }

  const summary = [
    newCount ? `add ${newCount} ${newCount === 1 ? "person" : "people"}` : "",
    updateCount ? `update ${updateCount}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <CloseButton />
        <Text style={[type.title, styles.title]}>Bring in people you know.</Text>
        <Text style={type.meta}>
          Your address book stays on this phone. Only the people you choose are added to Nomi.
        </Text>
      </View>

      {phase === "checking" || phase === "loading" ? (
        <ActivityIndicator color={colors.accent} style={styles.center} />
      ) : phase === "ask" ? (
        <View style={styles.block}>
          <Button title="Choose from contacts" onPress={() => void load(true)} />
        </View>
      ) : phase === "denied" ? (
        <View style={styles.block}>
          <Text style={type.body}>Contacts access is turned off for Nomi.</Text>
          <Button title="Open Settings" variant="quiet" onPress={() => void Linking.openSettings()} />
        </View>
      ) : phase === "error" ? (
        <View style={styles.block}>
          <Text style={type.body}>{message}</Text>
          {contactsSupported && <Button title="Try again" variant="quiet" onPress={() => void load(true)} />}
        </View>
      ) : (
        <>
          <View style={styles.tools}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search contacts"
              placeholderTextColor={colors.faint}
              selectionColor={colors.accent}
              accessibilityLabel="Search contacts"
              style={styles.search}
            />
            {access === "limited" && (
              <Pressable
                onPress={() => void chooseMoreContacts().then(() => load(false))}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={[type.meta, styles.more]}>
                  Nomi can see only the contacts you allowed. Choose more →
                </Text>
              </Pressable>
            )}
            {alreadyKnown > 0 && (
              <Text style={type.meta}>
                {alreadyKnown} {alreadyKnown === 1 ? "contact is" : "contacts are"} already in Nomi.
              </Text>
            )}
          </View>
          <SectionList
            sections={sections}
            keyExtractor={(m) => m.entry.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Text style={type.label}>{section.title}</Text>
                {section.key === "updates" && (
                  <Pressable onPress={selectAllUpdates} accessibilityRole="button" hitSlop={8}>
                    <Text style={type.meta}>Select all</Text>
                  </Pressable>
                )}
              </View>
            )}
            renderItem={({ item }) => (
              <Row item={item} checked={selected.has(item.entry.id)} onToggle={() => toggle(item.entry.id)} />
            )}
            ListEmptyComponent={
              <Text style={[type.body, styles.muted]}>
                {query ? "No contacts match." : "Everyone in your contacts is already in Nomi."}
              </Text>
            }
          />
          <View style={styles.footer}>
            {message && <Text style={[type.meta, styles.error]}>{message}</Text>}
            <Button
              title={summary ? summary.charAt(0).toUpperCase() + summary.slice(1) : "Choose people"}
              onPress={() => void save()}
              disabled={chosen.length === 0}
              loading={saving}
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function Row({ item, checked, onToggle }: { item: EntryMatch; checked: boolean; onToggle: () => void }) {
  const { entry, match, adds } = item;
  const detail = match
    ? `Adds ${adds.map((a) => ADD_LABELS[a]).join(" & ")} to ${match.name}`
    : [entry.role, entry.company].filter(Boolean).join(" · ") || entry.phones[0]?.number || entry.emails[0] || "";
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={entry.name}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.check, checked && styles.checked]} />
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>{entry.name}</Text>
        {detail ? <Text style={type.meta} numberOfLines={1}>{detail}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  title: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  center: {
    marginTop: spacing.xxl,
  },
  block: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  tools: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  search: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  pressed: {
    opacity: 0.7,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  checked: {
    backgroundColor: colors.accent,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 16,
    color: colors.text,
  },
  muted: {
    color: colors.muted,
    marginTop: spacing.lg,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    gap: spacing.sm,
  },
  error: {
    color: colors.danger,
  },
  more: {
    color: colors.accent,
  },
});
