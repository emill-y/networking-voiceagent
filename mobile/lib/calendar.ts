// Month grids and quick picks for the date picker. Dates are "YYYY-MM-DD" in local time.

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function iso(y: number, m: number, d: number): string {
  const date = new Date(y, m, d);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parts(value: string): { year: number; month: number; day: number } {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month: month - 1, day };
}

/** Six rows of seven days (Sunday first); days outside the month are null. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: 42 }, (_, i) => {
    const day = i - first + 1;
    return day >= 1 && day <= days ? iso(year, month, day) : null;
  });
  const rows = Array.from({ length: 6 }, (_, r) => cells.slice(r * 7, r * 7 + 7));
  // Drop empty trailing rows so short months don't leave a gap.
  return rows.filter((row) => row.some(Boolean));
}

export function addDays(value: string, days: number): string {
  const { year, month, day } = parts(value);
  return iso(year, month, day + days);
}

/** The coming Monday (a week from today if today is Monday). */
export function nextMonday(today: string): string {
  const { year, month, day } = parts(today);
  const weekday = new Date(year, month, day).getDay();
  return addDays(today, ((8 - weekday) % 7) || 7);
}

export function monthTitle(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function friendly(value: string, today: string): string {
  if (value === today) return "Today";
  if (value === addDays(today, 1)) return "Tomorrow";
  const { year, month, day } = parts(value);
  const date = new Date(year, month, day);
  const sameYear = year === parts(today).year;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
