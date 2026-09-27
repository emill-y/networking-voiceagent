import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Line } from "react-native-svg";

import { Button } from "@/components/Button";
import { EDGE_STYLES, EdgeLegend, NetworkMap } from "@/components/NetworkMap";
import { Screen } from "@/components/Screen";
import { useDesktop } from "@/hooks/useDesktop";
import { ApiError } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { layoutNetwork, neighbors, type MapEdge } from "@/lib/networkLayout";
import { colors, radius, spacing, type } from "@/lib/theme";
import { getNetwork } from "@/services/nomi";
import type { EdgeKind, NetworkResponse } from "@/types/api";

type View_ = "map" | "list";

export default function Network() {
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const desktop = useDesktop();
  const [data, setData] = useState<NetworkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<View_>("map");

  useFocusEffect(
    useCallback(() => {
      getNetwork()
        .then(setData)
        .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn’t load your network."));
    }, []),
  );

  const layout = useMemo(() => (data ? layoutNetwork(data) : null), [data]);
  const names = useMemo(() => {
    const map = new Map<string, string>();
    data?.people.forEach((p) => map.set(p.id, p.name));
    data?.groups.forEach((g) => map.set(g.id, g.label));
    return map;
  }, [data]);

  const openPerson = (id: string) => router.push({ pathname: "/people/[id]", params: { id } });
  const isPerson = (id: string) => !!data?.people.some((p) => p.id === id);
  const links = data?.edges ?? [];

  return (
    <Screen wide>
      <Text style={[type.display, styles.title]}>Your network</Text>

      {!data || !layout ? (
        <View style={styles.loading}>
          {error ? <Text style={type.body}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
        </View>
      ) : data.people.length === 0 ? (
        <View style={styles.empty}>
          <Text style={type.body}>
            Your map fills in as you remember people. Record a note after your next conversation.
          </Text>
          <Button title="Record someone" onPress={() => router.push("/record")} />
        </View>
      ) : (
        <>
          <Text style={type.meta}>
            {data.people.length} {data.people.length === 1 ? "person" : "people"} ·{" "}
            {links.length} {links.length === 1 ? "connection" : "connections"}
          </Text>

          <View style={styles.toolbar}>
            <Segmented value={mode} onChange={setMode} />
          </View>

          {mode === "map" ? (
            <>
              <EdgeLegend />
              <View style={styles.mapWrap}>
                <NetworkMap
                  layout={layout}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  height={desktop ? Math.max(480, windowHeight - 320) : Math.max(320, Math.min(640, windowHeight * 0.55))}
                />
              </View>
              {links.length === 0 && (
                <Text style={[type.meta, styles.hint]}>
                  No links between people yet. They appear when your notes mention a shared
                  company, school, event or interest.
                </Text>
              )}
              {selectedId ? (
                <Details
                  id={selectedId}
                  data={data}
                  connections={neighbors(layout, selectedId)}
                  names={names}
                  onSelect={setSelectedId}
                  onOpen={openPerson}
                  isPerson={isPerson}
                />
              ) : (
                links.length > 0 && (
                  <Text style={[type.meta, styles.hint]}>
                    Tap a person to see how they connect. Pinch or use the buttons to zoom.
                  </Text>
                )
              )}
            </>
          ) : (
            <ListView edges={layout.edges} names={names} onOpen={(id) => isPerson(id) && openPerson(id)} />
          )}
        </>
      )}
    </Screen>
  );
}

function Segmented({ value, onChange }: { value: View_; onChange: (v: View_) => void }) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {(["map", "list"] as const).map((option) => (
        <Pressable
          key={option}
          onPress={() => onChange(option)}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === option }}
          style={[styles.segment, value === option && styles.segmentSelected]}
        >
          <Text style={[styles.segmentText, value === option && styles.segmentTextSelected]}>
            {option === "map" ? "Map" : "List"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function KindKey({ kind }: { kind: EdgeKind }) {
  const style = EDGE_STYLES[kind];
  return (
    <Svg width={22} height={8} accessibilityLabel={style.label}>
      <Line x1={1} y1={4} x2={21} y2={4} stroke={style.color} strokeWidth={2.5}
        strokeDasharray={style.dash} strokeLinecap="round" />
    </Svg>
  );
}

function Details({
  id,
  data,
  connections,
  names,
  onSelect,
  onOpen,
  isPerson,
}: {
  id: string;
  data: NetworkResponse;
  connections: ReturnType<typeof neighbors>;
  names: Map<string, string>;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  isPerson: (id: string) => boolean;
}) {
  const person = data.people.find((p) => p.id === id);
  const group = data.groups.find((g) => g.id === id);
  return (
    <View style={styles.details}>
      <Text style={type.heading}>{person?.name ?? group?.label}</Text>
      {person?.subtitle ? <Text style={type.body}>{person.subtitle}</Text> : null}
      {person ? (
        <Text style={type.meta}>
          {person.moments} {person.moments === 1 ? "moment" : "moments"}
          {person.lastInteractionAt ? ` · last seen ${formatRelative(person.lastInteractionAt)}` : ""}
          {person.openFollowUps ? ` · ${person.openFollowUps} to follow up` : ""}
        </Text>
      ) : (
        <Text style={type.meta}>
          {group?.members} people · {group ? EDGE_STYLES[group.edgeKind].label.toLowerCase() : ""}
        </Text>
      )}

      {connections.length > 0 ? (
        <View style={styles.connections}>
          <Text style={type.label}>Connected to</Text>
          {mergeByPerson(connections).map((c) => (
            <Pressable key={c.id} onPress={() => onSelect(c.id)} accessibilityRole="button"
              style={styles.connection}>
              <View style={styles.keys}>
                {c.kinds.map((kind) => <KindKey key={kind} kind={kind} />)}
              </View>
              <View style={styles.connectionText}>
                <Text style={styles.connectionName}>{names.get(c.id) ?? "Someone"}</Text>
                <Text style={type.meta}>{c.reasons.join(" · ")}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={[type.meta, styles.hint]}>No shared company, event or interests noted yet.</Text>
      )}

      {person && isPerson(id) && (
        <Button title={`Open ${person.name.split(" ")[0]}’s profile`} variant="quiet" onPress={() => onOpen(id)} />
      )}
    </View>
  );
}

// One row per person, even when they're linked in several ways.
function mergeByPerson(connections: ReturnType<typeof neighbors>) {
  const merged = new Map<string, { id: string; kinds: EdgeKind[]; reasons: string[] }>();
  for (const c of connections) {
    if (c.kind === "you") continue;
    const row = merged.get(c.id) ?? { id: c.id, kinds: [], reasons: [] };
    if (!row.kinds.includes(c.kind)) row.kinds.push(c.kind);
    for (const reason of c.reasons) if (!row.reasons.includes(reason)) row.reasons.push(reason);
    merged.set(c.id, row);
  }
  return [...merged.values()];
}

// The same information as the map, as text: every link, grouped by kind.
function ListView({
  edges,
  names,
  onOpen,
}: {
  edges: MapEdge[];
  names: Map<string, string>;
  onOpen: (id: string) => void;
}) {
  const kinds = Object.keys(EDGE_STYLES) as EdgeKind[];
  return (
    <View style={styles.list}>
      {kinds.map((kind) => {
        const all = edges.filter((e) => e.kind === kind);
        if (all.length === 0) return null;
        // Links to a hub ("Cal Hacks") become one row listing its members.
        const hubMembers = new Map<string, string[]>();
        const rows = all.filter((e) => {
          if (!isGroupId(e.target)) return true;
          hubMembers.set(e.target, [...(hubMembers.get(e.target) ?? []), e.source]);
          return false;
        });
        return (
          <View key={kind} style={styles.listGroup}>
            <View style={styles.listHeader}>
              <KindKey kind={kind} />
              <Text style={type.label}>{EDGE_STYLES[kind].label}</Text>
            </View>
            {[...hubMembers.entries()].map(([hub, members]) => (
              <View key={hub} style={styles.listRow}>
                <Text style={styles.connectionName}>{names.get(hub)}</Text>
                <Text style={type.meta}>
                  {members.map((id) => names.get(id)).filter(Boolean).join(", ")}
                </Text>
              </View>
            ))}
            {rows.map((e, i) => (
              <View key={i} style={styles.listRow}>
                <Text style={styles.connectionName}>
                  <Text onPress={() => onOpen(e.source)}>{names.get(e.source)}</Text>
                  {"  ·  "}
                  <Text onPress={() => onOpen(e.target)}>{names.get(e.target)}</Text>
                </Text>
                <Text style={type.meta}>{e.reasons.join(" · ")}</Text>
              </View>
            ))}
          </View>
        );
      })}
      {edges.every((e) => e.kind === "you") && (
        <Text style={[type.meta, styles.hint]}>No links between people yet.</Text>
      )}
    </View>
  );
}

// Hub ids look like "event:cal hacks"; people ids are UUIDs.
function isGroupId(id: string): boolean {
  return id.includes(":");
}

const styles = StyleSheet.create({
  keys: {
    width: 22,
    gap: 6,
  },
  title: {
    marginTop: spacing.xl,
    marginBottom: spacing.xs,
  },
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: "center",
  },
  empty: {
    marginTop: spacing.lg,
    gap: spacing.lg,
  },
  toolbar: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  segmented: {
    flexDirection: "row",
    alignSelf: "flex-start",
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  segment: {
    paddingVertical: 8,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
  },
  segmentSelected: {
    backgroundColor: colors.raised,
  },
  segmentText: {
    fontSize: 14,
    color: colors.muted,
  },
  segmentTextSelected: {
    color: colors.text,
  },
  mapWrap: {
    marginTop: spacing.md,
  },
  hint: {
    marginTop: spacing.md,
  },
  details: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  connections: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  connection: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 4,
  },
  connectionText: {
    flex: 1,
    gap: 2,
  },
  connectionName: {
    fontSize: 16,
    color: colors.text,
  },
  list: {
    gap: spacing.xl,
  },
  listGroup: {
    gap: spacing.sm,
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  listRow: {
    gap: 2,
    paddingVertical: 4,
  },
});
