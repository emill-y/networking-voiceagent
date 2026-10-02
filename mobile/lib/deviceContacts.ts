// Reading the phone's address book (expo-contacts). Nothing here sends data
// anywhere; the import screen decides what, if anything, leaves the device.
import {
  Contact,
  ContactField,
  ContactsSortOrder,
  getPermissionsAsync,
  requestPermissionsAsync,
} from "expo-contacts";
import * as LegacyContacts from "expo-contacts/legacy";
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
  let entries: AddressBookEntry[];
  try {
    const all = await Contact.getAllDetails(FIELDS, { sortOrder: ContactsSortOrder.UserDefault });
    entries = all.map(toEntry).filter((e): e is AddressBookEntry => e !== null);
  } catch (error) {
    // The newer API is recent; if it fails on a device, the long-standing one still works.
    console.warn("[contacts] new API failed, using legacy:", error);
    entries = await loadWithLegacyApi();
  }
  // Alphabetical, as people expect from their address book.
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

async function loadWithLegacyApi(): Promise<AddressBookEntry[]> {
  const { data } = await LegacyContacts.getContactsAsync({
    fields: [
      LegacyContacts.Fields.Name,
      LegacyContacts.Fields.FirstName,
      LegacyContacts.Fields.LastName,
      LegacyContacts.Fields.Company,
      LegacyContacts.Fields.JobTitle,
      LegacyContacts.Fields.PhoneNumbers,
      LegacyContacts.Fields.Emails,
    ],
  });
  return data
    .map((c): AddressBookEntry | null => {
      const name = c.name?.trim() || [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
      if (!name || !c.id) return null;
      return {
        id: c.id,
        name,
        company: c.company?.trim() || null,
        role: c.jobTitle?.trim() || null,
        phones: (c.phoneNumbers ?? [])
          .filter((p) => p.number?.trim())
          .map((p) => ({ label: p.label ?? null, number: p.number!.trim() })),
        emails: (c.emails ?? []).map((e) => e.email?.trim() ?? "").filter(Boolean),
      };
    })
    .filter((e): e is AddressBookEntry => e !== null);
}

// iOS 18+ "limited access": let the user add more people to what Nomi can see.
export async function chooseMoreContacts(): Promise<void> {
  if (Platform.OS === "ios") await Contact.presentAccessPicker();
}

// The system picker: the user chooses one contact, no permission needed on iOS.
export async function pickContact(): Promise<AddressBookEntry | null> {
  const picked = await Contact.presentPicker();
  if (!picked) return null;
  return toEntry({ ...(await picked.getDetails(FIELDS)), id: picked.id } as Details);
}
