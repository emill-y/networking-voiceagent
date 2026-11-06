import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";

import { Avatar } from "@/components/Avatar";
import { Button, IconButton } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { EdgeKey, EdgeLegend, edgeStyles, NetworkGraph } from "@/components/NetworkGraph";
import { PageLoader } from "@/components/OrbitLoader";
import { Page } from "@/components/Page";
import { Segmented } from "@/components/Segmented";
import { Txt } from "@/components/Txt";
import { useDesktop } from "@/hooks/useDesktop";
import { ApiError } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { layoutNetwork, neighbors } from "@/lib/networkLayout";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";
import { getNetwork } from "@/services/nomi";
import type { EdgeKind, NetworkResponse } from "@/types/api";

type Mode = "map" | "list";

export default function Network() {
  const s = useStyles();
  const router = useRouter();
  const desktop = useDesktop();
  const { height } = useWindowDimensions();
  const [data, setData] = useState<NetworkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("map");

  useFocusEffect(
    useCallback(() => {
      getNetwork()
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn’t load your network."));
    }, []),
  );

  const layout = useMemo(() => (data && data.people.length ? layoutNetwork(data) : null), [data]);
  const names = useMemo(() => {
    const map = new Map<string, string>();
    data?.people.forEach((p) => map.set(p.id, p.name));
    data?.groups.forEach((g) => map.set(g.id, g.label));
    return map;
  }, [data]);
  const openPerson = (id: string) => router.push({ pathname: "/contacts/[id]", params: { id } });
  const linkCount = data?.edges.length ?? 0;

  const toggle = (
    <Segmented<Mode> value={mode} onChange={setMode}
      options={[{ value: "map", label: "Map", icon: "map" }, { value: "list", label: "List", icon: "list" }]} />
  );
  const subtitle = data
    ? `${data.people.length} ${data.people.length === 1 ? "person" : "people"} · ${linkCount} ${linkCount === 1 ? "connection" : "connections"}`
    : undefined;

  if (!data) {
    return (
      <Page title="Map">
        {error ? <EmptyState icon="alert" title="Couldn’t load your network" body={error} /> : <PageLoader label="Mapping your network" />}
      </Page>
    );
  }

  if (!layout) {
    return (
      <Page title="Map">
        <Card padding="none">
          <EmptyState icon="map" title="Your network starts here"
            body="Everyone you meet in a session appears here, linked by where you met and what you share."
            action={<Button title="Start a session" icon="mic" variant="primary" onPress={() => router.push("/session")} />} />
        </Card>
      </Page>
    );
  }

  if (mode === "list") {
    return (
      <Page title="Map" subtitle={subtitle} actions={toggle}>
        <ListView data={data} names={names} onOpen={openPerson} />
      </Page>
    );
  }

  const details = selectedId ? (
    <Details id={selectedId} data={data} layout={layout} names={names} onSelect={setSelectedId} onOpen={openPerson}
      onClose={() => setSelectedId(null)} />
  ) : null;

  if (desktop) {
    return (
      <Page title="Map" subtitle={subtitle} actions={toggle} scroll={false}>
        <View style={s.desktopBody}>
          <View style={s.graphColumn}>
            <NetworkGraph layout={layout} selectedId={selectedId} onSelect={setSelectedId} style={s.fill} />
            <EdgeLegend />
          </View>
          <Card style={s.panel} padding="none">
            {details ?? <Overview data={data} onSelect={setSelectedId} />}
          </Card>
        </View>
      </Page>
    );
  }

  return (
    <Page title="Map" subtitle={subtitle} actions={toggle} scroll={false}>
      <View style={s.fill}>
        <NetworkGraph layout={layout} selectedId={selectedId} onSelect={setSelectedId}
          style={[s.fill, { minHeight: Math.max(320, height * 0.5) }]} />
        {details && <View style={s.phoneSheet}><Card padding="none" style={s.phoneCard}>{details}</Card></View>}
      </View>
      {!details && <EdgeLegend />}
    </Page>
  );
}

// No one selected: who's most connected, and what the lines mean.
function Overview({ data, onSelect }: { data: NetworkResponse; onSelect: (id: string) => void }) {
  const s = useStyles();
  const degree = new Map<string, number>();
  for (const e of data.edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const top = [...data.people].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0)).slice(0, 8);
  return (
    <ScrollView contentContainerStyle={s.panelContent}>
      <Txt variant="overline">Most connected</Txt>
      {top.map((p) => (
        <Pressable key={p.id} onPress={() => onSelect(p.id)} accessibilityRole="button" accessibilityLabel={p.name}
          style={({ hovered }) => [s.personRow, hovered && s.hover]}>
          <Avatar name={p.name} size={28} />
          <View style={s.flex}>
            <Txt variant="label" numberOfLines={1}>{p.name}</Txt>
            {p.subtitle ? <Txt variant="caption" numberOfLines={1}>{p.subtitle}</Txt> : null}
          </View>
          <Txt variant="caption">{degree.get(p.id) ?? 0}</Txt>
        </Pressable>
      ))}
      <Txt variant="caption" style={s.hint}>Select anyone on the map to see how they connect. Scroll or pinch to zoom, drag to move.</Txt>
    </ScrollView>
  );
}

