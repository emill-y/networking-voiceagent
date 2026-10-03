// Follow-ups grouped the way people plan: overdue, this week, later, done.
import { dueGroup, toDateString } from "./dates.ts";

type Item = { dueAt: string | null; status: string };

export type Bucket = "overdue" | "week" | "later" | "done";

export const BUCKET_LABELS: Record<Bucket, string> = {
  overdue: "Overdue",
  week: "This week",
  later: "Later",
  done: "Done",
};

export function bucketOf(item: Item, now = new Date()): Bucket {
  if (item.status === "done") return "done";
  const group = dueGroup(item.dueAt, now);
  if (group === "overdue") return "overdue";
  if (group === "today" || group === "week") return "week";
  return "later";
}

export function bucketCounts(items: Item[], now = new Date()): Record<Bucket, number> {
  const counts: Record<Bucket, number> = { overdue: 0, week: 0, later: 0, done: 0 };
  for (const item of items) {
    if (item.status === "dismissed") continue;
    counts[bucketOf(item, now)] += 1;
  }
  return counts;
}

// "Today", "Tomorrow", "Fri", "Oct 12", "2 days late"
export function dueLabel(dueAt: string | null, now = new Date()): string {
  if (!dueAt) return "No date";
  const due = new Date(dueAt);
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(due) - start(now)) / 86_400_000);
  if (days < -1) return `${-days} days late`;
  if (days === -1) return "Yesterday";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return due.toLocaleDateString(undefined, { weekday: "short" });
  return due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// A heading for a day in the Upcoming list: "Today", "Tomorrow", "Wed, Oct 8".
export function dayHeading(day: string, now = new Date()): string {
  const today = toDateString(now);
  const tomorrow = toDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  if (day < today) return "Overdue";
  if (day === today) return "Today";
  if (day === tomorrow) return "Tomorrow";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
