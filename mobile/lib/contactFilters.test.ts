/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";

import { activeFilterCount, applyFilters, emptyFilters, facetOptions, toggleFacet, type ContactLike } from "./contactFilters.ts";

const NOW = new Date("2026-10-03T12:00:00Z").getTime();
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

const people: ContactLike[] = [
  { id: "1", name: "Maya Singh", company: "Figma", role: "Designer", school: null, location: "San Francisco",
    lastInteractionAt: ago(3), firstMetAt: ago(200), lastEvent: "SF Design Week", openFollowUps: 1, moments: 4,
    interests: ["design", "ceramics"], events: ["SF Design Week"] },
  { id: "2", name: "Jason Chen", company: "Lumen", role: "Founder", school: "UC Berkeley", location: "Berkeley",
    lastInteractionAt: ago(10), firstMetAt: ago(10), lastEvent: "Cal Hacks", openFollowUps: 0, moments: 1,
    interests: ["ai", "robotics"], events: ["Cal Hacks"] },
  { id: "3", name: "Sarah Kim", company: null, role: "Researcher", school: "UC Berkeley", location: "Berkeley",
    lastInteractionAt: ago(120), firstMetAt: ago(120), lastEvent: null, openFollowUps: 2, moments: 2,
    interests: ["ai", "biotech"], events: [] },
];

test("search matches every word across fields", () => {
  const f = { ...emptyFilters(), query: "berkeley ai" };
  assert.deepEqual(applyFilters(people, f, NOW).map((p) => p.id), ["2", "3"]);
  assert.deepEqual(applyFilters(people, { ...emptyFilters(), query: "ceramics" }, NOW).map((p) => p.id), ["1"]);
});

test("filters combine: search + facet + recency", () => {
  let f = toggleFacet({ ...emptyFilters(), query: "uc berkeley" }, "interest", "AI");
  assert.deepEqual(applyFilters(people, f, NOW).map((p) => p.id), ["2", "3"]);
  f = { ...f, metWithin: "month" };
  assert.deepEqual(applyFilters(people, f, NOW).map((p) => p.id), ["2"]);
  assert.equal(activeFilterCount(f), 2);
  assert.deepEqual(applyFilters(people, { ...emptyFilters(), followUps: true }, NOW).map((p) => p.id), ["1", "3"]);
});

test("sorting", () => {
  const ids = (sort: "recent" | "oldest" | "name" | "frequent") => applyFilters(people, { ...emptyFilters(), sort }, NOW).map((p) => p.id);
  assert.deepEqual(ids("recent"), ["1", "2", "3"]);
  assert.deepEqual(ids("oldest"), ["1", "3", "2"]);
  assert.deepEqual(ids("name"), ["2", "1", "3"]);
  assert.deepEqual(ids("frequent"), ["1", "3", "2"]);
});

test("facet options are counted and toggled case-insensitively", () => {
  assert.deepEqual(facetOptions(people, "school"), [{ value: "UC Berkeley", count: 2 }]);
  assert.deepEqual(facetOptions(people, "interest")[0], { value: "ai", count: 2 });
  const on = toggleFacet(emptyFilters(), "school", "UC Berkeley");
  assert.deepEqual(toggleFacet(on, "school", "uc berkeley").facets.school, []);
});
