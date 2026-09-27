/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";

import { hitTest, layoutNetwork, neighbors, personRadius, YOU_ID } from "./networkLayout.ts";

const person = (id: string, name: string, moments = 1) => ({
  id, kind: "person" as const, name, subtitle: null, moments, lastInteractionAt: null, openFollowUps: 0,
});

const data = {
  people: [person("a", "Jason", 4), person("b", "Maya"), person("c", "Emma"), person("d", "Alex")],
  groups: [],
  edges: [
    { source: "a", target: "b", kind: "organization" as const, reasons: ["Both at UC Berkeley"] },
    { source: "a", target: "b", kind: "interests" as const, reasons: ["Both into robotics"] },
    { source: "a", target: "c", kind: "event" as const, reasons: ["Both met at Cal Hacks"] },
  ],
};

test("you are near the middle and everyone is placed on the canvas", () => {
  const layout = layoutNetwork(data);
  const you = layout.nodes.find((n) => n.id === YOU_ID)!;
  assert.ok(Math.abs(you.x - layout.width / 2) < layout.width * 0.3);
  assert.ok(Math.abs(you.y - layout.height / 2) < layout.height * 0.3);
  for (const n of layout.nodes) {
    assert.ok(n.x >= 0 && n.x <= layout.width && n.y >= 0 && n.y <= layout.height, n.label);
  }
  // one spoke per person plus the evidence edges
  assert.equal(layout.edges.length, 4 + 3);
});

test("layout is deterministic", () => {
  const a = layoutNetwork(data).nodes.map((n) => [Math.round(n.x), Math.round(n.y)]);
  const b = layoutNetwork(data).nodes.map((n) => [Math.round(n.x), Math.round(n.y)]);
  assert.deepEqual(a, b);
});

test("connected people end up closer than unconnected ones", () => {
  const layout = layoutNetwork(data);
  const at = (id: string) => layout.nodes.find((n) => n.id === id)!;
  const dist = (p: string, q: string) => Math.hypot(at(p).x - at(q).x, at(p).y - at(q).y);
  assert.ok(dist("a", "b") < dist("b", "d"));
});

test("neighbors merge reasons per kind and skip the spokes", () => {
  const layout = layoutNetwork(data);
  const jason = neighbors(layout, "a").sort((x, y) => (x.id + x.kind).localeCompare(y.id + y.kind));
  assert.deepEqual(jason, [
    { id: "b", kind: "interests", reasons: ["Both into robotics"] },
    { id: "b", kind: "organization", reasons: ["Both at UC Berkeley"] },
    { id: "c", kind: "event", reasons: ["Both met at Cal Hacks"] },
  ]);
  assert.deepEqual(neighbors(layout, "d"), []);
});

test("hit testing finds the nearest node within reach", () => {
  const layout = layoutNetwork(data);
  const jason = layout.nodes.find((n) => n.id === "a")!;
  assert.equal(hitTest(layout, jason.x + jason.radius + 5, jason.y)?.id, "a");
  assert.equal(hitTest(layout, -500, -500), null);
  assert.ok(personRadius(16) > personRadius(1));
});
