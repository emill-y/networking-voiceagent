// Turn stored fields into short, human sentences for the profile page.
import type { ContactDetail, Interaction } from "../types/api";

import { formatRelative } from "./format.ts";

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
