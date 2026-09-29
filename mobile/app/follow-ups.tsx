import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { DatePicker } from "@/components/DatePicker";
import { Divider } from "@/components/Divider";
import { Monogram } from "@/components/Monogram";
import { PageHeader, eyebrowStyle } from "@/components/PageHeader";
import { PillButton } from "@/components/PillButton";
import { Screen } from "@/components/Screen";
import { addDays } from "@/lib/calendar";
import { ApiError } from "@/lib/api";
import { dateToDueAt, dueGroup, localToday, type DueGroup } from "@/lib/dates";
import { firstName, followUpSuggestions, type FollowUpSuggestion } from "@/lib/suggest";
import { formatRelative, formatShortDate } from "@/lib/format";
import { colors, radius, spacing, type } from "@/lib/theme";
import { createFollowUp, listContacts, listFollowUps, updateFollowUp } from "@/services/nomi";
import type { ContactSummary, FollowUp, FollowUpStatus } from "@/types/api";

const GROUPS: { key: DueGroup; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "later", label: "Later" },
  { key: "none", label: "Anytime" },
];

export default function FollowUps() {
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const [items, setItems] = useState<FollowUp[] | null>(null);
  const [people, setPeople] = useState<ContactSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  // The "Add a follow-up" form, open from Home's button or a suggestion's "Edit".
  const [draft, setDraft] = useState<{ contactId: string | null; action: string; due: string } | null>(
    params.add ? { contactId: null, action: "", due: addDays(localToday(), 3) } : null,
  );
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    listFollowUps()
      .then(setItems)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn’t load follow-ups."));
    listContacts().then(setPeople).catch(() => undefined);
  }, []);
  useFocusEffect(load);

  const suggestions = followUpSuggestions(people, new Date(), 4);

  async function add(contactId: string, action: string, due: string) {
    setSaving(true);
    try {
      await createFollowUp(contactId, action.trim(), due ? dateToDueAt(due) : null);
      setDraft(null);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t add that follow-up.");
    } finally {
      setSaving(false);
    }
  }

  const addSuggestion = (s: FollowUpSuggestion) => void add(s.contactId, s.action, addDays(localToday(), s.dueInDays));

  async function setStatus(item: FollowUp, status: FollowUpStatus) {
    // Optimistic update: reflect the tap immediately, then sync.
    setItems((current) => current?.map((f) => (f.id === item.id ? { ...f, status } : f)) ?? null);
    try {
      await updateFollowUp(item.id, { status });
    } finally {
      load();
    }
  }

  const open = items?.filter((f) => f.status === "open") ?? [];
  const done = items?.filter((f) => f.status === "done").slice(0, 10) ?? [];

  return (
    <Screen>
      <PageHeader eyebrow="Keep your promises" title="Follow-ups"
        subtitle="What you said you’d do, with the dates you mentioned. Tick them off as you go." />

      {!draft && people.length > 0 && (
        <PillButton title="Add a follow-up" icon="plus" variant="primary"
          onPress={() => setDraft({ contactId: null, action: "", due: addDays(localToday(), 3) })} />
      )}

      {draft && (
        <Card style={styles.form}>
          <Text style={type.heading}>Add a follow-up</Text>
          {people.length === 0 ? (
            <>
              <Text style={[type.body, styles.muted]}>
                Follow-ups belong to a person. Remember someone first, then add what you’ll do next.
              </Text>
              <PillButton title="Remember someone" icon="mic" variant="primary" onPress={() => router.push("/record")} />
            </>
          ) : (
            <>
              <Text style={styles.fieldLabel}>Who is it with?</Text>
              <View style={styles.peoplePicker}>
                {people.slice(0, 12).map((p) => {
                  const on = draft.contactId === p.id;
                  return (
                    <Pressable key={p.id} onPress={() => setDraft({ ...draft, contactId: p.id })}
                      accessibilityRole="radio" accessibilityState={{ selected: on }}
                      style={[styles.personChip, on && styles.personChipOn]}>
                      <Monogram name={p.name} size={24} />
                      <Text style={[styles.personChipText, on && styles.personChipTextOn]}>{p.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.fieldLabel}>What will you do?</Text>
              <TextInput
                value={draft.action}
                onChangeText={(action) => setDraft({ ...draft, action })}
                placeholder={draft.contactId
                  ? `e.g. Send ${firstName(people.find((p) => p.id === draft.contactId)?.name ?? "")} the deck`
                  : "e.g. Send my resume"}
                placeholderTextColor={colors.faint}
                selectionColor={colors.accent}
                accessibilityLabel="What will you do?"
                style={styles.input}
              />
              <DatePicker label="When" value={draft.due} onChange={(due) => setDraft({ ...draft, due })} />
              <View style={styles.formButtons}>
                <PillButton title="Save follow-up" variant="primary" loading={saving}
                  disabled={!draft.contactId || !draft.action.trim()}
                  onPress={() => draft.contactId && void add(draft.contactId, draft.action, draft.due)} />
                <PillButton title="Cancel" onPress={() => setDraft(null)} />
              </View>
            </>
          )}
        </Card>
      )}

      {suggestions.length > 0 && (
        <Card style={styles.suggestCard}>
          <Text style={styles.sectionEyebrow}>Suggested for your people</Text>
          {suggestions.map((s) => (
            <View key={s.contactId} style={styles.suggestion}>
              <Monogram name={s.name} size={36} />
              <View style={styles.rowText}>
                <Text style={styles.suggestAction}>{s.action}</Text>
                <Text style={type.meta}>{s.why}</Text>
              </View>
              <Pressable onPress={() => setDraft({ contactId: s.contactId, action: s.action, due: addDays(localToday(), s.dueInDays) })}
                accessibilityRole="button" accessibilityLabel={`Edit before adding: ${s.action}`} hitSlop={6}>
                <Text style={type.meta}>Edit</Text>
              </Pressable>
              <Pressable onPress={() => addSuggestion(s)} accessibilityRole="button"
                accessibilityLabel={`Add follow-up: ${s.action}`} hitSlop={6} style={styles.addChip}>
                <Text style={styles.addChipText}>+ Add</Text>
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      {!items ? (
        <View style={styles.loading}>
          {error ? <Text style={type.body}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
        </View>
      ) : (
        <>
          <View style={styles.tiles}>
            <Tile value={open.filter((f) => dueGroup(f.dueAt) === "overdue").length} label="overdue" hot />
            <Tile value={open.filter((f) => ["today", "week"].includes(dueGroup(f.dueAt))).length} label="this week" />
            <Tile value={open.filter((f) => ["later", "none"].includes(dueGroup(f.dueAt))).length} label="later" />
            <Tile value={done.length} label="done" />
          </View>
          {open.length === 0 && suggestions.length === 0 && (
            <Card style={styles.emptyCard}>
              <Text style={type.heading}>
                {done.length ? "Nothing waiting on you. Nicely done." : "No follow-ups yet"}
              </Text>
              <Text style={[type.body, styles.muted]}>
                When a note says what you’ll do next, like “send her my resume Friday”, it shows up
                here with a date so you actually do it.
              </Text>
              <View style={styles.examples}>
                {[
                  ["Send Priya my resume", "Priya Shah · due Fri"],
                  ["Intro Jason to Sam", "Jason Chen · this week"],
                  ["Ask Maya about the Stripe role", "Maya Singh · anytime"],
                ].map(([action, meta]) => (
                  <View key={action} style={styles.exampleRow}>
                    <View style={[styles.check, styles.exampleCheck]} />
                    <View style={styles.rowText}>
                      <Text style={[type.body, styles.exampleAction]}>{action}</Text>
                      <Text style={type.meta}>Example · {meta}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <Button title="Record a note" icon="mic" onPress={() => router.push("/record")} />
            </Card>
          )}
          {GROUPS.map(({ key, label }) => {
            const inGroup = open.filter((item) => dueGroup(item.dueAt) === key);
            if (inGroup.length === 0) return null;
            return (
              <View key={key} style={styles.group}>
                <Text style={[type.label, key === "overdue" && styles.overdue]}>{label}</Text>
                {inGroup.map((item) => (
                  <Row key={item.id} item={item} onToggle={() => void setStatus(item, "done")}
                    onDismiss={() => void setStatus(item, "dismissed")}
                    onOpenPerson={() => router.push({ pathname: "/people/[id]", params: { id: item.contactId } })} />
                ))}
              </View>
            );
          })}
          {done.length > 0 && (
            <>
              <Divider />
              <Text style={type.label}>Done</Text>
              {done.map((item) => (
                <Row key={item.id} item={item} onToggle={() => void setStatus(item, "open")}
                  onOpenPerson={() => router.push({ pathname: "/people/[id]", params: { id: item.contactId } })} />
              ))}
            </>
          )}
        </>
      )}
    </Screen>
  );
}

function Tile({ value, label, hot }: { value: number; label: string; hot?: boolean }) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, hot && value > 0 && styles.overdue]}>{value}</Text>
      <Text style={type.meta}>{label}</Text>
    </View>
  );
}

function Row({
  item,
  onToggle,
  onDismiss,
  onOpenPerson,
}: {
  item: FollowUp;
  onToggle: () => void;
  onDismiss?: () => void;
  onOpenPerson: () => void;
}) {
  const isDone = item.status === "done";
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isDone }}
        accessibilityLabel={item.action}
        hitSlop={10}
        style={[styles.check, isDone && styles.checkDone]}
      />
      <View style={styles.rowText}>
        <Text style={[type.body, styles.action, isDone && styles.doneText]}>{item.action}</Text>
        <Pressable onPress={onOpenPerson} accessibilityRole="link">
          <Text style={type.meta}>
            {item.contactName}
            {item.dueAt ? ` · due ${formatShortDate(item.dueAt)}` : ` · noted ${formatRelative(item.createdAt)}`}
          </Text>
        </Pressable>
      </View>
      {onDismiss && (
        <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={10}>
          <Text style={[type.meta, styles.dismiss]}>Dismiss</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSoft,
    marginTop: spacing.sm,
  },
  peoplePicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  personChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: "transparent",
  },
  personChipOn: {
    borderColor: colors.accent,
    backgroundColor: "rgba(255, 122, 42, 0.14)",
  },
  personChipText: {
    fontSize: 14,
    color: colors.textSoft,
  },
  personChipTextOn: {
    color: colors.text,
    fontWeight: "600",
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.text,
  },
  formButtons: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  suggestCard: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  sectionEyebrow: {
    ...eyebrowStyle,
    color: colors.textSoft,
  },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  suggestAction: {
    fontSize: 15,
    color: colors.text,
  },
  addChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255, 122, 42, 0.14)",
  },
  addChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.accentBright,
  },
  tiles: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  tile: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  tileValue: {
    fontSize: 26,
    fontWeight: "600",
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  emptyCard: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  examples: {
    marginVertical: spacing.sm,
    gap: spacing.sm,
    opacity: 0.6,
  },
  exampleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  exampleCheck: {
    borderStyle: "dashed",
  },
  exampleAction: {
    color: colors.textSoft,
  },
  title: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: "center",
  },
  muted: {
    color: colors.muted,
  },
  group: {
    marginBottom: spacing.lg,
  },
  overdue: {
    color: colors.danger,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  check: {
    width: 20,
    height: 20,
    marginTop: 3,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  checkDone: {
    backgroundColor: colors.accent,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  action: {
    color: colors.text,
  },
  doneText: {
    color: colors.faint,
    textDecorationLine: "line-through",
  },
  dismiss: {
    color: colors.faint,
    marginTop: 3,
  },
});
