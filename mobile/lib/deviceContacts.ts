// Reading the phone's address book (expo-contacts). Nothing here sends data
// anywhere; the import screen decides what, if anything, leaves the device.
import {
  Contact,
  ContactField,
  ContactsSortOrder,
  getPermissionsAsync,
  requestPermissionsAsync,
} from "expo-contacts";
import { Platform } from "react-native";

import type { AddressBookEntry } from "@/lib/addressBook";

export const contactsSupported = Platform.OS === "ios" || Platform.OS === "android";

const FIELDS = [
  ContactField.FULL_NAME,
  ContactField.GIVEN_NAME,
  ContactField.FAMILY_NAME,
  ContactField.COMPANY,
  ContactField.JOB_TITLE,
  ContactField.PHONES,
  ContactField.EMAILS,
] as const;

export type ContactsAccess = "granted" | "limited" | "denied" | "undetermined";

export async function contactsAccess(ask: boolean): Promise<ContactsAccess> {
  const permission = ask ? await requestPermissionsAsync() : await getPermissionsAsync();
  if (permission.granted) return permission.accessPrivileges === "limited" ? "limited" : "granted";
  return permission.canAskAgain ? "undetermined" : "denied";
}

type Details = Awaited<ReturnType<typeof Contact.getAllDetails<typeof FIELDS>>>[number];

function toEntry(details: Details): AddressBookEntry | null {
  const name =
    details.fullName?.trim() ||
    [details.givenName, details.familyName].filter(Boolean).join(" ").trim();
  if (!name) return null; // skip entries with only a company or number
  return {
    id: details.id,
    name,
    company: details.company?.trim() || null,
    role: details.jobTitle?.trim() || null,
    phones: (details.phones ?? [])
      .filter((p) => p.number?.trim())
      .map((p) => ({ label: p.label ?? null, number: p.number!.trim() })),
    emails: (details.emails ?? []).map((e) => e.address?.trim() ?? "").filter(Boolean),
  };
}

export async function loadAddressBook(): Promise<AddressBookEntry[]> {
  const all = await Contact.getAllDetails(FIELDS, { sortOrder: ContactsSortOrder.UserDefault });
  return all.map(toEntry).filter((e): e is AddressBookEntry => e !== null);
}

// The system picker: the user chooses one contact, no permission needed on iOS.
export async function pickContact(): Promise<AddressBookEntry | null> {
  const picked = await Contact.presentPicker();
  if (!picked) return null;
  return toEntry({ ...(await picked.getDetails(FIELDS)), id: picked.id } as Details);
}
