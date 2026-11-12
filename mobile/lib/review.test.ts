/// <reference types="node" />
// Run with `npm test` (Node's built-in test runner; types are stripped).
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  chooseExisting,
  draftFromExtracted,
  draftProblem,
  emptyDraft,
  splitLines,
  toCapturedPerson,
  withCandidates,
} from "./review.ts";

const jason = {
  name: "Jason Chen",
  company: null,
  role: "Founder",
  school: "UC Berkeley",
  major: "EECS",
  metAt: "Berkeley founders mixer",
  location: null,
  interests: [],
  projects: ["robotics startup"],
  needs: ["designers"],
  topicsDiscussed: ["Magic Hour"],
  notes: ["Unsure: may be a sophomore"],
  followUp: "Reach out next week",
  followUpDue: "2026-09-28",
};

const candidate = (strength: "strong" | "possible") => ({
  contactId: "c1",
  name: "Jason Chen",
  company: null,
  role: null,
  school: null,
  lastInteractionAt: null,
  strength,
  reason: "Same name",
});

test("round-trips an extracted person into a save payload", () => {
  const payload = toCapturedPerson(draftFromExtracted(jason));
  assert.equal(payload.contactId, null);
  assert.deepEqual(payload.contact, {
    name: "Jason Chen",
    company: null,
    role: "Founder",
    school: "UC Berkeley",
    major: "EECS",
    location: null,
  });
  assert.equal(payload.interaction.event, "Berkeley founders mixer");
  assert.deepEqual(payload.interaction.projects, ["robotics startup"]);
  assert.deepEqual(payload.interaction.notes, ["Unsure: may be a sophomore"]);
  assert.equal(payload.followUp?.action, "Reach out next week");
  assert.equal(new Date(payload.followUp?.dueAt ?? "").getDate(), 28);
});

test("edited list text is split, trimmed and de-duplicated", () => {
  assert.deepEqual(splitLines(" robotics \n\nRobotics\ndrones, hardware "), [
    "robotics",
    "drones",
    "hardware",
  ]);
});

test("blank follow-up is omitted", () => {
  const draft = { ...draftFromExtracted(jason), followUp: "   " };
  assert.equal(toCapturedPerson(draft).followUp, null);
});

test("a name is required", () => {
  assert.match(draftProblem(emptyDraft()) ?? "", /name/);
  assert.equal(draftProblem({ ...emptyDraft(), include: false }), null);
});

test("strong duplicate matches need an explicit answer", () => {
  const draft = withCandidates(draftFromExtracted(jason), [candidate("strong")]);
  assert.equal(draft.decision, "undecided");
  assert.match(draftProblem(draft) ?? "", /already know/);

  const linked = chooseExisting(draft, "c1");
  assert.equal(draftProblem(linked), null);
  assert.equal(toCapturedPerson(linked).contactId, "c1");
});

test("possible matches default to a new person", () => {
  const draft = withCandidates(draftFromExtracted(jason), [candidate("possible")]);
  assert.equal(draft.decision, "new");
  assert.equal(toCapturedPerson(draft).contactId, null);
});

import { joinList, memoryLines, plansWith, subtitle } from "./memory.ts";

test("memory lines read like sentences", () => {
  const lines = memoryLines({
    id: "i1",
    contactId: "c1",
    event: "Mixer",
    location: null,
    summary: null,
    rawTranscript: null,
    interests: [],
    projects: ["a robotics startup"],
    needs: ["designers", "a cofounder"],
    topicsDiscussed: ["Magic Hour"],
    notes: ["Unsure: may work at Google"],
    interactionDate: "2026-09-24T00:00:00Z",
    sourceType: "voice",
  });
  assert.deepEqual(lines, [
    "Working on a robotics startup.",
    "Looking for designers and a cofounder.",
    "You talked about Magic Hour.",
    "Unsure: may work at Google.",
  ]);
  assert.equal(joinList(["a", "b", "c"]), "a, b and c");
  assert.equal(subtitle({ role: "Founder", company: null, major: "EECS" }), "Founder · EECS");
  assert.equal(subtitle({ role: "Designer", company: "Figma" }), "Designer at Figma");
});

import { dueGroup, isDateString } from "./dates.ts";

test("due dates are validated and grouped", () => {
  assert.equal(isDateString("2026-02-30"), false);
  assert.equal(isDateString("2026-02-28"), true);
  const draft = { ...draftFromExtracted(jason), followUpDue: "next tuesday" };
  assert.match(draftProblem(draft) ?? "", /YYYY-MM-DD/);

  const now = new Date(2026, 8, 24, 9);
  assert.equal(dueGroup(null, now), "none");
  assert.equal(dueGroup(new Date(2026, 8, 23, 12).toISOString(), now), "overdue");
  assert.equal(dueGroup(new Date(2026, 8, 24, 12).toISOString(), now), "today");
  assert.equal(dueGroup(new Date(2026, 8, 30, 12).toISOString(), now), "week");
  assert.equal(dueGroup(new Date(2026, 9, 10, 12).toISOString(), now), "later");
});

test("plans are only the ones you made with them", () => {
  const moment = (date: string, notes: string[] = []) => ({
    id: date, contactId: "c1", event: null, location: null, summary: null, rawTranscript: null,
    interests: [], projects: ["a robotics startup"], needs: [], topicsDiscussed: [], notes,
    interactionDate: date, sourceType: "voice",
  });
  const followUp = (action: string, status: "open" | "done", dueAt: string | null = null) => ({
    id: action, contactId: "c1", contactName: "Jason Chen", interactionId: null, action,
    dueAt, status, createdAt: "2026-08-13T12:00:00Z", completedAt: null,
  });
  const person = {
    id: "c1", name: "Jason Chen", company: null, role: null, school: null, major: null,
    location: null, email: null, phone: null, linkedinUrl: null, websiteUrl: null, summary: null,
    lastInteractionAt: null, createdAt: "2026-01-01T00:00:00Z",
    interactions: [
      moment("2026-08-13T12:00:00", ["Next step: get coffee next week", "Plans: Hawaii trip in December"]),
      moment("2026-07-01T12:00:00", ["Next step: introduce him to Maya"]),
    ],
    followUps: [followUp("introduce him to Maya", "open", "2026-08-20"), followUp("Send my resume", "done")],
  };
  assert.deepEqual(plansWith(person), [
    { text: "Introduce him to Maya.", dueAt: "2026-08-20" },
    { text: "Get coffee next week.", dueAt: null },
  ]);
  // No plans made: nothing to show.
  assert.deepEqual(plansWith({ ...person, followUps: [], interactions: [moment("2026-07-01T12:00:00")] }), []);
});

test("someone whose name wasn't heard can be saved by their label", () => {
  const draft = draftFromExtracted({
    name: null, label: "Airbnb designer who climbs", company: "Airbnb", role: null, school: null, major: null, metAt: null,
    location: null, interests: [], projects: [], needs: [], topicsDiscussed: [], notes: [], followUp: null, followUpDue: null,
  });
  assert.equal(draft.name, "");
  assert.equal(draft.label, "Airbnb designer who climbs");
  assert.equal(draftProblem(draft), null);
  assert.equal(toCapturedPerson(draft).contact.name, "Airbnb designer who climbs");
  assert.equal(toCapturedPerson({ ...draft, name: "Kai" }).contact.name, "Kai");
  assert.notEqual(draftProblem({ ...draft, label: "" }), null);
});
