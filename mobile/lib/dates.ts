// Calendar dates ("YYYY-MM-DD") in the user's own timezone.

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localToday(): string {
  return toDateString(new Date());
}

export function isDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

// Stored as a timestamp at local noon, so it never slips a day across timezones.
export function dateToDueAt(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toISOString();
}

export type DueGroup = "overdue" | "today" | "week" | "later" | "none";

export function dueGroup(dueAt: string | null, now = new Date()): DueGroup {
  if (!dueAt) return "none";
  const due = toDateString(new Date(dueAt));
  const today = toDateString(now);
  if (due < today) return "overdue";
  if (due === today) return "today";
  const weekAhead = toDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));
  return due <= weekAhead ? "week" : "later";
}
