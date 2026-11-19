import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/Input";
import { ExpandableNotes, notesLines } from "@/components/Notes";
import { PageLoader } from "@/components/OrbitLoader";
import { Page } from "@/components/Page";
import { SessionTitle } from "@/components/SessionTitle";
import { useToast } from "@/components/Toast";
import { Txt } from "@/components/Txt";
import { useDesktop } from "@/hooks/useDesktop";
import { ApiError } from "@/lib/api";
import { confirm } from "@/lib/confirm";
import { formatRelative } from "@/lib/format";
import { chooseExisting, chooseNew, draftFromExtracted, draftProblem, emptyDraft, toCapturedPerson, withCandidates, type Draft } from "@/lib/review";
import { sessionLength } from "@/lib/sessions";
import { layout, makeStyles, radius, space, useTheme } from "@/lib/theme";
import { deleteSession, duplicateCheck, getSession, saveSession } from "@/services/nomi";
import type { AmbientSession, ExtractedPerson } from "@/types/api";

type TextField = "role" | "company" | "school" | "major" | "location" | "projects" | "needs" | "topicsDiscussed" | "interests" | "notes";

const FIELDS: { key: TextField; label: string; multiline?: boolean }[] = [
  { key: "role", label: "Role" },
  { key: "company", label: "Company" },
  { key: "school", label: "School" },
  { key: "major", label: "Studies" },
  { key: "location", label: "Based in" },
  { key: "projects", label: "Working on", multiline: true },
  { key: "needs", label: "Looking for", multiline: true },
  { key: "topicsDiscussed", label: "You talked about", multiline: true },
  { key: "interests", label: "Into", multiline: true },
  { key: "notes", label: "Notes", multiline: true },
];

// The name the user gave the session is where they met; a title Nomi made up
// from the conversation ("Hawaii trip plans") isn't a place.
function eventOf(session: AmbientSession): string | null {
  return session.titleAuto ? null : session.title;
}

// Sessions don't create follow-up tasks; a next step is kept as a note.
function toDraft(person: ExtractedPerson, event: string | null): Draft {
  const draft = draftFromExtracted({ ...person, metAt: person.metAt ?? event });
  if (!draft.followUp.trim()) return draft;
  const note = `Next step: ${draft.followUp.trim()}`;
  return { ...draft, notes: draft.notes ? `${draft.notes}\n${note}` : note, followUp: "", followUpDue: "" };
}

