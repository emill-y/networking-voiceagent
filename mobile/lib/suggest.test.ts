/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";

import { followUpSuggestions, searchPlaceholder, searchSuggestions } from "./suggest.ts";

const now = new Date("2026-09-30T12:00:00");
const eisha = { id: "1", name: "Eisha Yadav", company: null, school: "UC Berkeley",
  lastInteractionAt: "2026-09-29T18:00:00", lastEvent: "Floor 4 of Unit 2", openFollowUps: 0 };
const maya = { id: "2", name: "Maya Singh", company: "Stripe", school: null,
  lastInteractionAt: "2026-09-20T18:00:00", lastEvent: null, openFollowUps: 1 };

test("search questions are about your own people", () => {
  assert.deepEqual(searchSuggestions([maya, eisha], now), [
    "What do I know about Eisha?",
    "Who did I meet yesterday?",
    "Who else was at Floor 4 of Unit 2?",
    "Who works at Stripe?",
  ]);
  assert.equal(searchPlaceholder([eisha]), "Try ‘Eisha’ or ‘What do I know about Eisha?’");
  assert.equal(searchSuggestions([], now).length, 3);
});

test("follow-up suggestions skip people you already planned something with", () => {
  const [only, ...rest] = followUpSuggestions([maya, eisha], now);
  assert.equal(rest.length, 0);
  assert.equal(only.name, "Eisha Yadav");
  assert.equal(only.action, "Follow up with Eisha from Floor 4 of Unit 2");
  assert.equal(only.why, "Met yesterday · Floor 4 of Unit 2");
  const [withCompany] = followUpSuggestions([{ ...maya, openFollowUps: 0 }], now);
  assert.equal(withCompany.action, "Ask Maya how things are at Stripe");
});

import { matchContacts } from "./suggest.ts";

test("search suggests contacts while you type", () => {
  const person = (id: string, name: string, extra = {}) => ({ id, name, company: null, school: null, role: null, lastEvent: null, ...extra });
  const people = [
    person("1", "Omar Haddad", { company: "Mapbox" }),
    person("2", "Maya Singh", { company: "Figma" }),
    person("3", "Jason Chen", { lastEvent: "Mayfield mixer" }),
    person("4", "Tomás Maya"),
    person("5", "Annie Park"),
  ];
  assert.deepEqual(matchContacts(people, "maya").map((p) => p.name), ["Maya Singh", "Tomás Maya"]);
  assert.deepEqual(matchContacts(people, " Ma").map((p) => p.name), ["Maya Singh", "Tomás Maya", "Omar Haddad", "Jason Chen"]);
  assert.deepEqual(matchContacts(people, ""), []);
  assert.equal(matchContacts(people, "a", 2).length, 2);
});
