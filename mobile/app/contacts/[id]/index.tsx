import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Linking, Pressable, StyleSheet, TextInput, View } from "react-native";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Tag } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import { Icon, type IconName } from "@/components/Icon";
import { PageLoader } from "@/components/OrbitLoader";
import { Page } from "@/components/Page";
import { ShareContactsSheet } from "@/components/ShareContactsSheet";
import { Txt } from "@/components/Txt";
import { useDesktop } from "@/hooks/useDesktop";
import { bestPhone } from "@/lib/addressBook";
import { ApiError } from "@/lib/api";
import { confirm } from "@/lib/confirm";
import { contactsSupported, pickContact } from "@/lib/deviceContacts";
import { formatRelative, formatShortDate } from "@/lib/format";
import { dueLabel } from "@/lib/followUps";
import { briefing, memoryLines, subtitle } from "@/lib/memory";
import { makeStyles, space, useTheme } from "@/lib/theme";
import { createFollowUp, deleteContact, deleteInteraction, getContact, updateContact, updateFollowUp } from "@/services/nomi";
import type { ContactDetail, FollowUp } from "@/types/api";

export default function Person() {
  const s = useStyles();
  const router = useRouter();
  const desktop = useDesktop();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [person, setPerson] = useState<ContactDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newFollowUp, setNewFollowUp] = useState("");
  const [sharing, setSharing] = useState(false);

  const load = useCallback(() => {
    getContact(id)
      .then((data) => {
        setPerson(data);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn’t load this contact."));
  }, [id]);
  useFocusEffect(load);

  async function toggleFollowUp(f: FollowUp) {
    setPerson((p) => p && { ...p, followUps: p.followUps.map((x) => (x.id === f.id ? { ...x, status: f.status === "open" ? "done" : "open" } : x)) });
    await updateFollowUp(f.id, { status: f.status === "open" ? "done" : "open" }).catch(load);
  }

  async function addFollowUp() {
    const action = newFollowUp.trim();
    if (!action || !person) return;
    setNewFollowUp("");
    await createFollowUp(person.id, action);
    load();
  }

  async function addFromContacts() {
    if (!person) return;
    const entry = await pickContact();
    if (!entry) return;
    const changes: Record<string, string> = {};
    const phone = bestPhone(entry.phones);
    if (!person.phone && phone) changes.phone = phone;
    if (!person.email && entry.emails[0]) changes.email = entry.emails[0];
    if (!person.company && entry.company) changes.company = entry.company;
    if (!person.role && entry.role) changes.role = entry.role;
    if (Object.keys(changes).length) setPerson(await updateContact(person.id, changes));
  }

  async function removeMoment(interactionId: string) {
    if (!(await confirm("Delete this note?", "Its details and transcript will be deleted.", "Delete"))) return;
    await deleteInteraction(interactionId);
    load();
  }

  async function removePerson() {
    if (!person) return;
    if (!(await confirm(`Delete ${person.name}?`, "Every note and follow-up with them will be deleted. This can’t be undone.", "Delete"))) return;
    await deleteContact(person.id);
    router.replace("/contacts");
  }

  if (!person) {
    return (
      <Page back={{ label: "Contacts", href: "/contacts" }}>
        {error ? <EmptyState icon="alert" title="Couldn’t load this contact" body={error} /> : <PageLoader />}
      </Page>
    );
  }

  const brief = briefing(person);
  const open = person.followUps.filter((f) => f.status === "open");
  const done = person.followUps.filter((f) => f.status === "done").slice(0, 3);
  const headline = subtitle(person);
  const where = [person.school, person.location].filter(Boolean).join(" · ");
  const interests = [...new Set(person.interactions.flatMap((i) => i.interests))].slice(0, 8);

  const header = (
    <Card padding="lg" style={s.header}>
      <View style={s.identity}>
        <Avatar name={person.name} size={64} />
        <View style={s.flex}>
          <Txt variant="title">{person.name}</Txt>
          {headline ? <Txt variant="bodySecondary">{headline}</Txt> : null}
          {where ? <Txt variant="small" tone="tertiary">{where}</Txt> : null}
        </View>
      </View>
      {interests.length > 0 && <View style={s.tags}>{interests.map((x) => <Tag key={x} label={x} />)}</View>}
      <View style={s.actions}>
        {person.phone ? <Button title="Call" icon="phone" size="sm" onPress={() => void Linking.openURL(`tel:${dialable(person.phone!)}`)} /> : null}
        {person.phone ? <Button title="Text" icon="message" size="sm" onPress={() => void Linking.openURL(`sms:${dialable(person.phone!)}`)} /> : null}
        {person.email ? <Button title="Email" icon="mail" size="sm" onPress={() => void Linking.openURL(`mailto:${person.email}`)} /> : null}
        {contactsSupported && (!person.phone || !person.email) ? (
          <Button title="From phone contacts" icon="userPlus" size="sm" onPress={() => void addFromContacts()} />
        ) : null}
        <Button title="Share" icon="share" size="sm" onPress={() => setSharing(true)} />
        <Button title="Edit" icon="pen" size="sm" onPress={() => router.push({ pathname: "/contacts/[id]/edit", params: { id: person.id } })} />
      </View>
    </Card>
  );

  const briefCard = brief && (
    <Card style={s.stack}>
      <Txt variant="overline">Before you meet again</Txt>
      <Txt variant="body">{brief.headline}</Txt>
      {brief.remember.map((line) => (
        <View key={line} style={s.bullet}>
          <View style={s.dot} />
          <Txt variant="small" tone="default" style={s.flex}>{line}</Txt>
        </View>
      ))}
    </Card>
  );

  const notes = (
    <View style={s.stack}>
      <Txt variant="overline" style={s.sectionLabel}>Notes</Txt>
      <Card padding="none">
        {person.interactions.length === 0 ? (
          <EmptyState compact icon="pen" title="No notes yet" action={<Button title="Add a note" size="sm" onPress={() => router.push("/write")} />} />
        ) : (
          person.interactions.map((moment, i) => {
            const isOpen = expanded === moment.id || (i === 0 && expanded === null);
            const lines = memoryLines(moment);
            return (
              <View key={moment.id} style={[s.moment, i > 0 && s.border]}>
                <Pressable onPress={() => setExpanded(isOpen ? "none" : moment.id)} accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }} style={s.momentHead}>
                  <View style={s.flex}>
                    <Txt variant="label">{moment.event ?? "Conversation"}</Txt>
                    <Txt variant="caption">{formatShortDate(moment.interactionDate)} · {formatRelative(moment.interactionDate)}</Txt>
                  </View>
                  <Icon name={isOpen ? "chevronDown" : "chevron"} size={16} color={colors.textTertiary} />
                </Pressable>
                {isOpen && (
                  <View style={s.momentBody}>
                    {lines.map((line, j) => (
                      <Txt key={j} variant="small" tone={line.startsWith("Unsure:") ? "tertiary" : "default"}>{line}</Txt>
                    ))}
                    {moment.rawTranscript ? <Txt variant="small" style={s.quote}>“{moment.rawTranscript}”</Txt> : null}
                    <Button title="Delete note" size="sm" variant="ghost" onPress={() => void removeMoment(moment.id)} />
                  </View>
                )}
              </View>
            );
          })
        )}
      </Card>
    </View>
  );

  const followUps = (
    <View style={s.stack}>
      <Txt variant="overline" style={s.sectionLabel}>Follow-ups</Txt>
      <Card padding="none">
        {[...open, ...done].map((f, i) => (
          <Pressable key={f.id} onPress={() => void toggleFollowUp(f)} accessibilityRole="checkbox"
            accessibilityState={{ checked: f.status === "done" }} style={[s.followUp, i > 0 && s.border]}>
            <View style={[s.check, f.status === "done" && s.checkDone]}>
              {f.status === "done" && <Icon name="check" size={11} color={colors.onAccent} strokeWidth={3} />}
            </View>
            <View style={s.flex}>
              <Txt variant="label" style={f.status === "done" ? s.doneText : undefined}>{f.action}</Txt>
              {f.status === "open" && f.dueAt ? <Txt variant="caption">{dueLabel(f.dueAt)}</Txt> : null}
            </View>
            {f.onCalendar && <Icon name="calendarCheck" size={15} color={colors.success} />}
          </Pressable>
        ))}
        <View style={[s.followUp, (open.length || done.length) > 0 && s.border]}>
          <Icon name="plus" size={16} color={colors.textTertiary} />
          <TextInput value={newFollowUp} onChangeText={setNewFollowUp} onSubmitEditing={() => void addFollowUp()} returnKeyType="done"
            placeholder="Add a follow-up" placeholderTextColor={colors.textTertiary} selectionColor={colors.accent}
            accessibilityLabel="Add a follow-up" style={s.addInput} />
        </View>
      </Card>
    </View>
  );

  const details = (
    <View style={s.stack}>
      <Txt variant="overline" style={s.sectionLabel}>Details</Txt>
      <Card padding="none">
        <Detail icon="mail" label="Email" value={person.email} onPress={person.email ? () => void Linking.openURL(`mailto:${person.email}`) : undefined} first />
        <Detail icon="phone" label="Phone" value={person.phone} />
        <Detail icon="link" label="LinkedIn" value={person.linkedinUrl} onPress={person.linkedinUrl ? () => void Linking.openURL(person.linkedinUrl!) : undefined} />
        <Detail icon="external" label="Website" value={person.websiteUrl} onPress={person.websiteUrl ? () => void Linking.openURL(person.websiteUrl!) : undefined} />
        <Detail icon="clock" label="First met" value={formatShortDate(person.interactions[person.interactions.length - 1]?.interactionDate ?? person.createdAt)} />
      </Card>
      {person.summary ? <Txt variant="small" style={s.summary}>{person.summary}</Txt> : null}
      <Button title={`Delete ${person.name.split(" ")[0]}`} icon="trash" variant="danger" size="sm" onPress={() => void removePerson()} />
    </View>
  );

  return (
    <Page back={{ label: "Contacts", href: "/contacts" }}>
      {header}
      {desktop ? (
        <View style={s.columns}>
          <View style={s.main}>{briefCard}{notes}</View>
          <View style={s.side}>{followUps}{details}</View>
        </View>
      ) : (
        <>
          {briefCard}
          {followUps}
          {notes}
          {details}
        </>
      )}
      <ShareContactsSheet visible={sharing} contactIds={[person.id]} label={person.name} onClose={() => setSharing(false)} />
    </Page>
  );
}

