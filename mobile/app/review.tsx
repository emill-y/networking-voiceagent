import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { CloseButton } from "@/components/CloseButton";
import { Button } from "@/components/Button";
import { DatePicker } from "@/components/DatePicker";
import { Divider } from "@/components/Divider";
import { Input as Field } from "@/components/Input";
import { Page } from "@/components/Page";
import { useProfile } from "@/hooks/useProfile";
import { ApiError } from "@/lib/api";
import { examples, extractionContext } from "@/lib/profile";
import { formatRelative } from "@/lib/format";
import {
  chooseExisting,
  chooseNew,
  draftFromExtracted,
  draftProblem,
  emptyDraft,
  toCapturedPerson,
  withCandidates,
  type Draft,
} from "@/lib/review";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";
import { deleteSession, duplicateCheck, extract, getSession, saveCapture, transcribe } from "@/services/nomi";

type TextField = "role" | "company" | "school" | "major" | "location" | "metAt" | "projects"
  | "needs" | "topicsDiscussed" | "interests" | "notes";

const OPTIONAL_FIELDS: { key: TextField; label: string; multiline?: boolean; hint?: string }[] = [
  { key: "role", label: "Role" },
  { key: "company", label: "Company" },
  { key: "school", label: "School" },
  { key: "major", label: "Studies" },
  { key: "location", label: "Based in" },
  { key: "metAt", label: "Where you met" },
  { key: "projects", label: "Working on", multiline: true, hint: "One per line" },
  { key: "needs", label: "Looking for", multiline: true },
  { key: "topicsDiscussed", label: "You talked about", multiline: true },
  { key: "interests", label: "Into", multiline: true },
  { key: "notes", label: "Notes", multiline: true, hint: "Things you weren’t sure about start with “Unsure:”" },
];

type Stage = "transcribing" | "extracting" | "review" | "error";

const stageCopy: Record<"transcribing" | "extracting", string> = {
  transcribing: "Listening back…",
  extracting: "Remembering the details…",
};