function Details({ id, data, layout, names, onSelect, onOpen, onClose }: {
  id: string;
  data: NetworkResponse;
  layout: ReturnType<typeof layoutNetwork>;
  names: Map<string, string>;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const s = useStyles();
  const person = data.people.find((p) => p.id === id);
  const group = data.groups.find((g) => g.id === id);
  const connections = mergeByPerson(neighbors(layout, id));
  return (
    <ScrollView contentContainerStyle={s.panelContent}>
      <View style={s.detailsHeader}>
        {person ? <Avatar name={person.name} size={40} /> : null}
        <View style={s.flex}>
          <Txt variant="heading" numberOfLines={2}>{person?.name ?? group?.label}</Txt>
          {person?.subtitle ? <Txt variant="small" numberOfLines={2}>{person.subtitle}</Txt> : null}
          {group ? <Txt variant="small">{group.members} people</Txt> : null}
        </View>
        <IconButton icon="close" label="Close" onPress={onClose} size={30} tone="plain" />
      </View>
      {person && (
        <Txt variant="caption">
          {person.moments} {person.moments === 1 ? "conversation" : "conversations"}
          {person.lastInteractionAt ? ` · last ${formatRelative(person.lastInteractionAt)}` : ""}
          {person.openFollowUps ? ` · ${person.openFollowUps} to follow up` : ""}
        </Txt>
      )}
      {person && <Button title="Open contact" iconRight="arrow" size="sm" onPress={() => onOpen(id)} />}
      <Txt variant="overline" style={s.connectedLabel}>{connections.length ? `Connected to ${connections.length}` : "No connections yet"}</Txt>
      {connections.length === 0 && (
        <Txt variant="caption">Links appear when your notes mention a shared company, school, event or interest.</Txt>
      )}
      {connections.map((c) => (
        <Pressable key={c.id} onPress={() => onSelect(c.id)} accessibilityRole="button" accessibilityLabel={names.get(c.id)}
          style={({ hovered }) => [s.connection, hovered && s.hover]}>
          <View style={s.keys}>{c.kinds.map((kind) => <EdgeKey key={kind} kind={kind} />)}</View>
          <View style={s.flex}>
            <Txt variant="label" numberOfLines={1}>{names.get(c.id) ?? "Someone"}</Txt>
            <Txt variant="caption" numberOfLines={2}>{c.reasons.join(" · ")}</Txt>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

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

// The same information as the map, as text: every connection, grouped by why.
function ListView({ data, names, onOpen }: { data: NetworkResponse; names: Map<string, string>; onOpen: (id: string) => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const styles = edgeStyles(colors);
  const kinds = Object.keys(styles) as EdgeKind[];
  const isPerson = (id: string) => data.people.some((p) => p.id === id);
  if (!data.edges.length) {
    return (
      <Card padding="none">
        <EmptyState icon="link" title="No connections between your contacts yet"
          body="They appear when your notes mention a shared company, school, event or interest." />
      </Card>
    );
  }
  return (
    <View style={s.listGroups}>
      {kinds.map((kind) => {
        const edges = data.edges.filter((e) => e.kind === kind);
        if (!edges.length) return null;
        return (
          <View key={kind} style={s.listGroup}>
            <View style={s.listHeader}>
              <EdgeKey kind={kind} />
              <Txt variant="overline">{styles[kind].label}</Txt>
              <Txt variant="caption">{edges.length}</Txt>
            </View>
            <Card padding="none">
              {edges.map((e, i) => (
                <View key={i} style={[s.listRow, i > 0 && s.border]}>
                  <View style={s.pair}>
                    {[e.source, e.target].map((id, j) => (
                      <Pressable key={id} onPress={() => isPerson(id) && onOpen(id)} accessibilityRole="link" style={s.pairPerson}>
                        {j === 1 && <Txt variant="caption"> + </Txt>}
                        <Txt variant="label">{names.get(id)}</Txt>
                      </Pressable>
                    ))}
                  </View>
                  <Txt variant="caption" style={s.listReason}>{e.reasons.join(" · ")}</Txt>
                </View>
              ))}
            </Card>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    fill: { flex: 1 },
    desktopBody: { flex: 1, flexDirection: "row", gap: space.md, minHeight: 0 },
    graphColumn: { flex: 1, gap: space.sm, minWidth: 0 },
    panel: { width: 300 },
    panelContent: { padding: space.md, gap: space.xs },
    detailsHeader: { flexDirection: "row", alignItems: "center", gap: space.sm },
    connectedLabel: { marginTop: space.sm },
    personRow: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.xs, borderRadius: radius.md },
    hover: { backgroundColor: colors.surfaceHover },
    hint: { marginTop: space.sm },
    connection: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.xs, borderRadius: radius.md },
    keys: { width: 22, gap: 6 },
    phoneSheet: { position: "absolute", left: space.xs, right: space.xs, bottom: space.xs, maxHeight: "60%" },
    phoneCard: { maxHeight: "100%", ...shadow.raised },
    listGroups: { gap: space.lg },
    listGroup: { gap: space.xs },
    listHeader: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.xxs },
    listRow: { paddingHorizontal: space.md, paddingVertical: space.sm, gap: 2 },
    listReason: {},
    border: { borderTopWidth: 1, borderTopColor: colors.border },
    pair: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
    pairPerson: { flexDirection: "row", alignItems: "center" },
  }),
);
