// Turn stored fields into short, human sentences for the profile page.
import type { Interaction } from "../types/api";

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