function Detail({ icon, label, value, onPress, first }: { icon: IconName; label: string; value: string | null | undefined; onPress?: () => void; first?: boolean }) {
  const s = useStyles();
  const { colors } = useTheme();
  if (!value) return null;
  const body = (
    <>
      <Icon name={icon} size={15} color={colors.textTertiary} />
      <Txt variant="caption" style={s.detailLabel}>{label}</Txt>
      <Txt variant="small" tone="default" numberOfLines={1} style={s.flex}>{value}</Txt>
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="link" style={({ hovered }) => [s.detail, !first && s.border, hovered && s.hover]}>{body}</Pressable>
  ) : (
    <View style={[s.detail, !first && s.border]}>{body}</View>
  );
}

// "+1 (415) 555-0123" -> "+14155550123" for tel:/sms: links.
function dialable(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    header: { gap: space.md },
    identity: { flexDirection: "row", alignItems: "center", gap: space.md },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: space.xxs },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
    columns: { flexDirection: "row", alignItems: "flex-start", gap: space.lg },
    main: { flex: 1.5, minWidth: 0, gap: space.lg },
    side: { flex: 1, minWidth: 0, gap: space.lg },
    stack: { gap: space.xs },
    sectionLabel: { paddingHorizontal: space.xxs },
    bullet: { flexDirection: "row", alignItems: "flex-start", gap: space.xs },
    dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent, marginTop: 7 },
    moment: { paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.xs },
    momentHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
    momentBody: { gap: space.xxs, alignItems: "flex-start" },
    quote: { fontStyle: "italic", marginTop: space.xxs },
    border: { borderTopWidth: 1, borderTopColor: colors.border },
    followUp: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, minHeight: 48, paddingVertical: space.xs },
    check: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
    checkDone: { backgroundColor: colors.success, borderColor: colors.success },
    doneText: { color: colors.textTertiary, textDecorationLine: "line-through" },
    addInput: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: space.xs, outlineStyle: "none" } as object,
    detail: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, minHeight: 44 },
    detailLabel: { width: 64 },
    hover: { backgroundColor: colors.surfaceHover },
    summary: { paddingHorizontal: space.xxs },
  }),
);
