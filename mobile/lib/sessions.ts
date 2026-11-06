// Pure helpers for sessions: how long one ran, how the list is grouped, and
// how long to wait before retrying a chunk upload. No React here.

type SessionTimes = { startedAt: string; endedAt: string | null; audioSeconds: number };

// "1 h 12 min", "25 min", "under a minute".
export function sessionLength(s: SessionTimes): string {
  const start = Date.parse(s.startedAt);
  const end = s.endedAt ? Date.parse(s.endedAt) : NaN;
  const seconds = Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 1000 : s.audioSeconds;
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export type SessionGroup = "Today" | "This week" | "This month" | "Earlier";

export function sessionGroup(startedAt: string, now = new Date()): SessionGroup {
  const date = new Date(startedAt);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days < 7) return "This week";
  if (days < 31) return "This month";
  return "Earlier";
}

// Sessions grouped in order, newest first, keeping only non-empty groups.
export function groupSessions<T extends { startedAt: string }>(items: T[], now = new Date()): { group: SessionGroup; items: T[] }[] {
  const order: SessionGroup[] = ["Today", "This week", "This month", "Earlier"];
  const sorted = [...items].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return order
    .map((group) => ({ group, items: sorted.filter((x) => sessionGroup(x.startedAt, now) === group) }))
    .filter((g) => g.items.length > 0);
}

// Upload retries: 1 s, 2 s, 4 s, 8 s, then every 15 s. A chunk is only given
// up on after MAX_ATTEMPTS, and even then it is retried once more at the end.
export const MAX_ATTEMPTS = 6;
export function retryDelay(attempt: number): number {
  return Math.min(15_000, 1000 * 2 ** attempt);
}

// Whether an upload error is worth retrying (network trouble, server busy).
export function retryable(status: number | null): boolean {
  return status === null || status >= 500 || status === 429 || status === 408;
}

// "Sarah Kim, Leo Tran and 3 others"
export function namesLine(names: string[], max = 2): string {
  if (names.length === 0) return "";
  if (names.length <= max + 1) {
    return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  const rest = names.length - max;
  return `${names.slice(0, max).join(", ")} and ${rest} others`;
}
