import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Button } from "@/components/Button";
import { Divider } from "@/components/Divider";
import Animated, { FadeInDown } from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

import { Chip, ChipRow } from "@/components/Chip";
import { Icon, type IconName } from "@/components/Icon";
import { Monogram } from "@/components/Monogram";
import { Screen } from "@/components/Screen";
import { ApiError } from "@/lib/api";
import { bestPhone } from "@/lib/addressBook";
import { confirm } from "@/lib/confirm";
import { contactsSupported, pickContact } from "@/lib/deviceContacts";
import { formatRelative, formatShortDate } from "@/lib/format";
import { briefing, memoryLines, subtitle } from "@/lib/memory";
import { colors, fonts, radius, spacing, tintFor, type } from "@/lib/theme";
import {
  createFollowUp,
  deleteContact,
  deleteInteraction,
  getContact,
  updateContact,
  updateFollowUp,
} from "@/services/nomi";
import type { ContactDetail, FollowUp } from "@/types/api";

export default function Person() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [person, setPerson] = useState<ContactDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newFollowUp, setNewFollowUp] = useState("");

  const load = useCallback(() => {
    getContact(id)
      .then((data) => {
        setPerson(data);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn’t load this person."));
  }, [id]);

  // Reload whenever the screen comes back into view (e.g. after editing).
  useFocusEffect(load);

  async function toggleFollowUp(followUp: FollowUp) {
    await updateFollowUp(followUp.id, { status: followUp.status === "open" ? "done" : "open" });
    load();
  }

  async function addFollowUp() {
    const action = newFollowUp.trim();
    if (!action || !person) return;
    setNewFollowUp("");
    await createFollowUp(person.id, action);
    load();
  }

  // Link this person to an address-book entry the user picks, filling in
  // only what's missing.
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
    if (Object.keys(changes).length) {
      setPerson(await updateContact(person.id, changes));
    }
  }

  async function removeMoment(interactionId: string) {
    const ok = await confirm("Forget this moment?", "Its notes and transcript will be deleted.", "Forget");
    if (!ok) return;
    await deleteInteraction(interactionId);
    load();
  }

  async function removePerson() {
    if (!person) return;
    const ok = await confirm(
      `Forget ${person.name}?`,
      "Every moment and follow-up with them will be deleted. This can’t be undone.",
      "Forget",
    );
    if (!ok) return;
    await deleteContact(person.id);
    router.replace("/");
  }

  if (!person) {
    return (
      <Screen scroll={false}>
        <BackLink />
        <View style={styles.center}>
          {error ? <Text style={type.body}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
        </View>
      </Screen>
    );
  }

  const [latest, ...earlier] = person.interactions;
  const openFollowUps = person.followUps.filter((f) => f.status === "open");
  const doneFollowUps = person.followUps.filter((f) => f.status === "done").slice(0, 3);
  const details = subtitle(person);
  const brief = briefing(person);

  return (
    <Screen>
      <View style={styles.topBar}>
        <BackLink />
        <Pressable
          onPress={() => router.push({ pathname: "/people/[id]/edit", params: { id: person.id } })}
          accessibilityRole="button"
          hitSlop={12}
        >
          <Text style={type.meta}>Edit</Text>
        </Pressable>
      </View>

      <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
        {/* A soft halo in this person's own color. */}
        <Svg style={styles.halo} width={320} height={320} pointerEvents="none">
          <Defs>
            <RadialGradient id="personHalo" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={tintFor(person.name)} stopOpacity={0.28} />
              <Stop offset="1" stopColor={tintFor(person.name)} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={160} cy={160} r={160} fill="url(#personHalo)" />
        </Svg>
        <Monogram name={person.name} size={84} />
        <Text style={[type.display, styles.name]}>{person.name}</Text>
        {details ? <Text style={[type.body, styles.details]}>{details}</Text> : null}
        {person.school || person.location ? (
          <Text style={[type.meta, styles.centered]}>
            {[person.school, person.location].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
        {person.summary ? <Text style={[type.body, styles.summary]}>{person.summary}</Text> : null}

        <ChipRow>
          <Chip icon="spark" label={`${person.interactions.length} ${person.interactions.length === 1 ? "moment" : "moments"}`} />
          {person.lastInteractionAt ? <Chip icon="calendar" label={`Seen ${formatRelative(person.lastInteractionAt)}`} /> : null}
          {openFollowUps.length > 0 ? <Chip icon="check" tone="accent" label={`${openFollowUps.length} to do`} /> : null}
        </ChipRow>

        {/* Opens the phone's own apps; Nomi never sends anything itself. */}
        <View style={styles.reach}>
          {person.phone ? (
            <>
              <ReachButton icon="phone" label="Call" onPress={() => void Linking.openURL(`tel:${dialable(person.phone!)}`)} />
              <ReachButton icon="message" label="Text" onPress={() => void Linking.openURL(`sms:${dialable(person.phone!)}`)} />
            </>
          ) : null}
          {person.email ? (
            <ReachButton icon="mail" label="Email" onPress={() => void Linking.openURL(`mailto:${person.email}`)} />
          ) : null}
          {contactsSupported && (!person.phone || !person.email) ? (
            <ReachButton icon="plus" label="From contacts" onPress={() => void addFromContacts()} />
          ) : null}
        </View>
      </Animated.View>

      {brief && (
        <View style={styles.brief}>
          <Text style={type.label}>Before you meet again</Text>
          <Text style={[type.body, styles.briefHeadline]}>{brief.headline}</Text>
          {brief.remember.map((line) => (
            <Text key={line} style={[type.body, styles.briefLine]}>· {line}</Text>
          ))}
        </View>
      )}

      {latest && (
        <>
          <Divider />
          <Text style={type.label}>Last time you spoke</Text>
          <Text style={[type.heading, styles.sectionTitle]}>
            {formatShortDate(latest.interactionDate)}
            {latest.event ? ` · ${latest.event}` : ""}
          </Text>
          <Text style={type.meta}>{formatRelative(latest.interactionDate)}</Text>
          <View style={styles.lines}>
            {memoryLines(latest).map((line, i) => (
              <Text key={i} style={[type.body, line.startsWith("Unsure:") && styles.unsure]}>
                {line}
              </Text>
            ))}
          </View>
        </>
      )}

      <Divider />
      <Text style={type.label}>Follow up</Text>
      <View style={styles.lines}>
        {[...openFollowUps, ...doneFollowUps].map((f) => (
          <Pressable
            key={f.id}
            onPress={() => void toggleFollowUp(f)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: f.status === "done" }}
            style={styles.followUp}
          >
            <View style={[styles.check, f.status === "done" && styles.checkDone]} />
            <View style={styles.followUpBody}>
              <Text style={[type.body, styles.followUpText, f.status === "done" && styles.done]}>
                {f.action}
              </Text>
              {f.dueAt && f.status === "open" ? (
                <Text style={type.meta}>Due {formatShortDate(f.dueAt)}</Text>
              ) : null}
            </View>
          </Pressable>
        ))}
        <TextInput
          value={newFollowUp}
          onChangeText={setNewFollowUp}
          onSubmitEditing={() => void addFollowUp()}
          returnKeyType="done"
          placeholder="+ Add something to do"
          placeholderTextColor={colors.faint}
          selectionColor={colors.accent}
          accessibilityLabel="Add a follow-up"
          style={styles.addFollowUp}
        />
      </View>

      <Divider />
      <Text style={type.label}>Timeline</Text>
      {person.interactions.length === 0 && (
        <Text style={[type.body, styles.noMoments]}>
          No moments yet. Record one after you next talk.
        </Text>
      )}
      <View style={styles.timeline}>
        {[latest, ...earlier].filter(Boolean).map((moment) => {
          const open = expanded === moment.id;
          return (
            <View key={moment.id} style={styles.moment}>
              <Pressable
                onPress={() => setExpanded(open ? null : moment.id)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                style={styles.momentRow}
              >
                <Text style={[type.meta, styles.momentDate]}>
                  {formatShortDate(moment.interactionDate)}
                </Text>
                <Text style={[type.body, styles.momentTitle]}>{moment.event ?? "Conversation"}</Text>
              </Pressable>
              {open && (
                <View style={styles.momentBody}>
                  {memoryLines(moment).map((line, i) => (
                    <Text key={i} style={[type.body, line.startsWith("Unsure:") && styles.unsure]}>
                      {line}
                    </Text>
                  ))}
                  {moment.rawTranscript ? (
                    <Text style={[type.meta, styles.transcript]}>“{moment.rawTranscript}”</Text>
                  ) : null}
                  <Pressable onPress={() => void removeMoment(moment.id)} accessibilityRole="button">
                    <Text style={[type.meta, styles.danger]}>Forget this moment</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
      </View>

      <Divider />
      <Button title={`Forget ${person.name}`} variant="danger" onPress={() => void removePerson()} />
    </Screen>
  );
}

// "+1 (415) 555-0123" -> "+14155550123" for tel:/sms: links.
function dialable(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

function ReachButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [styles.reachButton, pressed && { opacity: 0.75 }]}>
      <View style={styles.reachIcon}>
        <Icon name={icon} size={20} color={colors.text} />
      </View>
      <Text style={styles.reachText}>{label}</Text>
    </Pressable>
  );
}

function BackLink() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      accessibilityRole="button"
      hitSlop={12}
    >
      <Text style={type.meta}>Back</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  header: {
    marginTop: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  halo: {
    position: "absolute",
    top: -100,
  },
  centered: {
    textAlign: "center",
  },
  name: {
    marginTop: spacing.sm,
    textAlign: "center",
  },
  details: {
    color: colors.text,
    textAlign: "center",
  },
  reach: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  reachButton: {
    alignItems: "center",
    gap: 6,
    minWidth: 64,
  },
  reachIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(242, 238, 232, 0.08)",
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  reachText: {
    fontSize: 12,
    color: colors.textSoft,
  },
  noMoments: {
    marginTop: spacing.sm,
    color: colors.muted,
  },
  summary: {
    marginTop: spacing.xs,
    fontStyle: "italic",
    textAlign: "center",
  },
  brief: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  briefHeadline: {
    fontFamily: fonts.serifItalic,
    fontSize: 21,
    lineHeight: 28,
    color: colors.text,
  },
  briefLine: {
    color: colors.textSoft,
  },
  sectionTitle: {
    marginTop: spacing.sm,
  },
  lines: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  unsure: {
    color: colors.muted,
    fontStyle: "italic",
  },
  followUp: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 4,
  },
  check: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  checkDone: {
    backgroundColor: colors.accent,
  },
  followUpBody: {
    flex: 1,
  },
  followUpText: {
    color: colors.text,
  },
  addFollowUp: {
    fontSize: 16,
    color: colors.text,
    paddingVertical: spacing.sm,
    paddingLeft: 18 + spacing.md,
  },
  done: {
    color: colors.faint,
    textDecorationLine: "line-through",
  },
  timeline: {
    marginTop: spacing.md,
  },
  moment: {
    borderLeftWidth: 1,
    borderLeftColor: colors.hairline,
    paddingLeft: spacing.md,
    paddingBottom: spacing.md,
  },
  momentRow: {
    gap: 2,
  },
  momentDate: {
    fontVariant: ["tabular-nums"],
  },
  momentTitle: {
    color: colors.text,
  },
  momentBody: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  transcript: {
    fontStyle: "italic",
  },
  danger: {
    color: colors.danger,
    marginTop: spacing.xs,
  },
});
