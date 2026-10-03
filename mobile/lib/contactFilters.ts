// Contacts: search + combinable filters + sort, all on the device so the
// list responds instantly. Export and share use exactly what's in view.

export type ContactLike = {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  school: string | null;
  major?: string | null;
  location?: string | null;
  email?: string | null;
  lastInteractionAt: string | null;
  firstMetAt?: string | null;
  createdAt?: string | null;
  lastEvent: string | null;
  openFollowUps: number;
  moments?: number;
  interests?: string[];
  events?: string[];
};

export type Sort = "recent" | "oldest" | "name" | "frequent";
export type MetWithin = "any" | "week" | "month" | "quarter" | "older";
export type FacetKey = "school" | "company" | "location" | "interest" | "event";

export type Filters = {
  query: string;
  sort: Sort;
  metWithin: MetWithin;
  followUps: boolean; // only people you owe a follow-up
  facets: Record<FacetKey, string[]>;
};

export const emptyFilters = (): Filters => ({
  query: "",
  sort: "recent",
  metWithin: "any",
  followUps: false,
  facets: { school: [], company: [], location: [], interest: [], event: [] },
});

export const FACET_LABELS: Record<FacetKey, string> = {
  school: "School",
  company: "Company",
  location: "Location",
  interest: "Interest",
  event: "Where you met",
};

export const SORT_LABELS: Record<Sort, string> = {
  recent: "Recently met",
  oldest: "Oldest connection",
  name: "Name",
  frequent: "Most interactions",
};

export const MET_LABELS: Record<MetWithin, string> = {
  any: "Any time",
  week: "This week",
  month: "This month",
  quarter: "Last 3 months",
  older: "Over 3 months ago",
};

function facetValues(c: ContactLike, key: FacetKey): string[] {
  switch (key) {
    case "school":
      return c.school ? [c.school] : [];
    case "company":
      return c.company ? [c.company] : [];
    case "location":
      return c.location ? [c.location] : [];
    case "interest":
      return c.interests ?? [];
    case "event":
      return c.events?.length ? c.events : c.lastEvent ? [c.lastEvent] : [];
  }
}

// Every value of a facet, most common first: "UC Berkeley (12)".
export function facetOptions(contacts: ContactLike[], key: FacetKey, limit = 30): { value: string; count: number }[] {
  const counts = new Map<string, { value: string; count: number }>();
  for (const c of contacts) {
    for (const v of new Set(facetValues(c, key).map((x) => x.trim()).filter(Boolean))) {
      const k = v.toLowerCase();
      const entry = counts.get(k) ?? { value: v, count: 0 };
      entry.count += 1;
      counts.set(k, entry);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)).slice(0, limit);
}

function matchesQuery(c: ContactLike, q: string): boolean {
  if (!q) return true;
  const haystack = [c.name, c.company, c.role, c.school, c.major, c.location, c.email, c.lastEvent, ...(c.interests ?? []), ...(c.events ?? [])]
    .filter(Boolean)
    .join(" \u0000 ")
    .toLowerCase();
  // Every word must appear somewhere ("berkeley design" finds Berkeley designers).
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}

const DAY = 86_400_000;

function metAt(c: ContactLike): number {
  return new Date(c.lastInteractionAt ?? c.createdAt ?? 0).getTime();
}

function firstMet(c: ContactLike): number {
  return new Date(c.firstMetAt ?? c.createdAt ?? c.lastInteractionAt ?? 0).getTime();
}

function withinMet(c: ContactLike, within: MetWithin, now: number): boolean {
  if (within === "any") return true;
  const age = now - metAt(c);
  if (within === "week") return age <= 7 * DAY;
  if (within === "month") return age <= 31 * DAY;
  if (within === "quarter") return age <= 92 * DAY;
  return age > 92 * DAY;
}

export function applyFilters<T extends ContactLike>(contacts: T[], f: Filters, now = Date.now()): T[] {
  const facets = Object.entries(f.facets) as [FacetKey, string[]][];
  const visible = contacts.filter((c) => {
    if (!matchesQuery(c, f.query.trim())) return false;
    if (!withinMet(c, f.metWithin, now)) return false;
    if (f.followUps && c.openFollowUps === 0) return false;
    // Within a facet, any selected value matches; across facets, all must.
    return facets.every(([key, picked]) => {
      if (!picked.length) return true;
      const values = facetValues(c, key).map((v) => v.toLowerCase());
      return picked.some((p) => values.includes(p.toLowerCase()));
    });
  });
  const sorted = [...visible];
  if (f.sort === "recent") sorted.sort((a, b) => metAt(b) - metAt(a));
  if (f.sort === "oldest") sorted.sort((a, b) => firstMet(a) - firstMet(b));
  if (f.sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
  if (f.sort === "frequent") sorted.sort((a, b) => (b.moments ?? 1) - (a.moments ?? 1) || metAt(b) - metAt(a));
  return sorted;
}

export function activeFilterCount(f: Filters): number {
  return (
    Object.values(f.facets).reduce((n, list) => n + list.length, 0) +
    (f.metWithin !== "any" ? 1 : 0) +
    (f.followUps ? 1 : 0)
  );
}

export function toggleFacet(f: Filters, key: FacetKey, value: string): Filters {
  const list = f.facets[key];
  const has = list.some((v) => v.toLowerCase() === value.toLowerCase());
  return { ...f, facets: { ...f.facets, [key]: has ? list.filter((v) => v.toLowerCase() !== value.toLowerCase()) : [...list, value] } };
}
