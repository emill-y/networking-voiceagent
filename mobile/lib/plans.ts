// Go together: small helpers for showing real events and planning them.
import type { EventWhere, RealEvent } from "@/types/api";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseDay(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

// "Sat Oct 3 · 6:00 PM", or "Oct 16–18" for a conference running several days.
export function planWhen(event: Pick<RealEvent, "start" | "end" | "allDay">): string {
  if (!event.allDay) {
    const d = new Date(event.start);
    if (Number.isNaN(d.getTime())) return "";
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()} · ${time}`;
  }
  const start = parseDay(event.start);
  const end = event.end ? parseDay(event.end) : start;
  const first = `${MONTHS[start.getMonth()]} ${start.getDate()}`;
  if (end <= start) return `${DAYS[start.getDay()]} ${first}`;
  if (end.getMonth() === start.getMonth()) return `${first}–${end.getDate()}`;
  return `${first} – ${MONTHS[end.getMonth()]} ${end.getDate()}`;
}

export const whereLabel: Record<EventWhere, string> = {
  local: "Near you",
  nearby: "Nearby",
  online: "Online",
  travel: "Worth the trip",
  anywhere: "",
};

// "San Francisco, CA · Near you"
export function placeLine(event: Pick<RealEvent, "city" | "where" | "online">): string {
  const where = whereLabel[event.where];
  const city = event.online && !event.city ? "" : event.city ?? "";
  return [city, where].filter(Boolean).join(" · ");
}

// A message to send them, ready to paste.
export function inviteText(name: string, event: Pick<RealEvent, "title" | "url" | "start" | "end" | "allDay">, shared: string): string {
  const first = name.split(" ")[0] || name;
  const about = shared ? ` Thought of you since we’re both into ${shared}.` : "";
  const link = event.url ? ` ${event.url}` : "";
  return `Hey ${first}! Want to go to ${event.title} together (${planWhen(event)})?${about}${link}`;
}

export function goAction(name: string, title: string): string {
  const first = name.split(" ")[0] || name;
  return `Go to ${title} with ${first}`.slice(0, 200);
}

// "startups, chemistry , design" -> ["startups", "chemistry", "design"]
export function parseInterests(text: string): string[] {
  return [...new Set(text.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
}
