// Turn stored fields into short, human sentences for the profile page.
import type { ContactDetail, Interaction } from "../types/api";

export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function memoryLines(interaction: Interaction): string[] {
  const lines: string[] = [];
  if (interaction.projects.length) lines.push(`Working on ${joinList(interaction.projects)}.`);
  if (interaction.needs.length) lines.push(`Looking for ${joinList(interaction.needs)}.`);
  if (interaction.topicsDiscussed.length)
    lines.push(`You talked about ${joinList(interaction.topicsDiscussed)}.`);
  if (interaction.interests.length) lines.push(`Into ${joinList(interaction.interests)}.`);
  for (const note of interaction.notes) lines.push(/[.!?]$/.test(note) ? note : `${note}.`);
  return lines;
}

// ---------------------------------------------------------------------------
// The template for a conversation's notes: one heading per kind of detail,
// short bullet points under each, always in this order. Empty sections are
// left out. Notes are sorted by the prefix the model gives them
// (backend/app/services/extraction.py, WHAT_TO_REMEMBER).
// ---------------------------------------------------------------------------
export type Section = { key: string; title: string; items: string[] };

const TEMPLATE: { key: string; title: string }[] = [
  { key: "met", title: "How you met" },
  { key: "topics", title: "What you talked about" },
  { key: "projects", title: "Working on" },
  { key: "needs", title: "Looking for" },
  { key: "interests", title: "Into" },
  { key: "plans", title: "Their plans" },
  { key: "next", title: "Next steps" },
  { key: "ask", title: "Ask about next time" },
  { key: "notes", title: "Other notes" },
  { key: "unsure", title: "Not sure" },
];

const NOTE_PREFIXES: [RegExp, string][] = [
  [/^how (we|you) met:\s*/i, "met"],
  [/^plans?:\s*/i, "plans"],
  [/^next step:\s*/i, "next"],
  [/^ask about:\s*/i, "ask"],
  [/^unsure:\s*/i, "unsure"],
];

// "plans: hawaii trip in December." -> "Hawaii trip in December"; "ai" -> "AI"
function bullet(text: string): string {
  const trimmed = text.trim().replace(/\.$/, "");
  if (/^[a-z]{1,2}$/.test(trimmed)) return trimmed.toUpperCase();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function conversationSections(interaction: Interaction): Section[] {
  const buckets: Record<string, string[]> = {
    met: [interaction.event, interaction.location].filter((x): x is string => !!x).map((x, i) => (i === 0 ? `At ${x}` : `In ${x}`)),
    topics: interaction.topicsDiscussed.map(bullet),
    projects: interaction.projects.map(bullet),
    needs: interaction.needs.map(bullet),
    interests: interaction.interests.map(bullet),
  };
  for (const note of interaction.notes) {
    const match = NOTE_PREFIXES.find(([re]) => re.test(note));
    const key = match ? match[1] : "notes";
    const text = match ? note.replace(match[0], "") : note;
    if (text.trim()) (buckets[key] ??= []).push(bullet(text));
  }
  return TEMPLATE.map(({ key, title }) => ({ key, title, items: [...new Set(buckets[key] ?? [])] })).filter((s) => s.items.length > 0);
}

export function subtitle(person: {
  role: string | null;
  company: string | null;
  major?: string | null;
}): string {
  const role = person.role && person.company ? `${person.role} at ${person.company}` : person.role ?? person.company;
  return [role, person.major].filter(Boolean).join(" · ");
}

export type Plan = { text: string; dueAt: string | null };

const NEXT_STEP = /^next step:\s*/i;

// Plans you made with this person: your open follow-ups, and the next steps
// noted when you saved a session ("Next step: get coffee next week").
// Empty when you didn't make any, so the page can leave the section out.
export function plansWith(person: ContactDetail): Plan[] {
  const plans: Plan[] = person.followUps
    .filter((f) => f.status === "open")
    .map((f) => ({ text: sentence(f.action), dueAt: f.dueAt }));
  for (const moment of person.interactions) {
    for (const note of moment.notes) {
      if (NEXT_STEP.test(note)) plans.push({ text: sentence(note.replace(NEXT_STEP, "")), dueAt: null });
    }
  }
  const seen = new Set<string>();
  return plans.filter((p) => {
    const key = p.text.toLowerCase().replace(/[.!?]$/, "");
    if (!p.text || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const capped = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}
