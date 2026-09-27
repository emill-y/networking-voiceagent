/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";

import { bestPhone, matchEntries, toImportedPerson, type AddressBookEntry } from "./addressBook.ts";

const person = (id: string, name: string, extra = {}) => ({
  id, name, company: null, role: null, school: null, email: null, phone: null,
  lastInteractionAt: null, lastEvent: null, openFollowUps: 0, ...extra,
});

const entry = (id: string, name: string, extra: Partial<AddressBookEntry> = {}): AddressBookEntry => ({
  id, name, company: null, role: null, phones: [], emails: [], ...extra,
});

test("matches by phone, then email, then a unique name", () => {
  const people = [
    person("p1", "Jason Chen", { phone: "+1 415 555 0101" }),
    person("p2", "Priya Shah", { email: "priya@figma.com" }),
    person("p3", "Emma Park"),
    person("p4", "Alex Kim"),
    person("p5", "Alex Kim"),
  ];
  const [byPhone, byEmail, byName, ambiguous, stranger] = matchEntries(
    [
      entry("a", "Jay", { phones: [{ label: "mobile", number: "(415) 555-0101" }], emails: ["j@robo.dev"] }),
      entry("b", "P. Shah", { emails: ["PRIYA@figma.com"], company: "Figma" }),
      entry("c", "Émma  Park"),
      entry("d", "Alex Kim"),
      entry("e", "Diego Ramirez"),
    ],
    people,
  );
  assert.deepEqual([byPhone.match?.id, byPhone.reason, byPhone.adds], ["p1", "phone", ["email"]]);
  assert.deepEqual([byEmail.match?.id, byEmail.reason, byEmail.adds], ["p2", "email", ["company"]]);
  assert.deepEqual([byName.match?.id, byName.reason, byName.adds], ["p3", "name", []]);
  assert.equal(ambiguous.match, null); // two Alex Kims: don't guess
  assert.equal(stranger.match, null);
});

test("prefers a mobile number when importing", () => {
  const phones = [
    { label: "work", number: "111 111 1111" },
    { label: "Mobile", number: "222 222 2222" },
  ];
  assert.equal(bestPhone(phones), "222 222 2222");
  const imported = toImportedPerson({
    entry: entry("a", "Diego", { phones, emails: ["d@x.com", "d2@x.com"] }),
    match: null,
    reason: null,
    adds: [],
  });
  assert.deepEqual(imported, {
    contactId: null, name: "Diego", company: null, role: null, email: "d@x.com", phone: "222 222 2222",
  });
});

test("imports trim values to the server's limits", () => {
  const long = "x".repeat(500);
  const imported = toImportedPerson({ entry: entry("a", long, { company: long }), match: null, reason: null, adds: [] });
  assert.equal(imported.name.length, 200);
  assert.equal(imported.company?.length, 400);
});
