// Positions for the network map: you at the center, people pulled toward
// the people they share things with, hubs among their members. Pure (no
// React), seeded, so the same network always draws the same way.
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

import type { EdgeKind, NetworkResponse } from "../types/api";

export const YOU_ID = "you";

export type MapNode = SimulationNodeDatum & {
  id: string;
  kind: "you" | "person" | "group";
  label: string;
  radius: number;
  edgeKind?: EdgeKind; // groups only
  x: number;
  y: number;
};

export type MapEdge = {
  source: string;
  target: string;
  kind: EdgeKind | "you";
  reasons: string[];
};

export type MapLayout = {
  nodes: MapNode[];
  edges: MapEdge[];
  width: number;
  height: number;
};

export function personRadius(moments: number): number {
  // Area grows with how often you've met, capped so one person can't dominate.
  return 11 + 3.2 * Math.sqrt(Math.min(Math.max(moments, 1), 16));
}

// Deterministic pseudo-random numbers (d3's default is Math.random).
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function layoutNetwork(data: NetworkResponse): MapLayout {
  const people = data.people.length;
  // The canvas grows with the network so dense maps don't get cramped.
  const size = Math.max(360, Math.min(1400, 240 + people * 38 + data.groups.length * 30));
  const center = size / 2;

  const nodes: MapNode[] = [
    { id: YOU_ID, kind: "you", label: "You", radius: 20, x: center, y: center, fx: center, fy: center },
    ...data.people.map((p, i) => {
      // Start on a spiral so the simulation settles quickly and repeatably.
      const angle = i * 2.39996;
      const distance = 60 + 14 * Math.sqrt(i + 1) * 4;
      return {
        id: p.id,
        kind: "person" as const,
        label: p.name,
        radius: personRadius(p.moments),
        x: center + distance * Math.cos(angle),
        y: center + distance * Math.sin(angle),
      };
    }),
    ...data.groups.map((g, i) => ({
      id: g.id,
      kind: "group" as const,
      label: g.label,
      radius: 8,
      edgeKind: g.edgeKind,
      x: center + (size / 3) * Math.cos(i * 1.7),
      y: center + (size / 3) * Math.sin(i * 1.7),
    })),
  ];

  const edges: MapEdge[] = [
    // A faint spoke from you to everyone: they're all people you know.
    ...data.people.map((p) => ({ source: YOU_ID, target: p.id, kind: "you" as const, reasons: [] })),
    ...data.edges.map((e) => ({ ...e })),
  ];

  const links: (SimulationLinkDatum<MapNode> & { kind: MapEdge["kind"] })[] = edges.map((e) => ({
    source: e.source,
    target: e.target,
    kind: e.kind,
  }));

  // Grows with the square root of the network so small maps stay compact.
  const ring = 60 + Math.sqrt(people) * 26;
  forceSimulation(nodes)
    .randomSource(seeded(7))
    .force(
      "link",
      forceLink<MapNode, (typeof links)[number]>(links)
        .id((n) => n.id)
        .distance((l) => (l.kind === "you" ? ring : l.kind === "interests" ? 90 : 72))
        .strength((l) => (l.kind === "you" ? 0.03 : l.kind === "interests" ? 0.25 : 0.5)),
    )
    .force("charge", forceManyBody<MapNode>().strength(-190))
    // Room for each node plus its name label underneath.
    .force("collide", forceCollide<MapNode>((n) => n.radius + 22).strength(0.9))
    .force(
      "ring",
      forceRadial<MapNode>((n) => (n.kind === "you" ? 0 : ring), center, center).strength((n) =>
        n.kind === "person" ? 0.1 : 0.03,
      ),
    )
    .stop()
    .tick(300);

  // Crop the canvas to where the nodes ended up (plus room for labels), so
  // "fit to screen" shows the network as large as possible.
  const labelRoom = 60;
  const minX = Math.min(...nodes.map((n) => n.x - n.radius)) - labelRoom;
  const maxX = Math.max(...nodes.map((n) => n.x + n.radius)) + labelRoom;
  const minY = Math.min(...nodes.map((n) => n.y - n.radius)) - 30;
  const maxY = Math.max(...nodes.map((n) => n.y + n.radius)) + 30;
  for (const n of nodes) {
    n.x -= minX;
    n.y -= minY;
  }
  return { nodes, edges, width: Math.max(200, maxX - minX), height: Math.max(200, maxY - minY) };
}

// Everyone directly linked to a node (excluding you), with the reasons.
export function neighbors(layout: MapLayout, id: string): { id: string; kind: MapEdge["kind"]; reasons: string[] }[] {
  const out = new Map<string, { id: string; kind: MapEdge["kind"]; reasons: string[] }>();
  for (const e of layout.edges) {
    if (e.kind === "you") continue;
    const other = e.source === id ? e.target : e.target === id ? e.source : null;
    if (!other) continue;
    const key = `${other}:${e.kind}`;
    const existing = out.get(key);
    if (existing) existing.reasons.push(...e.reasons);
    else out.set(key, { id: other, kind: e.kind, reasons: [...e.reasons] });
  }
  return [...out.values()];
}

// Screen point -> the node under it (with a generous hit area), or null.
export function hitTest(layout: MapLayout, x: number, y: number, slop = 14): MapNode | null {
  let best: MapNode | null = null;
  let bestDistance = Infinity;
  for (const n of layout.nodes) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d <= n.radius + slop && d < bestDistance) {
      best = n;
      bestDistance = d;
    }
  }
  return best;
}
