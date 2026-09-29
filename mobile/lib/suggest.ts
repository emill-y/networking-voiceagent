// Suggestions built from the people you've actually saved: search questions
// and follow-ups. Pure functions, so they're easy to test.
import { formatRelative } from "./format.ts";

type Person = {
  id: string;
  name: string;
  company: string | null;
  school: string | null;
  lastInteractionAt: string | null;
  lastEvent: string | null;
  openFollowUps: number;
};

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function byRecent<T extends Person>(people: T[]): T[] {
  return [...people].sort((a, b) => (b.lastInteractionAt ?? "").localeCompare(a.lastInteractionAt ?? ""));
}

const GENERIC_QUESTIONS = [
  "Who did I meet this week?",
  "Who should I follow up with?",
  "Who could help me with my project?",
];

// Questions about your own people ("What do I know about Eisha?").
export function searchSuggestions(people: Person[], now = new Date()): string[] {
  const recent = byRecent(people);
  const [a, b] = recent;
  if (!a) return GENERIC_QUESTIONS;
  const out = [`What do I know about ${firstName(a.name)}?`];
  const when = formatRelative(a.lastInteractionAt, now);
  out.push(when === "today" || when === "yesterday" ? `Who did I meet ${when}?` : "Who did I meet this week?");
  out.push(a.lastEvent ? `Who else was at ${a.lastEvent}?` : `Where did I meet ${firstName(a.name)}?`);
  const withCompany = recent.find((p) => p.company);
  if (withCompany) out.push(`Who works at ${withCompany.company}?`);
  else if (b) out.push(`What do I know about ${firstName(b.name)}?`);
  return [...new Set(out)].slice(0, 4);
}

// A placeholder for the search box, e.g. "Try ‘Eisha’ or ‘What do I know about Eisha?’".
export function searchPlaceholder(people: Person[]): string {
  const [a] = byRecent(people);
  if (!a) return "Try a name, or ask “who could help with my pitch?”";
  const first = firstName(a.name);
  return `Try ‘${first}’ or ‘What do I know about ${first}?’`;
}

export type FollowUpSuggestion = {
  contactId: string;
  name: string;
  action: string;
  why: string;
  dueInDays: number;
};

// A nudge for each recent person you haven't planned anything with yet.
export function followUpSuggestions(people: Person[], now = new Date(), limit = 3): FollowUpSuggestion[] {
  return byRecent(people)
    .filter((p) => p.openFollowUps === 0)
    .slice(0, limit)
    .map((p) => {
      const first = firstName(p.name);
      const when = formatRelative(p.lastInteractionAt, now);
      const action = p.company
        ? `Ask ${first} how things are at ${p.company}`
        : p.lastEvent
          ? `Follow up with ${first} from ${p.lastEvent}`
          : `Check in with ${first}`;
      const why = [when ? `Met ${when}` : null, p.lastEvent].filter(Boolean).join(" · ") || "You haven’t planned anything yet";
      return { contactId: p.id, name: p.name, action, why, dueInDays: 3 };
    });
}
