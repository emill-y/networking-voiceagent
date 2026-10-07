import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { Avatar } from "@/components/Avatar";
import { Button, IconButton } from "@/components/Button";
import { CalendarBanner } from "@/components/CalendarBanner";
import { Card } from "@/components/Card";
import { DatePicker } from "@/components/DatePicker";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/Input";
import { Page } from "@/components/Page";
import { Sheet } from "@/components/Sheet";
import { SkeletonRows } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { Txt } from "@/components/Txt";
import { useCalendar } from "@/hooks/useCalendar";
import { useDesktop } from "@/hooks/useDesktop";
import { ApiError } from "@/lib/api";
import { addDays } from "@/lib/calendar";
import { dateToDueAt, localToday } from "@/lib/dates";
import { BUCKET_LABELS, bucketCounts, bucketOf, dueLabel, type Bucket } from "@/lib/followUps";
import { followUpSuggestions } from "@/lib/suggest";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";
import {
  addFollowUpToCalendar,
  createFollowUp,
  listContacts,
  listFollowUps,
  removeFollowUpFromCalendar,
  updateFollowUp,
} from "@/services/nomi";
import type { ContactSummary, FollowUp, FollowUpStatus } from "@/types/api";

const OPEN_BUCKETS: Bucket[] = ["overdue", "week", "later"];

