/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";

import { bucketCounts, bucketOf, dayHeading, dueLabel } from "./followUps.ts";

const now = new Date(2026, 9, 3, 9); // Fri Oct 3
const at = (d: number) => new Date(2026, 9, 3 + d, 12).toISOString();

test("buckets", () => {
  assert.equal(bucketOf({ dueAt: at(-2), status: "open" }, now), "overdue");
  assert.equal(bucketOf({ dueAt: at(0), status: "open" }, now), "week");
  assert.equal(bucketOf({ dueAt: at(6), status: "open" }, now), "week");
  assert.equal(bucketOf({ dueAt: at(9), status: "open" }, now), "later");
  assert.equal(bucketOf({ dueAt: null, status: "open" }, now), "later");
  assert.equal(bucketOf({ dueAt: at(-9), status: "done" }, now), "done");
  assert.deepEqual(bucketCounts([{ dueAt: at(-1), status: "open" }, { dueAt: null, status: "dismissed" }], now),
    { overdue: 1, week: 0, later: 0, done: 0 });
});

test("labels", () => {
  assert.equal(dueLabel(at(0), now), "Today");
  assert.equal(dueLabel(at(1), now), "Tomorrow");
  assert.equal(dueLabel(at(-1), now), "Yesterday");
  assert.equal(dueLabel(at(-3), now), "3 days late");
  assert.equal(dueLabel(null, now), "No date");
  assert.equal(dayHeading("2026-10-03", now), "Today");
  assert.equal(dayHeading("2026-10-04", now), "Tomorrow");
  assert.equal(dayHeading("2026-10-01", now), "Overdue");
});
