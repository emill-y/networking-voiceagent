import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Divider } from "@/components/Divider";
import { Field } from "@/components/Field";
import { Screen } from "@/components/Screen";
import { ApiError } from "@/lib/api";
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
import { colors, radius, spacing, type } from "@/lib/theme";
import { duplicateCheck, extract, saveCapture, transcribe } from "@/services/nomi";

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
  const router = useRouter();
  // `uri` comes from the record screen; `transcript` lets you type a note instead.
  const params = useLocalSearchParams<{ uri?: string; transcript?: string }>();
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
        const result = await extract(text);
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
      const { saved } = await saveCapture(
        transcript || null,
        included.map(toCapturedPerson),
        params.uri ? "voice" : "manual",
      );
      if (saved.length === 1) {
        router.replace({ pathname: "/people/[id]", params: { id: saved[0].contactId } });
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
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[type.title, styles.centerText]}>{stageCopy[stage]}</Text>
          <Text style={[type.meta, styles.centerText]}>
            {stage === "transcribing"
              ? "Turning your voice into words."
              : "Finding the people and what matters about them."}
          </Text>
        </View>
      </Screen>
    );
  }

  if (stage === "error") {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <Text style={[type.title, styles.centerText]}>That didn’t work.</Text>
          <Text style={[type.body, styles.centerText]}>{error}</Text>
          <View style={styles.actions}>
            <Button title="Try again" onPress={() => setAttempt((n) => n + 1)} />
            <Button title="Record again" variant="quiet" onPress={() => router.replace("/record")} />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12}>
        <Text style={type.meta}>Discard</Text>
      </Pressable>

      <Text style={[type.display, styles.title]}>
        {drafts.length === 0
          ? "No one yet."
          : drafts.length === 1
            ? "Here’s who you met."
            : `You met ${drafts.length} people.`}
      </Text>
      <Text style={type.meta}>
        Check what I heard. Nothing is saved until you confirm.
      </Text>

      {transcript ? (
        <Pressable onPress={() => setShowTranscript((v) => !v)} style={styles.transcriptToggle}>
          <Text style={type.label}>{showTranscript ? "Hide" : "Show"} what you said</Text>
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
        <Text style={type.meta}>+ Add someone I missed</Text>
      </Pressable>

      {(problem || error) && (
        <Text style={[type.meta, styles.problem]}>{error ?? problem}</Text>
      )}
      <Button
        title={included.length > 1 ? `Remember ${included.length} people` : "Remember"}
        onPress={() => void save()}
        disabled={!!problem || included.length === 0}
        loading={saving}
      />
    </Screen>
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
          <Text style={type.meta}>{draft.include ? "Skip" : "Include"}</Text>
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
                    <Text style={type.meta}>
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
              <Text style={type.meta}>+ More details</Text>
            </Pressable>
          )}
          <Field label="Follow up" value={draft.followUp} onChangeText={set("followUp")}
            placeholder="e.g. Send the deck next week" />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  centerText: {
    textAlign: "center",
  },
  actions: {
    alignSelf: "stretch",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  title: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  transcriptToggle: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  transcript: {
    fontStyle: "italic",
    color: colors.muted,
  },
  empty: {
    marginTop: spacing.lg,
  },
  person: {
    gap: spacing.md,
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
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  matchQuestion: {
    color: colors.text,
  },
  choice: {
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.raised,
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
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  problem: {
    color: colors.accent,
    marginBottom: spacing.md,
  },
});
