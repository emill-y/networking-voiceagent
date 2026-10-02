/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";

import { goAction, inviteText, parseInterests, placeLine, planWhen } from "./plans.ts";

test("event dates read naturally, ranges for multi-day conferences", () => {
  assert.equal(planWhen({ start: "2026-10-16", end: "2026-10-18", allDay: true }), "Oct 16–18");
  assert.equal(planWhen({ start: "2026-10-30", end: "2026-11-02", allDay: true }), "Oct 30 – Nov 2");
  assert.equal(planWhen({ start: "2026-10-03", end: "2026-10-03", allDay: true }), "Sat Oct 3");
  assert.match(planWhen({ start: "2026-10-03T18:00:00", end: null, allDay: false }), /^Sat Oct 3 · 6:00/);
});

test("places and invites", () => {
  assert.equal(placeLine({ city: "San Francisco, CA", where: "local", online: false }), "San Francisco, CA · Near you");
  assert.equal(placeLine({ city: null, where: "online", online: true }), "Online");
  const text = inviteText("Annie Park", { title: "Chemistry mixer", url: "https://lu.ma/chem", start: "2026-10-03", end: null, allDay: true }, "chemistry");
  assert.equal(text, "Hey Annie! Want to go to Chemistry mixer together (Sat Oct 3)? Thought of you since we’re both into chemistry. https://lu.ma/chem");
  assert.equal(goAction("Eisha Yadav", "SF Tech Week"), "Go to SF Tech Week with Eisha");
});

test("interests from a comma list", () => {
  assert.deepEqual(parseInterests(" Startups, chemistry ,, startups, Design "), ["startups", "chemistry", "design"]);
});