export default function FollowUps() {
  const s = useStyles();
  const router = useRouter();
  const desktop = useDesktop();
  const toast = useToast();
  const params = useLocalSearchParams<{ add?: string; contact?: string }>();
  const calendar = useCalendar("/follow-ups");
  const [items, setItems] = useState<FollowUp[] | null>(null);
  const [people, setPeople] = useState<ContactSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Bucket | "open">("open");
  const [adding, setAdding] = useState(!!params.add);
  const [calendarBusy, setCalendarBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    listFollowUps()
      .then((list) => {
        setItems(list.filter((f) => f.status !== "dismissed"));
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn’t load follow-ups."));
    listContacts().then(setPeople).catch(() => undefined);
  }, []);
  useFocusEffect(load);

  const counts = useMemo(() => bucketCounts(items ?? []), [items]);
  const suggestions = followUpSuggestions(people, new Date(), 3);

  async function setStatus(item: FollowUp, status: FollowUpStatus) {
    setItems((current) => current?.map((f) => (f.id === item.id ? { ...f, status } : f)) ?? null);
    try {
      await updateFollowUp(item.id, { status });
      if (status === "done") toast.show("Marked done", "success");
    } catch {
      load();
    }
  }

  async function toggleCalendar(item: FollowUp) {
    setCalendarBusy(item.id);
    try {
      const updated = item.onCalendar ? await removeFollowUpFromCalendar(item.id) : await addFollowUpToCalendar(item.id);
      setItems((current) => current?.map((f) => (f.id === item.id ? updated : f)) ?? null);
      toast.show(item.onCalendar ? "Removed from Google Calendar" : "Added to Google Calendar", "success");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Google Calendar didn’t respond.", "danger");
      calendar.refresh();
    } finally {
      setCalendarBusy(null);
    }
  }

  const visible = (items ?? []).filter((f) => (filter === "open" ? f.status === "open" : bucketOf(f) === filter));
  const groups: Bucket[] = filter === "open" ? OPEN_BUCKETS : [filter];
  const calendarReady = calendar.state === "connected";

  return (
    <Page
      title="Follow-ups"
      actions={<Button title="New follow-up" icon="plus" variant="primary" onPress={() => setAdding(true)} />}
    >
      <View style={[s.tiles, !desktop && s.tilesPhone]}>
        {(["overdue", "week", "later", "done"] as Bucket[]).map((b) => {
          const on = filter === b;
          return (
            <Pressable key={b} onPress={() => setFilter(on ? "open" : b)} accessibilityRole="button"
              accessibilityState={{ selected: on }} accessibilityLabel={`${BUCKET_LABELS[b]}: ${counts[b]}`}
              style={({ hovered }: { hovered?: boolean }) => [s.tile, !desktop && s.tilePhone, on && s.tileOn, hovered && !on && s.tileHover]}>
              <Txt variant="stat" style={b === "overdue" && counts.overdue > 0 ? s.overdueNumber : undefined}>{counts[b]}</Txt>
              <Txt variant="small" weight="500" tone={on ? "default" : "secondary"}>{BUCKET_LABELS[b]}</Txt>
            </Pressable>
          );
        })}
      </View>

      <CalendarBanner calendar={calendar} prompt="Connect Google Calendar to put follow-ups on it." />

      {!items ? (
        <Card><SkeletonRows rows={5} avatar={false} /></Card>
      ) : error ? (
        <EmptyState icon="alert" title="Couldn’t load follow-ups" body={error} action={<Button title="Try again" onPress={load} />} />
      ) : visible.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon="checkCircle"
            title={filter === "done" ? "Nothing done yet" : filter === "open" ? "You’re all caught up" : `Nothing ${BUCKET_LABELS[filter].toLowerCase()}`}
            body={filter === "open" && people.length === 0 ? "Follow-ups come from your notes, like “send her my resume Friday”." : undefined}
            action={filter === "open" ? <Button title="New follow-up" icon="plus" size="sm" onPress={() => setAdding(true)} /> : undefined}
          />
        </Card>
      ) : (
        groups.map((group) => {
          const rows = visible
            .filter((f) => bucketOf(f) === group)
            .sort((a, b) => (group === "done" ? (b.completedAt ?? "").localeCompare(a.completedAt ?? "") : (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9")));
          if (!rows.length) return null;
          return (
            <View key={group} style={s.group}>
              <View style={s.groupHeader}>
                <Txt variant="overline" style={group === "overdue" ? s.overdueText : undefined}>{BUCKET_LABELS[group]}</Txt>
                <Txt variant="caption">{rows.length}</Txt>
              </View>
              <Card padding="none">
                {rows.map((item, i) => (
                  <FollowUpRow
                    key={item.id}
                    item={item}
                    first={i === 0}
                    desktop={desktop}
                    calendarReady={calendarReady}
                    calendarBusy={calendarBusy === item.id}
                    onToggle={() => void setStatus(item, item.status === "done" ? "open" : "done")}
                    onDismiss={() => void setStatus(item, "dismissed")}
                    onCalendar={() => void toggleCalendar(item)}
                    onOpenCalendar={() => item.calendarLink && void Linking.openURL(item.calendarLink)}
                    onPerson={() => router.push({ pathname: "/contacts/[id]", params: { id: item.contactId } })}
                  />
                ))}
              </Card>
            </View>
          );
        })
      )}

      {filter === "open" && suggestions.length > 0 && items && (
        <View style={s.group}>
          <View style={s.groupHeader}><Txt variant="overline">Suggestions</Txt></View>
          <Card padding="none">
            {suggestions.map((sug, i) => (
              <View key={sug.contactId} style={[s.row, i > 0 && s.rowBorder]}>
                <Icon name="spark" size={16} color={s.sparkColor.color} />
                <View style={s.flex}>
                  <Txt variant="label">{sug.action}</Txt>
                  <Txt variant="caption">{sug.why}</Txt>
                </View>
                <Button title="Add" size="sm" icon="plus"
                  onPress={() => void createFollowUp(sug.contactId, sug.action, dateToDueAt(addDays(localToday(), sug.dueInDays))).then(load)} />
              </View>
            ))}
          </Card>
        </View>
      )}

      <NewFollowUp
        visible={adding}
        people={people}
        initialContact={params.contact ?? null}
        calendarReady={calendarReady}
        onClose={() => setAdding(false)}
        onSaved={(item) => {
          setAdding(false);
          setItems((current) => [...(current ?? []), item]);
          toast.show(item.onCalendar ? "Added, and on your Google Calendar" : "Follow-up added", "success");
        }}
      />
    </Page>
  );
}

function FollowUpRow({
  item,
  first,
  desktop,
  calendarReady,
  calendarBusy,
  onToggle,
  onDismiss,
  onCalendar,
  onOpenCalendar,
  onPerson,
}: {
  item: FollowUp;
  first: boolean;
  desktop: boolean;
  calendarReady: boolean;
  calendarBusy: boolean;
  onToggle: () => void;
  onDismiss: () => void;
  onCalendar: () => void;
  onOpenCalendar: () => void;
  onPerson: () => void;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const done = item.status === "done";
  const label = dueLabel(item.dueAt);
  const late = !done && (label.includes("late") || label === "Yesterday");
  const person = (
    <Pressable onPress={onPerson} accessibilityRole="link" accessibilityLabel={item.contactName}
      style={({ hovered }: { hovered?: boolean }) => [s.person, hovered && s.personHover]}>
      <Avatar name={item.contactName} size={20} />
      <Txt variant="small" weight="500" numberOfLines={1} style={s.personName}>{item.contactName}</Txt>
    </Pressable>
  );
  return (
    <View style={[s.row, !first && s.rowBorder]}>
      <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: done }}
        accessibilityLabel={done ? `Mark not done: ${item.action}` : `Mark done: ${item.action}`} hitSlop={8}
        style={({ hovered }: { hovered?: boolean }) => [s.check, done && s.checkDone, hovered && !done && { borderColor: colors.accent }]}>
        {done && <Icon name="check" size={12} color={colors.onAccent} strokeWidth={3} />}
      </Pressable>
      <View style={s.flex}>
        <Txt variant="label" style={done ? s.doneText : undefined}>{item.action}</Txt>
        {item.context ? <Txt variant="caption" numberOfLines={2}>{item.context}</Txt> : null}
        {!desktop && (
          <View style={s.metaPhone}>
            {person}
            <Txt variant="caption" style={late ? s.overdueText : undefined}>{label}</Txt>
          </View>
        )}
      </View>
      {desktop && <View style={s.personCol}>{person}</View>}
      {desktop && <Txt variant="small" style={[s.dueCol, late && s.overdueText]}>{label}</Txt>}
      <View style={desktop ? s.calendarCol : undefined}>
        {!done && item.dueAt && (calendarReady || item.onCalendar) ? (
          item.onCalendar ? (
            <View style={s.calendarActions}>
              {item.calendarLink ? (
                <IconButton icon="calendarCheck" label="Open in Google Calendar" onPress={onOpenCalendar} size={30} tone="plain" />
              ) : (
                <View style={s.onCalendar} accessibilityLabel="On Google Calendar"><Icon name="calendarCheck" size={15} color={colors.success} /></View>
              )}
              <IconButton icon="close" label="Remove from Google Calendar" onPress={onCalendar} size={30} tone="plain" disabled={calendarBusy} />
            </View>
          ) : (
            desktop ? (
              <Button title="Add to Calendar" icon="calendarAdd" size="sm" variant="ghost"
                loading={calendarBusy} onPress={onCalendar} accessibilityLabel={`Add to Google Calendar: ${item.action}`} />
            ) : (
              <IconButton icon="calendarAdd" label={`Add to Google Calendar: ${item.action}`} onPress={onCalendar} size={30} tone="plain" disabled={calendarBusy} />
            )
          )
        ) : null}
      </View>
      <View style={s.trashCol}>{!done && <IconButton icon="trash" label={`Dismiss: ${item.action}`} onPress={onDismiss} size={30} tone="plain" />}</View>
    </View>
  );
}

function NewFollowUp({
  visible,
  people,
  initialContact,
  calendarReady,
  onClose,
  onSaved,
}: {
  visible: boolean;
  people: ContactSummary[];
  initialContact: string | null;
  calendarReady: boolean;
  onClose: () => void;
  onSaved: (item: FollowUp) => void;
}) {
  const s = useStyles();
  const [contactId, setContactId] = useState<string | null>(initialContact);
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("");
  const [due, setDue] = useState(addDays(localToday(), 3));
  const [toCalendar, setToCalendar] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picked = people.find((p) => p.id === contactId);
  const matches = people.filter((p) => !query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6);

  async function save() {
    if (!contactId || !action.trim()) return;
    setSaving(true);
    setError(null);
    try {
      let item = await createFollowUp(contactId, action.trim(), due ? dateToDueAt(due) : null);
      if (calendarReady && toCalendar && due && !item.onCalendar) {
        try {
          item = await addFollowUpToCalendar(item.id);
        } catch {
          // Saved either way; the row offers "Add to Calendar" again.
        }
      }
      setAction("");
      setQuery("");
      onSaved(item);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t add that follow-up.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet visible={visible} title="New follow-up" onClose={onClose}
      footer={
        <>
          <Button title="Cancel" variant="ghost" onPress={onClose} />
          <Button title="Save" variant="primary" loading={saving} disabled={!contactId || !action.trim()} onPress={() => void save()} />
        </>
      }>
      {people.length === 0 ? (
        <Txt variant="small">Follow-ups belong to a contact. Add someone first.</Txt>
      ) : (
        <>
          <View style={s.fieldGap}>
            <Txt variant="label">With</Txt>
            {picked ? (
              <View style={s.pickedRow}>
                <Avatar name={picked.name} size={28} />
                <Txt variant="label" style={s.flex}>{picked.name}</Txt>
                <Button title="Change" size="sm" variant="ghost" onPress={() => setContactId(null)} />
              </View>
            ) : (
              <>
                <Input icon="search" value={query} onChangeText={setQuery} placeholder="Find a contact" accessibilityLabel="Find a contact" />
                <View style={s.pickList}>
                  {matches.map((p) => (
                    <Pressable key={p.id} onPress={() => setContactId(p.id)} accessibilityRole="button"
                      style={({ hovered }: { hovered?: boolean }) => [s.pickRow, hovered && s.personHover]}>
                      <Avatar name={p.name} size={26} />
                      <Txt variant="label" style={s.flex} numberOfLines={1}>{p.name}</Txt>
                      <Txt variant="caption" numberOfLines={1}>{p.company ?? p.school ?? ""}</Txt>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
          </View>
          <Input label="What will you do?" value={action} onChangeText={setAction}
            placeholder={picked ? `e.g. Send ${picked.name.split(" ")[0]} the deck` : "e.g. Send my resume"} />
          <DatePicker label="When" value={due} onChange={setDue} />
          {calendarReady && (
            <Pressable onPress={() => setToCalendar(!toCalendar)} accessibilityRole="checkbox" accessibilityState={{ checked: toCalendar }} style={s.pickedRow}>
              <View style={[s.check, toCalendar && s.checkDone]}>
                {toCalendar && <Icon name="check" size={12} color={s.onAccent.color} strokeWidth={3} />}
              </View>
              <Txt variant="small" tone="default">Add to Google Calendar</Txt>
            </Pressable>
          )}
          {error ? <Txt variant="small" tone="danger">{error}</Txt> : null}
        </>
      )}
    </Sheet>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0, gap: 2 },
    tiles: { flexDirection: "row", gap: space.sm },
    tilesPhone: { flexWrap: "wrap" },
    tile: {
      flex: 1,
      gap: 2,
      paddingVertical: space.sm,
      paddingHorizontal: space.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    tilePhone: { flexBasis: "45%" },
    tileOn: { borderColor: colors.support, backgroundColor: colors.supportSoft },
    tileHover: { backgroundColor: colors.surfaceHover },
    overdueNumber: { color: colors.danger },
    overdueText: { color: colors.danger },
    group: { gap: space.xs },
    groupHeader: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.xxs },
    row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 56 },
    rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
    check: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      alignItems: "center",
      justifyContent: "center",
    },
    checkDone: { backgroundColor: colors.success, borderColor: colors.success },
    doneText: { color: colors.textTertiary, textDecorationLine: "line-through" },
    personCol: { width: 170 },
    dueCol: { width: 92, textAlign: "right" },
    person: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 2, paddingRight: 6, borderRadius: radius.pill },
    personHover: { backgroundColor: colors.surfaceHover },
    personName: { flexShrink: 1, color: colors.text },
    metaPhone: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 4 },
    onCalendar: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
    calendarActions: { flexDirection: "row", alignItems: "center" },
    trashCol: { width: 30 },
    calendarCol: { width: 140, alignItems: "flex-start" },
    sparkColor: { color: colors.supportText },
    onAccent: { color: colors.onAccent },
    fieldGap: { gap: space.xs },
    pickedRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
    pickList: { gap: 2 },
    pickRow: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.xs, borderRadius: radius.md },
  }),
);