function describe(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

export default function Review() {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const router = useRouter();
  const profile = useProfile();
  // `uri` comes from the record screen; `transcript` lets you type a note instead.
  // `session` comes from an ambient session: its people are already found.
  const params = useLocalSearchParams<{ uri?: string; transcript?: string; source?: string; session?: string }>();
  const [stage, setStage] = useState<Stage>(params.transcript ? "extracting" : "transcribing");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState(params.transcript ?? "");
  const [showTranscript, setShowTranscript] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Pipeline: audio -> transcript -> people -> duplicate suggestions.
  // Each stage is a separate request, so a failure says exactly where.
  useEffect(() => {
    let active = true;
    async function run() {
      setError(null);
      try {
        if (params.session) {
          setStage("extracting");
          const found = (await getSession(params.session)).people;
          let next = found.map(draftFromExtracted);
          try {
            const { matches } = await duplicateCheck(found.map((p) => ({ name: p.name, company: p.company, school: p.school })));
            next = next.map((draft, i) => withCandidates(draft, matches[i] ?? []));
          } catch {
            // Duplicate suggestions unavailable.
          }
          if (!active) return;
          setDrafts(next);
          setStage("review");
          return;
        }
        let text = transcript;
        if (!text) {
          if (!params.uri) throw new ApiError("There's no recording to process.", null);
          setStage("transcribing");
          text = (await transcribe(params.uri)).text;
          if (!active) return;
          setTranscript(text);
          if (!text.trim()) {
            throw new ApiError("I couldn't hear any words in that recording.", null);
          }
        }

        setStage("extracting");
        const result = await extract(text, extractionContext(profile));
        let next = result.people.map(draftFromExtracted);

        // Suggestions are a convenience; if the check fails, carry on.
        try {
          const { matches } = await duplicateCheck(
            result.people.map((p) => ({ name: p.name, company: p.company, school: p.school })),
          );
          next = next.map((draft, i) => withCandidates(draft, matches[i] ?? []));
        } catch {
          // Duplicate suggestions unavailable (e.g. database offline).
        }

        if (!active) return;
        setDrafts(next);
        setStage("review");
      } catch (e) {
        if (!active) return;
        setError(describe(e));
        setStage("error");
      }
    }
    void run();
    return () => {
      active = false;
    };
    // Re-run only when the user retries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  function update(key: string, change: (draft: Draft) => Draft) {
    setDrafts((current) => current.map((d) => (d.key === key ? change(d) : d)));
  }

  const included = drafts.filter((d) => d.include);
  const problem = drafts.map(draftProblem).find(Boolean) ?? null;

  async function save() {
    if (problem || included.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      // Sessions don't keep the recording of other people's conversations:
      // only the details you confirm here are saved.
      const { saved } = await saveCapture(
        params.session ? null : transcript || null,
        included.map(toCapturedPerson),
        params.session || params.uri || params.source === "voice" ? "voice" : "manual",
      );
      if (params.session) void deleteSession(params.session).catch(() => undefined);
      if (saved.length === 1) {
        router.replace({ pathname: "/contacts/[id]", params: { id: saved[0].contactId } });
      } else {
        router.replace("/");
      }
    } catch (e) {
      setError(describe(e));
      setSaving(false);
    }
  }

  if (stage === "transcribing" || stage === "extracting") {
    return (
      <Page scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[type.title, styles.centerText]}>{stageCopy[stage]}</Text>
          <Text style={[type.small, styles.centerText]}>
            {stage === "transcribing"
              ? "Turning your voice into words."
              : "Finding the people and what matters about them."}
          </Text>
        </View>
      </Page>
    );
  }

  if (stage === "error") {
    return (
      <Page scroll={false}>
        <View style={styles.center}>
          <Text style={[type.title, styles.centerText]}>That didn’t work.</Text>
          <Text style={[type.body, styles.centerText]}>{error}</Text>
          <View style={styles.actions}>
            <Button title="Try again" onPress={() => setAttempt((n) => n + 1)} />
            <Button title="Record again" variant="secondary" onPress={() => router.replace("/record")} />
          </View>
        </View>
      </Page>
    );
  }

  return (
    <Page>
      <CloseButton label="Discard" />

      <Text style={[type.display, styles.title]}>
        {drafts.length === 0
          ? "No one yet."
          : drafts.length === 1
            ? "Here’s who you met."
            : `You met ${drafts.length} people.`}
      </Text>
      <Text style={type.small}>
        Check what I heard. Nothing is saved until you confirm.
      </Text>

      {transcript ? (
        <Pressable onPress={() => setShowTranscript((v) => !v)} style={styles.transcriptToggle}>
          <Text style={type.overline}>{showTranscript ? "Hide" : "Show"} what you said</Text>
          {showTranscript && <Text style={[type.body, styles.transcript]}>“{transcript}”</Text>}
        </Pressable>
      ) : null}

      {drafts.length === 0 && (
        <Text style={[type.body, styles.empty]}>
          I couldn’t find anyone in that note. You can add them yourself.
        </Text>
      )}

      {drafts.map((draft, index) => (
        <View key={draft.key}>
          <Divider />
          <PersonEditor
            draft={draft}
            index={index}
            onChange={(change) => update(draft.key, change)}
          />
        </View>
      ))}

      <Divider />

      <Pressable
        onPress={() => setDrafts((current) => [...current, emptyDraft()])}
        accessibilityRole="button"
        style={styles.addPerson}
      >
        <Text style={type.small}>+ Add someone I missed</Text>
      </Pressable>

      {(problem || error) && (
        <Text style={[type.small, styles.problem]}>{error ?? problem}</Text>
      )}
      <Button variant="primary" size="lg"
        title={included.length > 1 ? `Remember ${included.length} people` : "Remember"}
        onPress={() => void save()}
        disabled={!!problem || included.length === 0}
        loading={saving}
      />
    </Page>
  );
}

function PersonEditor({
  draft,
  index,
  onChange,
}: {
  draft: Draft;
  index: number;
  onChange: (change: (draft: Draft) => Draft) => void;
}) {
  const styles = useStyles();
  const { type } = useTheme();
  const followUpExample = examples(useProfile()).followUp;
  // Only show what was heard; empty fields wait behind "More details".
  const [showAll, setShowAll] = useState(false);
  const set = (field: keyof Draft) => (value: string) =>
    onChange((d) => ({ ...d, [field]: value }));

  return (
    <View style={[styles.person, !draft.include && styles.excluded]}>
      <View style={styles.personHeader}>
        <Text style={type.heading}>{draft.name.trim() || `Person ${index + 1}`}</Text>
        <Pressable
          onPress={() => onChange((d) => ({ ...d, include: !d.include }))}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={type.small}>{draft.include ? "Skip" : "Include"}</Text>
        </Pressable>
      </View>

      {draft.include && (
        <>
          {draft.candidates.length > 0 && (
            <View style={styles.match}>
              <Text style={[type.body, styles.matchQuestion]}>Have you met before?</Text>
              {draft.candidates.map((c) => {
                const selected = draft.decision === "existing" && draft.contactId === c.contactId;
                return (
                  <Pressable
                    key={c.contactId}
                    onPress={() => onChange((d) => chooseExisting(d, c.contactId))}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={[styles.choice, selected && styles.choiceSelected]}
                  >
                    <Text style={styles.choiceTitle}>Yes — {c.name}</Text>
                    <Text style={type.small}>
                      {[c.role, c.company ?? c.school].filter(Boolean).join(" · ")}
                      {c.lastInteractionAt ? ` · last seen ${formatRelative(c.lastInteractionAt)}` : ""}
                      {` · ${c.reason}`}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => onChange(chooseNew)}
                accessibilityRole="radio"
                accessibilityState={{ selected: draft.decision === "new" }}
                style={[styles.choice, draft.decision === "new" && styles.choiceSelected]}
              >
                <Text style={styles.choiceTitle}>No, someone new</Text>
              </Pressable>
            </View>
          )}

          <Field label="Name" value={draft.name} onChangeText={set("name")} autoCapitalize="words"
            placeholder="Or a few words, like “bakery owner from Oakland”" />
          {OPTIONAL_FIELDS.filter((f) => showAll || draft[f.key].trim()).map((f) => (
            <Field
              key={f.key}
              label={f.label}
              value={draft[f.key]}
              onChangeText={set(f.key)}
              multiline={f.multiline}
              hint={f.hint}
            />
          ))}
          {!showAll && OPTIONAL_FIELDS.some((f) => !draft[f.key].trim()) && (
            <Pressable onPress={() => setShowAll(true)} accessibilityRole="button" hitSlop={8}>
              <Text style={type.small}>+ More details</Text>
            </Pressable>
          )}
          <Field label="Follow up" value={draft.followUp} onChangeText={set("followUp")}
            placeholder={followUpExample} />
          {draft.followUp.trim() ? (
            <DatePicker label="Due" value={draft.followUpDue} onChange={set("followUpDue")} />
          ) : null}
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: space.md,
    paddingBottom: space.xxl,
  },
  centerText: {
    textAlign: "center",
  },
  actions: {
    alignSelf: "stretch",
    gap: space.md,
    marginTop: space.lg,
  },
  title: {
    marginTop: space.xl,
    marginBottom: space.xs,
  },
  transcriptToggle: {
    marginTop: space.lg,
    gap: space.xs,
  },
  transcript: {
    fontStyle: "italic",
    color: colors.textSecondary,
  },
  empty: {
    marginTop: space.lg,
  },
  person: {
    gap: space.md,
  },
  excluded: {
    opacity: 0.5,
  },
  personHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  match: {
    gap: space.xs,
    padding: space.md,
    backgroundColor: colors.sunken,
    borderRadius: radius.md,
  },
  matchQuestion: {
    color: colors.text,
  },
  choice: {
    paddingVertical: 10,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceHover,
    borderWidth: 1,
    borderColor: "transparent",
    gap: 2,
  },
  choiceSelected: {
    borderColor: colors.accent,
  },
  choiceTitle: {
    fontSize: 15,
    color: colors.text,
  },
  addPerson: {
    paddingVertical: space.xs,
    marginBottom: space.lg,
  },
  problem: {
    color: colors.accent,
    marginBottom: space.md,
  },
}),
);
