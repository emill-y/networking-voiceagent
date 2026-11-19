import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Tag } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import { Icon, type IconName } from "@/components/Icon";
import { MoreMenu } from "@/components/MoreMenu";
import { ExpandableNotes, notesLines } from "@/components/Notes";
import { PageLoader } from "@/components/OrbitLoader";
import { Page } from "@/components/Page";
import { Txt } from "@/components/Txt";
import { useDesktop } from "@/hooks/useDesktop";
import { ApiError } from "@/lib/api";
import { confirm } from "@/lib/confirm";
import { formatRelative, formatShortDate } from "@/lib/format";
import { conversationSections, plansWith, subtitle } from "@/lib/memory";
import { makeStyles, space, useTheme } from "@/lib/theme";
import { deleteContact, deleteInteraction, getContact } from "@/services/nomi";
import type { ContactDetail } from "@/types/api";

// Template sections that session notes don't already have.
const ONLY_TEMPLATE = new Set(["met", "plans", "ask"]);

export default function Person() {
  const s = useStyles();
  const router = useRouter();
  const desktop = useDesktop();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [person, setPerson] = useState<ContactDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    getContact(id)
      .then((data) => {
        setPerson(data);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn’t load this contact."));
  }, [id]);
  useFocusEffect(load);

  async function removeMoment(interactionId: string) {
    if (!(await confirm("Delete this note?", "Its details and transcript will be deleted.", "Delete"))) return;
    await deleteInteraction(interactionId);
    load();
  }

  async function removePerson() {
    if (!person) return;
    if (!(await confirm(`Delete ${person.name}?`, "Everything you noted about them will be deleted. This can’t be undone.", "Delete"))) return;
    await deleteContact(person.id);
    router.replace("/contacts");
  }

  if (!person) {
    return (
      <Page tabBar={false} back={{ label: "Contacts", href: "/contacts" }}>
        {error ? <EmptyState icon="alert" title="Couldn’t load this contact" body={error} /> : <PageLoader />}
      </Page>
    );
  }

  const plans = plansWith(person);
  const firstName = person.name.split(/\s+/)[0];
  const headline = subtitle(person);
  const where = [person.school, person.location].filter(Boolean).join(" · ");
  const interests = [...new Set(person.interactions.flatMap((i) => i.interests))].slice(0, 8);

  const header = (
    <Card padding="lg" style={s.header}>
      <View style={s.identity}>
        <Avatar name={person.name} size={64} />
        <View style={s.flex}>
          <Txt variant="display" style={s.name}>{person.name}</Txt>
          {headline ? <Txt variant="bodySecondary">{headline}</Txt> : null}
          {where ? <Txt variant="small" tone="tertiary">{where}</Txt> : null}
        </View>
      </View>
      <View style={s.corner}>
        <MoreMenu label={`More for ${person.name}`} actions={[
          { label: "Edit", icon: "pen", onPress: () => router.push({ pathname: "/contacts/[id]/edit", params: { id: person.id } }) },
          { label: "Delete", icon: "trash", danger: true, onPress: () => void removePerson() },
        ]} />
      </View>
      {interests.length > 0 && <View style={s.tags}>{interests.map((x) => <Tag key={x} label={x} />)}</View>}
      <View style={s.actions}>
        {person.phone ? <Button title="Call" icon="phone" size="sm" onPress={() => void Linking.openURL(`tel:${dialable(person.phone!)}`)} /> : null}
        {person.phone ? <Button title="Text" icon="message" size="sm" onPress={() => void Linking.openURL(`sms:${dialable(person.phone!)}`)} /> : null}
        {person.email ? <Button title="Email" icon="mail" size="sm" onPress={() => void Linking.openURL(`mailto:${person.email}`)} /> : null}
      </View>
    </Card>
  );

  // Only plans you made with them; no plans, no section.
  const plansCard = plans.length > 0 && (
    <Card style={s.stack}>
      <Txt variant="overline">Plans with {firstName}</Txt>
      {plans.map((plan) => (
        <View key={plan.text} style={s.bullet}>
          <View style={s.dot} />
          <Txt variant="body" style={s.flex}>
            {plan.text}
            {plan.dueAt ? <Txt variant="small" tone="tertiary">{`  ·  by ${formatShortDate(plan.dueAt)}`}</Txt> : null}
          </Txt>
        </View>
      ))}
    </Card>
  );

  // Every conversation you've had with them, newest first.
  const timeline = (
    <View style={s.stack}>
      <Txt variant="overline" style={s.sectionLabel}>
        Timeline · {person.interactions.length} {person.interactions.length === 1 ? "conversation" : "conversations"}
      </Txt>
      <Card>
        {person.interactions.length === 0 ? (
          <EmptyState compact icon="pen" title="No conversations yet" />
        ) : (
          person.interactions.map((moment, i) => {
            const last = i === person.interactions.length - 1;
            // Session notes (## headings and bullets) are the main record when there are any;
            // the template then adds only what they don't cover.
            const notes = notesLines(moment.summary);
            const sections = conversationSections(moment).filter((x) => !notes.length || ONLY_TEMPLATE.has(x.key));
            const showTranscript = expanded === moment.id;
            return (
              <View key={moment.id} style={s.event}>
                <View style={s.rail}>
                  <View style={[s.railDot, i === 0 && s.railDotLatest]} />
                  {!last && <View style={s.railLine} />}
                </View>
                <View style={[s.eventBody, !last && s.eventGap]}>
                  <Txt variant="label">{formatShortDate(moment.interactionDate)}</Txt>
                  <Txt variant="caption">{formatRelative(moment.interactionDate)}</Txt>
                  {sections.length === 0 && notes.length === 0 && <Txt variant="small" tone="tertiary">Nothing noted from this conversation.</Txt>}
                  {notes.length > 0 && <View style={s.section}><ExpandableNotes lines={notes} /></View>}
                  {sections.map((section) => (
                    <View key={section.key} style={s.section}>
                      <Txt variant="caption" weight="600" style={s.sectionTitle}>{section.title}</Txt>
                      {section.items.map((item) => (
                        <View key={item} style={s.bullet}>
                          <View style={[s.dot, section.key === "unsure" && s.dotMuted]} />
                          <Txt variant="small" tone={section.key === "unsure" ? "tertiary" : "default"} style={s.flex}>{item}</Txt>
                        </View>
                      ))}
                    </View>
                  ))}
                  {showTranscript && moment.rawTranscript ? <Txt variant="small" style={s.quote}>“{moment.rawTranscript}”</Txt> : null}
                  <View style={s.eventActions}>
                    {moment.rawTranscript ? (
                      <Button title={showTranscript ? "Hide what you said" : "What you said"} size="sm" variant="ghost"
                        onPress={() => setExpanded(showTranscript ? null : moment.id)} />
                    ) : null}
                    <Button title="Delete" size="sm" variant="ghost" onPress={() => void removeMoment(moment.id)} />
                  </View>
                </View>
              </View>
            );
          })
        )}
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
    </View>
  );

  return (
    <Page tabBar={false} back={{ label: "Contacts", href: "/contacts" }}>
      {header}
      {desktop ? (
        <View style={s.columns}>
          <View style={s.main}>{plansCard}{timeline}</View>
          <View style={s.side}>{details}</View>
        </View>
      ) : (
        <View style={s.phoneStack}>
          {plansCard}
          {timeline}
          {details}
        </View>
      )}
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
    corner: { position: "absolute", top: space.sm, right: space.sm },
    name: { fontSize: 30, lineHeight: 36 },
    identity: { flexDirection: "row", alignItems: "center", gap: space.md, paddingRight: 36 },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: space.xxs },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
    columns: { flexDirection: "row", alignItems: "flex-start", gap: space.lg },
    main: { flex: 1.5, minWidth: 0, gap: space.lg },
    side: { flex: 1, minWidth: 0, gap: space.lg },
    phoneStack: { gap: space.lg },
    stack: { gap: space.xs },
    sectionLabel: { paddingHorizontal: space.xxs },
    bullet: { flexDirection: "row", alignItems: "flex-start", gap: space.xs },
    dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.support, marginTop: 7 },
    event: { flexDirection: "row", gap: space.sm },
    rail: { width: 12, alignItems: "center" },
    railDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, backgroundColor: colors.border },
    railDotLatest: { backgroundColor: colors.accent },
    railLine: { flex: 1, width: 2, marginTop: 4, backgroundColor: colors.border },
    eventBody: { flex: 1, minWidth: 0, gap: 2, alignItems: "stretch" },
    section: { gap: 3, marginTop: space.sm },
    sectionTitle: { textTransform: "uppercase", letterSpacing: 0.6, color: colors.textSecondary },
    dotMuted: { backgroundColor: colors.border },
    eventGap: { paddingBottom: space.lg },
    eventActions: { flexDirection: "row", gap: space.xs, marginLeft: -space.xs, marginTop: space.xs, alignSelf: "flex-start" },
    quote: { fontStyle: "italic", marginTop: space.xxs },
    border: { borderTopWidth: 1, borderTopColor: colors.border },
    detail: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, minHeight: 44 },
    detailLabel: { width: 64 },
    hover: { backgroundColor: colors.surfaceHover },
    summary: { paddingHorizontal: space.xxs },
  }),
);
