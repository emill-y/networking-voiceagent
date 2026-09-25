import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { Divider } from "@/components/Divider";
import { Screen } from "@/components/Screen";
import { ApiError } from "@/lib/api";
import { dueGroup, type DueGroup } from "@/lib/dates";
import { formatRelative, formatShortDate } from "@/lib/format";
import { colors, spacing, type } from "@/lib/theme";
import { listFollowUps, updateFollowUp } from "@/services/nomi";
import type { FollowUp, FollowUpStatus } from "@/types/api";

const GROUPS: { key: DueGroup; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "later", label: "Later" },
  { key: "none", label: "Anytime" },
];

export default function FollowUps() {
  const router = useRouter();
  const [items, setItems] = useState<FollowUp[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listFollowUps()
      .then(setItems)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn’t load follow-ups."));
  }, []);
  useFocusEffect(load);

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
      <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12}>
        <Text style={type.meta}>Back</Text>
      </Pressable>
      <Text style={[type.display, styles.title]}>Follow-ups</Text>

      {!items ? (
        <View style={styles.loading}>
          {error ? <Text style={type.body}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
        </View>
      ) : (
        <>
          {open.length === 0 && (
            <Text style={[type.body, styles.muted]}>Nothing waiting on you. Nicely done.</Text>
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