// Everyone a session found, in one list: check, fix, save.
export default function ReviewSession() {
  const s = useStyles();
  const router = useRouter();
  const toast = useToast();
  const desktop = useDesktop();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<AmbientSession | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { colors } = useTheme();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const found = await getSession(id);
        if (!active) return;
        if (found.status === "saved") return router.replace(`/sessions/${id}`);
        if (found.status === "recording") return router.replace("/session");
        setSession(found);
        let next = found.people.map((p) => toDraft(p, eventOf(found)));
        try {
          const { matches } = await duplicateCheck(found.people.map((p) => ({ name: p.name, company: p.company, school: p.school })));
          next = next.map((d, i) => withCandidates(d, matches[i] ?? []));
        } catch {
          // Suggestions are a convenience.
        }
        if (active) setDrafts(next);
      } catch (e) {
        if (active) setError(e instanceof ApiError ? e.message : "Couldn’t open this session.");
      }
    })();
    return () => {
      active = false;
    };
  }, [id, router]);

  if (error && !drafts) {
    return (
      <Page tabBar={false} width="narrow" back={{ label: "Sessions", href: "/" }}>
        <Txt variant="title">Couldn’t open this session</Txt>
        <Txt variant="bodySecondary">{error}</Txt>
      </Page>
    );
  }
  if (!session || !drafts) {
    return (
      <Page tabBar={false} scroll={false}>
        <PageLoader label="Getting everyone you met" />
      </Page>
    );
  }

  const update = (key: string, change: (d: Draft) => Draft) => setDrafts((all) => all!.map((d) => (d.key === key ? change(d) : d)));
  const included = drafts.filter((d) => d.include);
  const problemIndex = drafts.findIndex((d) => draftProblem(d));
  const problem = problemIndex >= 0 ? `${drafts[problemIndex].name.trim() || `Person ${problemIndex + 1}`}: ${draftProblem(drafts[problemIndex])}` : null;

  async function save() {
    if (problem || included.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await saveSession(id, included.map(toCapturedPerson));
      toast.show(`Saved ${included.length} ${included.length === 1 ? "person" : "people"}.`, "success");
      router.replace(`/sessions/${id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t save. Check your connection and try again.");
      setSaving(false);
    }
  }

  async function discard() {
    if (!(await confirm("Discard this session?", "No one from it will be saved.", "Discard"))) return;
    await deleteSession(id).catch(() => undefined);
    router.replace("/");
  }

  return (
    <View style={s.fill}>
      <Page tabBar={false} width="narrow" back={{ label: "Sessions", href: "/" }}>
        <View style={s.intro}>
          <View style={s.titleRow}>
            <SessionTitle variant="overline" session={session}
              onRenamed={(next) => setSession((c) => (c ? { ...c, title: next.title, titleAuto: next.titleAuto } : c))} />
            <Txt variant="overline">· {sessionLength(session)}</Txt>
          </View>
          <Txt variant="display" accessibilityRole="header">
            {drafts.length === 1 ? "You met 1 person" : `You met ${drafts.length} people`}
          </Txt>
          <Txt variant="bodySecondary">Check what Nomi heard. Tap someone to fix a detail, add a name it didn’t catch, or uncheck anyone you don’t want to keep.</Txt>
        </View>

        <View style={s.list}>
          {drafts.map((d, i) => (
            <PersonCard key={d.key} draft={d} index={i} first={i === 0} onChange={(c) => update(d.key, c)} />
          ))}
          <Pressable onPress={() => setDrafts((all) => [...all!, { ...emptyDraft(), metAt: eventOf(session) ?? "" }])} accessibilityRole="button"
            style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [s.add, drafts.length > 0 && s.border, (hovered || pressed) && s.hover]}>
            <Icon name="plus" size={16} color={colors.textSecondary} />
            <Txt variant="label" tone="secondary">Add someone Nomi missed</Txt>
          </Pressable>
        </View>

        <Button title="Discard session" variant="ghost" size="sm" onPress={() => void discard()} style={s.center} />
        <View style={{ height: 120 }} />
      </Page>

      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, space.md) }, desktop && s.footerDesktop]}>
        <View style={s.footerInner}>
          {(problem || error) && <Txt variant="small" tone="danger" align="center">{error ?? problem}</Txt>}
          <Button variant="primary" size="lg" fullWidth loading={saving} disabled={!!problem || included.length === 0}
            title={included.length === 0 ? "Choose someone to save" : `Save ${included.length} ${included.length === 1 ? "person" : "people"}`}
            onPress={() => void save()} />
        </View>
      </View>
    </View>
  );
}

function PersonCard({ draft, index, first, onChange }: { draft: Draft; index: number; first: boolean; onChange: (c: (d: Draft) => Draft) => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(!draft.name.trim() && !draft.label.trim());
  // Someone whose name wasn't heard: ask for it right on the card.
  const [unnamed] = useState(!draft.name.trim() && !!draft.label.trim());
  const [moreFields, setMoreFields] = useState(false);
  const notes = notesLines(draft.conversation);
  // Only details that were heard are shown; the rest wait behind "Add a detail".
  const filled = FIELDS.filter((f) => draft[f.key].trim());
  const empty = FIELDS.filter((f) => !draft[f.key].trim());
  const set = (field: keyof Draft) => (value: string) => onChange((d) => ({ ...d, [field]: value }));
  const work = draft.role && draft.company ? `${draft.role} at ${draft.company}` : draft.role || draft.company;
  const firstLine = (v: string) => v.split("\n")[0];
  const facts = [work, draft.school, firstLine(draft.projects), draft.needs && `Looking for ${firstLine(draft.needs)}`, firstLine(draft.topicsDiscussed)]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={[s.person, !first && s.border, !draft.include && s.excluded]}>
      <View style={s.personHead}>
        <Pressable onPress={() => onChange((d) => ({ ...d, include: !d.include }))} accessibilityRole="checkbox"
          accessibilityState={{ checked: draft.include }} accessibilityLabel={`Keep ${draft.name || `person ${index + 1}`}`} hitSlop={10}
          style={[s.check, draft.include && s.checkOn]}>
          {draft.include && <Icon name="check" size={13} color={colors.onAccent} strokeWidth={3} />}
        </Pressable>
        <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityLabel={`${open ? "Close" : "Edit"} ${draft.name || "this person"}`}
          style={s.personMain}>
          <Avatar name={draft.name || draft.label || "?"} size={36} />
          <View style={s.flex}>
            <Txt variant="label" numberOfLines={1}>{draft.name.trim() || draft.label.trim() || `Person ${index + 1}`}</Txt>
            {unnamed && !draft.name.trim() ? <Txt variant="caption">Name not heard</Txt> : null}
            <Txt variant="small" numberOfLines={open ? undefined : 2}>{facts || "Tap to add details"}</Txt>
          </View>
          <Icon name={open ? "chevronUp" : "chevronDown"} size={18} color={colors.textTertiary} />
        </Pressable>
      </View>

      {draft.include && unnamed && !open && (
        <View style={s.fields}>
          <Input value={draft.name} onChangeText={set("name")} autoCapitalize="words" accessibilityLabel={`Name for ${draft.label}`}
            placeholder="Add their name (optional)" />
        </View>
      )}

      {draft.include && !open && notes.length > 0 && (
        <View style={s.notes}>
          <ExpandableNotes lines={notes} />
        </View>
      )}

      {draft.include && draft.candidates.length > 0 && (
        <View style={s.match}>
          <Txt variant="small" tone="default" weight="500">Already in your network?</Txt>
          <View style={s.choices}>
            {draft.candidates.map((c) => {
              const on = draft.decision === "existing" && draft.contactId === c.contactId;
              return (
                <Pressable key={c.contactId} onPress={() => onChange((d) => chooseExisting(d, c.contactId))} accessibilityRole="radio"
                  accessibilityState={{ selected: on }} style={[s.choice, on && s.choiceOn]}>
                  <Txt variant="small" tone="default" weight="500">Yes, {c.name}</Txt>
                  <Txt variant="caption" numberOfLines={1}>
                    {[c.role, c.company ?? c.school, c.lastInteractionAt && `seen ${formatRelative(c.lastInteractionAt)}`].filter(Boolean).join(" · ")}
                  </Txt>
                </Pressable>
              );
            })}
            <Pressable onPress={() => onChange(chooseNew)} accessibilityRole="radio" accessibilityState={{ selected: draft.decision === "new" }}
              style={[s.choice, draft.decision === "new" && s.choiceOn]}>
              <Txt variant="small" tone="default" weight="500">No, someone new</Txt>
            </Pressable>
          </View>
        </View>
      )}

      {open && draft.include && (
        <View style={s.fields}>
          <Input label="Name" value={draft.name} onChangeText={set("name")} autoCapitalize="words"
            placeholder={draft.label ? "Add it now or later" : "Or a few words to recognize them by"} />
          {unnamed && <Input label="Recognize them by" value={draft.label} onChangeText={set("label")} />}
          <Input label="Conversation notes" value={draft.conversation} onChangeText={set("conversation")} multiline
            hint="One line each. Lines starting with ## are headings." style={{ minHeight: 160 }} />
          {[...filled, ...(moreFields ? empty : [])].map((f) => (
            <Input key={f.key} label={f.label} value={draft[f.key]} onChangeText={set(f.key)} multiline={f.multiline}
              hint={f.multiline ? "One per line" : undefined} />
          ))}
          {!moreFields && empty.length > 0 && (
            <Pressable onPress={() => setMoreFields(true)} accessibilityRole="button" hitSlop={8}>
              <Txt variant="small" tone="secondary" weight="500">+ Add a detail ({empty.map((f) => f.label.toLowerCase()).join(", ")})</Txt>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: colors.bg },
    titleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.xxs },
    flex: { flex: 1, minWidth: 0 },
    center: { alignSelf: "center" },
    intro: { gap: space.xs },
    list: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
    border: { borderTopWidth: 1, borderTopColor: colors.border },
    hover: { backgroundColor: colors.surfaceHover },
    add: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs, minHeight: 52 },
    person: { padding: space.md, gap: space.sm },
    excluded: { opacity: 0.45 },
    personHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
    personMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, minWidth: 0 },
    check: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    match: { gap: space.xs, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.sunken, marginLeft: 34 },
    choices: { gap: space.xxs },
    choice: { paddingVertical: space.xs, paddingHorizontal: space.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    choiceOn: { borderColor: colors.text },
    fields: { gap: space.sm, marginLeft: 34 },
    notes: { gap: space.xs, marginLeft: 34, paddingTop: space.xxs },
    footer: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingTop: space.sm,
      paddingHorizontal: space.md,
      backgroundColor: colors.bg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      ...shadow.card,
    },
    footerDesktop: { paddingHorizontal: space.xl },
    footerInner: { width: "100%", maxWidth: layout.narrow - space.xl * 2, alignSelf: "center", gap: space.xs },
  }),
);
