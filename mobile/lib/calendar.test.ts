/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";

import { addDays, eventDate, eventWhen, monthGrid, nextMonday } from "./calendar.ts";

test("month grid starts on the right weekday and drops empty rows", () => {
  const sept = monthGrid(2026, 8); // September 2026 starts on a Tuesday
  assert.deepEqual(sept[0].slice(0, 3), [null, null, "2026-09-01"]);
  assert.equal(sept.flat().filter(Boolean).length, 30);
  assert.equal(sept.length, 5);
  const feb = monthGrid(2026, 1); // February 2026: 28 days starting Sunday
  assert.equal(feb[0][0], "2026-02-01");
  assert.equal(feb.length, 4);
});

test("quick picks cross month and year ends", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(nextMonday("2026-09-27"), "2026-09-28"); // Sunday -> Monday
  assert.equal(nextMonday("2026-09-28"), "2026-10-05"); // Monday -> next Monday
  assert.equal(nextMonday("2026-10-02"), "2026-10-05"); // Friday -> Monday
});

test("event times read naturally", () => {
  const now = new Date("2026-09-30T09:00:00");
  assert.equal(eventWhen("2026-09-30", true, now), "Today · All day");
  assert.equal(eventWhen("2026-10-01", true, now), "Tomorrow · All day");
  assert.match(eventWhen("2026-09-30T15:30:00", false, now), /^Today · 3:30/);
  assert.equal(eventDate("2026-10-02", true), "2026-10-02");
  assert.equal(eventDate(null, false), null);
});
