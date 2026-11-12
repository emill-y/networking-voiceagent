import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/Input";
import { ListRow } from "@/components/ListRow";
import { Page } from "@/components/Page";
import { SkeletonRows } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { Txt } from "@/components/Txt";
import { confirm } from "@/lib/confirm";
import { formatRelative } from "@/lib/format";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";
import { deleteContact, listContacts } from "@/services/nomi";
import type { ContactSummary } from "@/types/api";

// Everyone you've met, most recently seen first. Tap someone for their
// timeline; edit or delete them right from the list.
export default function Contacts() {
  const s = useStyles();
  const router = useRouter();
  const toast = useToast();
  const [people, setPeople] = useState<ContactSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listContacts()
        .then((list) => active && (setPeople(list), setFailed(false)))
        .catch(() => active && (setFailed(true), setPeople((c) => c ?? [])));
      return () => {
        active = false;
      };
    }, []),
  );

  async function remove(person: ContactSummary) {
    if (!(await confirm(`Delete ${person.name}?`, "Everything you noted about them will be deleted. This can’t be undone.", "Delete"))) return;
    try {
      await deleteContact(person.id);
      setPeople((all) => all?.filter((p) => p.id !== person.id) ?? null);
    } catch {
      toast.show(`Couldn’t delete ${person.name}.`, "danger");
    }
  }

  const q = query.trim().toLowerCase();
  const shown = (people ?? []).filter((p) =>
    !q || [p.name, p.company, p.role, p.school, p.lastEvent].some((x) => x?.toLowerCase().includes(q)),
  );

  return (
    <Page title="Contacts" subtitle={people?.length ? `${people.length} ${people.length === 1 ? "person" : "people"} you’ve met` : undefined}>
      <Input icon="search" value={query} onChangeText={setQuery} placeholder="Filter by name, company, school, event…"
        accessibilityLabel="Filter contacts" />

      {people === null ? (
        <SkeletonRows rows={6} />
      ) : people.length === 0 ? (
        <EmptyState icon="people" title={failed ? "Couldn’t load your contacts" : "No one yet"}
          body={failed ? "Check your connection and try again." : "Everyone you meet in a session shows up here once you save it."} />
      ) : shown.length === 0 ? (
        <Txt variant="small" align="center">No one matches “{query.trim()}”.</Txt>
      ) : (
        <View style={s.list}>
          {shown.map((p) => (
            // The person and the buttons sit side by side (a button can't hold buttons).
            <View key={p.id} style={s.row}>
              <View style={s.flex}>
                <ListRow title={p.name}
                  subtitle={[describe(p), p.lastInteractionAt ? formatRelative(p.lastInteractionAt) : null].filter(Boolean).join(" · ") || null}
                  leading={<Avatar name={p.name} size={36} />}
                  onPress={() => router.push(`/contacts/${p.id}`)} />
              </View>
              <IconButton icon="pen" label={`Edit ${p.name}`} onPress={() => router.push({ pathname: "/contacts/[id]/edit", params: { id: p.id } })} />
              <IconButton icon="trash" label={`Delete ${p.name}`} onPress={() => void remove(p)} />
            </View>
          ))}
        </View>
      )}
    </Page>
  );
}

// "Designer at Figma", "Student · UC Berkeley", or where you met.
function describe(p: ContactSummary): string | null {
  const job = p.role && p.company ? `${p.role} at ${p.company}` : p.role || p.company;
  return [job, p.school].filter(Boolean).join(" · ") || p.lastEvent;
}

function IconButton({ icon, label, onPress }: { icon: "pen" | "trash"; label: string; onPress: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [s.iconButton, (hovered || pressed) && s.iconHover]}>
      <Icon name={icon} size={16} color={icon === "trash" ? colors.danger : colors.textSecondary} />
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    list: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.xxs },
    row: { flexDirection: "row", alignItems: "center", gap: 2, paddingRight: space.xxs },
    flex: { flex: 1, minWidth: 0 },
    iconButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
    iconHover: { backgroundColor: colors.surfaceHover },
  }),
);
