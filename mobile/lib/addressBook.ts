// Match address-book entries against people already in Nomi, on the device.
// Only entries the user then picks are ever sent to the backend.
import type { ContactSummary } from "../types/api";

import { phoneKey } from "./phone.ts";

export type AddressBookEntry = {
  id: string; // the phone's own id for the entry
  name: string;
  company: string | null;
  role: string | null;
  phones: { label: string | null; number: string }[];
  emails: string[];
};

export type ImportedPerson = {
  contactId: string | null;
  name: string;
  company: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
};

export type EntryMatch = {
  entry: AddressBookEntry;
  match: ContactSummary | null;
  reason: "phone" | "email" | "name" | null;
  // What importing would add to the matched person (empty = nothing new).
  adds: ("phone" | "email" | "company" | "role")[];
};

function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Prefer a mobile number; otherwise the first one.
export function bestPhone(phones: AddressBookEntry["phones"]): string | null {
  const mobile = phones.find((p) => /mobile|cell|iphone/i.test(p.label ?? ""));
  return (mobile ?? phones[0])?.number ?? null;
}

export function matchEntries(entries: AddressBookEntry[], people: ContactSummary[]): EntryMatch[] {
  const byPhone = new Map<string, ContactSummary>();
  const byEmail = new Map<string, ContactSummary>();
  const byName = new Map<string, ContactSummary[]>();
  for (const person of people) {
    const key = phoneKey(person.phone);
    if (key) byPhone.set(key, person);
    if (person.email) byEmail.set(person.email.trim().toLowerCase(), person);
    const name = normalizeName(person.name);
    byName.set(name, [...(byName.get(name) ?? []), person]);
  }

  return entries.map((entry) => {
    let match: ContactSummary | null = null;
    let reason: EntryMatch["reason"] = null;
    for (const phone of entry.phones) {
      const found = byPhone.get(phoneKey(phone.number) ?? "");
      if (found) {
        match = found;
        reason = "phone";
        break;
      }
    }
    if (!match) {
      const found = entry.emails.map((e) => byEmail.get(e.trim().toLowerCase())).find(Boolean);
      if (found) {
        match = found;
        reason = "email";
      }
    }
    if (!match) {
      // A name alone only counts when exactly one person in Nomi has it.
      const sameName = byName.get(normalizeName(entry.name)) ?? [];
      if (sameName.length === 1) {
        match = sameName[0];
        reason = "name";
      }
    }

    const adds: EntryMatch["adds"] = [];
    if (match) {
      if (!match.phone && entry.phones.length) adds.push("phone");
      if (!match.email && entry.emails.length) adds.push("email");
      if (!match.company && entry.company) adds.push("company");
      if (!match.role && entry.role) adds.push("role");
    }
    return { entry, match, reason, adds };
  });
}

// The server limits field lengths; trim here so one odd address-book entry
// can't make a whole import fail.
function clip(value: string | null, max: number): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, max) : null;
}

export function toImportedPerson({ entry, match }: EntryMatch): ImportedPerson {
  return {
    contactId: match?.id ?? null,
    name: clip(entry.name, 200) ?? "Unnamed",
    company: clip(entry.company, 400),
    role: clip(entry.role, 400),
    email: clip(entry.emails[0] ?? null, 400),
    phone: clip(bestPhone(entry.phones), 400),
  };
}
