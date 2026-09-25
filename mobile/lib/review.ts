// Pure helpers for the review screen: extracted person <-> editable draft
// <-> save payload. No React here, so these are easy to unit test.
import type { CapturedPerson, DuplicateCandidate, ExtractedPerson } from "../types/api";

import { dateToDueAt, isDateString } from "./dates.ts";

export type Decision = "undecided" | "new" | "existing";

export type Draft = {
  key: string;
  include: boolean;
  candidates: DuplicateCandidate[];
  decision: Decision;
  contactId: string | null;
  name: string;
  role: string;
  company: string;
  school: string;
  major: string;
  location: string;
  metAt: string;
  projects: string; // list fields are edited as one item per line
  needs: string;
  topicsDiscussed: string;
  interests: string;
  notes: string;
  followUp: string;
  followUpDue: string; // "YYYY-MM-DD" or ""
};

export const LIST_FIELDS = ["projects", "needs", "topicsDiscussed", "interests", "notes"] as const;

let nextKey = 0;

export function emptyDraft(): Draft {
  nextKey += 1;
  return {
    key: `draft-${nextKey}`,
    include: true,
    candidates: [],
    decision: "new",
    contactId: null,
    name: "",
    role: "",
    company: "",
    school: "",
    major: "",
    location: "",
    metAt: "",
    projects: "",
    needs: "",
    topicsDiscussed: "",
    interests: "",
    notes: "",
    followUp: "",
    followUpDue: "",
  };
}

export function draftFromExtracted(person: ExtractedPerson): Draft {
  return {
    ...emptyDraft(),
    name: person.name ?? "",
    role: person.role ?? "",
    company: person.company ?? "",
    school: person.school ?? "",
    major: person.major ?? "",
    location: person.location ?? "",
    metAt: person.metAt ?? "",
    projects: person.projects.join("\n"),
    needs: person.needs.join("\n"),
    topicsDiscussed: person.topicsDiscussed.join("\n"),
    interests: person.interests.join("\n"),
    notes: person.notes.join("\n"),
    followUp: person.followUp ?? "",
    followUpDue: person.followUpDue ?? "",
  };
}

// Strong matches must be answered by the user; weaker ones default to "new".
export function withCandidates(draft: Draft, candidates: DuplicateCandidate[]): Draft {
  const strong = candidates.some((c) => c.strength === "strong");
  return { ...draft, candidates, decision: strong ? "undecided" : "new", contactId: null };
}

export function chooseExisting(draft: Draft, contactId: string): Draft {
  return { ...draft, decision: "existing", contactId };
}

export function chooseNew(draft: Draft): Draft {
  return { ...draft, decision: "new", contactId: null };
}

function text(value: string): string | null {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed ? trimmed : null;
}

export function splitLines(value: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const line of value.split(/\n|,(?=\s)/)) {
    const item = line.trim().replace(/\s+/g, " ");
    if (item && !seen.has(item.toLowerCase())) {
      seen.add(item.toLowerCase());
      items.push(item);
    }
  }
  return items;
}

// Why a draft can't be saved yet, or null if it's ready.
export function draftProblem(draft: Draft): string | null {
  if (!draft.include) return null;
  if (!text(draft.name)) return "Add a name, or a few words to recognize them by.";
  if (draft.decision === "undecided") return "Is this someone you already know?";
  const due = draft.followUpDue.trim();
  if (text(draft.followUp) && due && !isDateString(due)) return "Write the due date as YYYY-MM-DD.";
  return null;
}

export function toCapturedPerson(draft: Draft): CapturedPerson {
  const followUp = text(draft.followUp);
  return {
    contactId: draft.decision === "existing" ? draft.contactId : null,
    contact: {
      name: text(draft.name) ?? "",
      company: text(draft.company),
      role: text(draft.role),
      school: text(draft.school),
      major: text(draft.major),
      location: text(draft.location),
    },
    interaction: {
      event: text(draft.metAt),
      location: text(draft.location),
      projects: splitLines(draft.projects),
      needs: splitLines(draft.needs),
      topicsDiscussed: splitLines(draft.topicsDiscussed),
      interests: splitLines(draft.interests),
      notes: splitLines(draft.notes),
    },
    followUp: followUp
      ? {
          action: followUp,
          dueAt: isDateString(draft.followUpDue.trim()) ? dateToDueAt(draft.followUpDue.trim()) : null,
        }
      : null,
  };
}
