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

export type Briefing = {
  headline: string;
  remember: string[];
};

const ORDINALS = ["", "", "second", "third", "fourth", "fifth"];

// "Before you meet again": built only from what's stored, never invented.
export function briefing(person: ContactDetail, now = new Date()): Briefing | null {
  const [latest] = person.interactions;
  if (!latest) return null;
  const firstName = person.name.split(/\s+/)[0];
  const when = formatRelative(latest.interactionDate, now);
  const where = latest.event ? ` at ${latest.event}` : "";
  const count = person.interactions.length;

  let headline =
    when === "today" || when === "yesterday"
      ? `You met ${firstName} ${when}${where}.`
      : `You last saw ${firstName} ${when}${where}.`;
  if (count > 1) {
    headline += ` That was the ${ORDINALS[count] ?? `${count}th`} time you’ve met.`;
  }

  const remember: string[] = [];
  for (const followUp of person.followUps.filter((f) => f.status === "open")) {
    remember.push(`You planned to: ${followUp.action.charAt(0).toLowerCase()}${followUp.action.slice(1)}.`);
  }
  // "a robotics startup" -> "Ask how the robotics startup is going."
  for (const project of latest.projects) {
    remember.push(`Ask how ${project.replace(/^(a|an) /i, "the ")} is going.`);
  }
  for (const need of latest.needs) remember.push(`Ask whether they found ${need}.`);
  for (const note of latest.notes) {
    if (note.startsWith("Unsure:")) remember.push(`Check: ${note.slice(7).trim()}.`);
  }
  return { headline, remember: remember.slice(0, 4) };
}
