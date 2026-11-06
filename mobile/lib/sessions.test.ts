/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";

import { groupSessions, namesLine, retryable, retryDelay, sessionGroup, sessionLength } from "./sessions.ts";

test("session length uses start and end, else the audio", () => {
  assert.equal(sessionLength({ startedAt: "2026-11-06T18:00:00Z", endedAt: "2026-11-06T19:12:00Z", audioSeconds: 0 }), "1 h 12 min");
  assert.equal(sessionLength({ startedAt: "2026-11-06T18:00:00Z", endedAt: "2026-11-06T20:00:00Z", audioSeconds: 0 }), "2 h");
  assert.equal(sessionLength({ startedAt: "2026-11-06T18:00:00Z", endedAt: null, audioSeconds: 1500 }), "25 min");
  assert.equal(sessionLength({ startedAt: "2026-11-06T18:00:00Z", endedAt: null, audioSeconds: 20 }), "under a minute");
});

test("sessions are grouped newest first", () => {
  const now = new Date(2026, 10, 6, 20);
  const at = (d: number) => new Date(2026, 10, 6 - d, 18).toISOString();
  assert.equal(sessionGroup(at(0), now), "Today");
  assert.equal(sessionGroup(at(3), now), "This week");
  assert.equal(sessionGroup(at(20), now), "This month");
  assert.equal(sessionGroup(at(90), now), "Earlier");
  const groups = groupSessions([{ startedAt: at(40) }, { startedAt: at(0) }, { startedAt: at(2) }, { startedAt: at(1) }], now);
  assert.deepEqual(groups.map((g) => g.group), ["Today", "This week", "Earlier"]);
  assert.deepEqual(groups[1].items.map((x) => x.startedAt), [at(1), at(2)]);
});

test("uploads retry on network and server trouble only", () => {
  assert.equal(retryable(null), true);
  assert.equal(retryable(503), true);
  assert.equal(retryable(429), true);
  assert.equal(retryable(400), false);
  assert.equal(retryable(409), false);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(retryDelay), [1000, 2000, 4000, 8000, 15000, 15000]);
});

test("names read naturally", () => {
  assert.equal(namesLine([]), "");
  assert.equal(namesLine(["Sarah"]), "Sarah");
  assert.equal(namesLine(["Sarah", "Leo"]), "Sarah and Leo");
  assert.equal(namesLine(["Sarah", "Leo", "Kai"]), "Sarah, Leo and Kai");
  assert.equal(namesLine(["Sarah", "Leo", "Kai", "Ines"]), "Sarah, Leo and 2 others");
});
