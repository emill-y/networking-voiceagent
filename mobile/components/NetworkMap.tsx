import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import Svg, { Circle, Defs, G, Line, RadialGradient, Stop, Text as SvgText } from "react-native-svg";

import { hitTest, neighbors, YOU_ID, type MapLayout, type MapNode } from "@/lib/networkLayout";
import { colors, fonts, orb, radius, spacing, tintFor } from "@/lib/theme";
import type { EdgeKind } from "@/types/api";

// Connection types. Colors are the first three slots of the validated
// categorical palette, stepped for the dark surface (checked all-pairs for
// colorblind safety against #171A1D). Each also has its own dash pattern,
// so color is never the only way to tell them apart.
export const EDGE_STYLES: Record<EdgeKind, { color: string; dash?: string; label: string }> = {
  organization: { color: "#3987e5", label: "Work or study together" },
  event: { color: "#d95926", dash: "7 5", label: "Met at the same event" },
  interests: { color: "#199e70", dash: "1.5 5", label: "Shared interests" },
};

const MIN_SCALE = 0.3;
const MAX_SCALE = 3.5;

type Props = {
  layout: MapLayout;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  height: number;
};

export function NetworkMap({ layout, selectedId, onSelect, height }: Props) {
  const [viewport, setViewport] = useState({ width: 0, height });
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const saved = useSharedValue({ scale: 1, tx: 0, ty: 0 });

  // Fit the whole network into view.
  function fit(animated: boolean) {
    if (!viewport.width) return;
    const s = Math.min(1.4, Math.min(viewport.width / layout.width, viewport.height / layout.height) * 0.95);
    const nextTx = (viewport.width - layout.width * s) / 2;
    const nextTy = (viewport.height - layout.height * s) / 2;
    scale.value = animated ? withTiming(s) : s;
    tx.value = animated ? withTiming(nextTx) : nextTx;
    ty.value = animated ? withTiming(nextTy) : nextTy;
  }

  useEffect(() => {
    fit(false);
    // Refit when the data or the available space changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, viewport.width, viewport.height]);

  function zoomBy(factor: number) {
    // Zoom around the middle of the viewport.
    const cx = viewport.width / 2;
    const cy = viewport.height / 2;
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.value * factor));
    const ratio = next / scale.value;
    tx.value = withTiming(cx - (cx - tx.value) * ratio);
    ty.value = withTiming(cy - (cy - ty.value) * ratio);
    scale.value = withTiming(next);
  }

  function handleTap(x: number, y: number) {
    // Screen point -> map coordinates (transform origin is the top-left corner).
    const hit = hitTest(layout, (x - tx.value) / scale.value, (y - ty.value) / scale.value);
    onSelect(hit && hit.id !== YOU_ID ? (hit.id === selectedId ? null : hit.id) : null);
  }

  const pan = Gesture.Pan()
    .minDistance(4)
    .onStart(() => {
      saved.value = { scale: scale.value, tx: tx.value, ty: ty.value };
    })
    .onUpdate((e) => {
      tx.value = saved.value.tx + e.translationX;
      ty.value = saved.value.ty + e.translationY;
    });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      saved.value = { scale: scale.value, tx: tx.value, ty: ty.value };
    })
    .onUpdate((e) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, saved.value.scale * e.scale));
      const ratio = next / saved.value.scale;
      // Keep the point under the fingers still while zooming.
      tx.value = e.focalX - (e.focalX - saved.value.tx) * ratio;
      ty.value = e.focalY - (e.focalY - saved.value.ty) * ratio;
      scale.value = next;
    });

  const tap = Gesture.Tap()
    .maxDistance(10)
    .onEnd((e, success) => {
      if (success) scheduleOnRN(handleTap, e.x, e.y);
    });

  // All three can be recognized together; a tap fails on its own as soon as
  // the pointer moves more than 10px, so dragging never selects a node.
  const gesture = Gesture.Simultaneous(pinch, pan, tap);

  const canvasStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const focus = useMemo(() => {
    if (!selectedId) return null;
    return new Set([selectedId, ...neighbors(layout, selectedId).map((n) => n.id)]);
  }, [layout, selectedId]);

  const byId = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout]);
  const tints = useMemo(
    () => [...new Set(layout.nodes.filter((n) => n.kind === "person").map((n) => tintFor(n.label)))],
    [layout],
  );
  const showAllLabels = layout.nodes.length <= 40;

  return (
    <View
      style={[styles.frame, { height }]}
      onLayout={(e: LayoutChangeEvent) =>
        setViewport({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
      }
    >
      <CanvasGlow />
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill} accessible={false}>
          <Animated.View
            style={[{ width: layout.width, height: layout.height, transformOrigin: "0 0" }, canvasStyle]}
          >
            <Svg width={layout.width} height={layout.height}>
              <NodeGradients tints={tints} />
              <G>
                {layout.edges.map((edge, i) => {
                  const a = byId.get(edge.source);
                  const b = byId.get(edge.target);
                  if (!a || !b) return null;
                  const touches = selectedId ? edge.source === selectedId || edge.target === selectedId : true;
                  if (edge.kind === "you") {
                    return (
                      <Line key={`s${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                        stroke={orb.mid} strokeOpacity={selectedId ? 0.05 : 0.14} strokeWidth={1} />
                    );
                  }
                  const style = EDGE_STYLES[edge.kind];
                  return (
                    <Line
                      key={`e${i}`}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={style.color}
                      strokeWidth={touches && selectedId ? 2.5 : 1.6}
                      strokeDasharray={style.dash}
                      strokeLinecap="round"
                      strokeOpacity={touches ? 0.9 : 0.12}
                    />
                  );
                })}
              </G>
              <GhostSeats layout={layout} />
              <G>
                {layout.nodes.map((node) => (
                  <NodeMark
                    key={node.id}
                    node={node}
                    selected={node.id === selectedId}
                    dimmed={!!focus && !focus.has(node.id) && node.id !== YOU_ID}
                    showLabel={showAllLabels || !!focus?.has(node.id) || node.radius > 18}
                  />
                ))}
              </G>
            </Svg>
          </Animated.View>
        </View>
      </GestureDetector>

      <View style={styles.zoom}>
        <ZoomButton label="+" accessibilityLabel="Zoom in" onPress={() => zoomBy(1.4)} />
        <ZoomButton label="−" accessibilityLabel="Zoom out" onPress={() => zoomBy(1 / 1.4)} />
        <ZoomButton label="⤢" accessibilityLabel="Fit the whole network" onPress={() => fit(true)} />
      </View>
    </View>
  );
}

const gradientId = (tint: string) => `node-${tint.slice(1)}`;

// One glossy gradient per person color, plus the orange "You" orb.
function NodeGradients({ tints }: { tints: string[] }) {
  return (
    <Defs>
      <RadialGradient id="node-you" cx="35%" cy="30%" r="75%">
        <Stop offset="0" stopColor={orb.light} />
        <Stop offset="0.45" stopColor={orb.mid} />
        <Stop offset="0.85" stopColor={orb.deep} />
        <Stop offset="1" stopColor={orb.shadow} />
      </RadialGradient>
      <RadialGradient id="node-glow" cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor={orb.glow} stopOpacity={0.55} />
        <Stop offset="1" stopColor={orb.glow} stopOpacity={0} />
      </RadialGradient>
      {tints.map((tint) => (
        <RadialGradient key={tint} id={gradientId(tint)} cx="35%" cy="30%" r="75%">
          <Stop offset="0" stopColor="#FFF3E6" />
          <Stop offset="0.4" stopColor={tint} />
          <Stop offset="1" stopColor={tint} stopOpacity={0.55} />
        </RadialGradient>
      ))}
      {tints.map((tint) => (
        <RadialGradient key={`g${tint}`} id={`glow-${tint.slice(1)}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={tint} stopOpacity={0.45} />
          <Stop offset="1" stopColor={tint} stopOpacity={0} />
        </RadialGradient>
      ))}
    </Defs>
  );
}

// Small networks get placeholder seats around them (people you haven't met
// yet), so the map never looks bare. They fade out as the real network grows.
function GhostSeats({ layout }: { layout: MapLayout }) {
  const people = layout.nodes.filter((n) => n.kind === "person");
  const count = Math.max(0, 12 - people.length);
  if (!count) return null;
  const you = layout.nodes.find((n) => n.kind === "you");
  const cx = you?.x ?? layout.width / 2;
  const cy = you?.y ?? layout.height / 2;
  const reach = Math.max(90, ...people.map((n) => Math.hypot(n.x - cx, n.y - cy)));
  const seats: { x: number; y: number; r: number }[] = [];
  for (let i = 0; seats.length < count && i < count * 3; i++) {
    const ring = i % 2 === 0 ? reach * 1.25 : reach * 0.8 + 30;
    const angle = i * 2.39996 + 0.6;
    // Stay inside the drawing area.
    const x = Math.min(layout.width - 24, Math.max(24, cx + ring * Math.cos(angle) * 1.35));
    const y = Math.min(layout.height - 24, Math.max(24, cy + ring * Math.sin(angle)));
    if (people.some((n) => Math.hypot(n.x - x, n.y - y) < 60)) continue;
    seats.push({ x, y, r: i % 2 === 0 ? 6 : 8 });
  }
  return (
    <G opacity={0.9}>
      {seats.map((seat, i) => (
        <G key={i}>
          <Line x1={cx} y1={cy} x2={seat.x} y2={seat.y} stroke={orb.mid} strokeOpacity={0.08} strokeDasharray="2 6" />
          <Circle cx={seat.x} cy={seat.y} r={seat.r} fill="rgba(255, 220, 200, 0.03)"
            stroke="rgba(255, 220, 200, 0.26)" strokeDasharray="2 3" />
        </G>
      ))}
    </G>
  );
}

// A soft molten glow behind the whole map, like the website's network.
function CanvasGlow() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <RadialGradient id="canvas-glow" cx="50%" cy="48%" r="60%">
          <Stop offset="0" stopColor={orb.glow} stopOpacity={0.14} />
          <Stop offset="1" stopColor={orb.glow} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx="50%" cy="48%" r="70%" fill="url(#canvas-glow)" />
    </Svg>
  );
}

function NodeMark({
  node,
  selected,
  dimmed,
  showLabel,
}: {
  node: MapNode;
  selected: boolean;
  dimmed: boolean;
  showLabel: boolean;
}) {
  if (node.kind === "you") {
    return (
      <G>
        <Circle cx={node.x} cy={node.y} r={node.radius * 2.4} fill="url(#node-glow)" />
        <Circle cx={node.x} cy={node.y} r={node.radius} fill="url(#node-you)" />
        <SvgText x={node.x} y={node.y + node.radius + 16} fontSize={12}
          fontFamily={fonts.serifBold} fill={colors.text} textAnchor="middle">
          You
        </SvgText>
      </G>
    );
  }
  if (node.kind === "group") {
    const color = EDGE_STYLES[node.edgeKind ?? "organization"].color;
    return (
      <G opacity={dimmed ? 0.25 : 1}>
        <Circle cx={node.x} cy={node.y} r={node.radius} fill={color} fillOpacity={0.25}
          stroke={color} strokeWidth={1.5} />
        <SvgText x={node.x} y={node.y - node.radius - 6} fontSize={11} fontFamily={fonts.serif}
          fill={colors.muted} textAnchor="middle">
          {node.label}
        </SvgText>
      </G>
    );
  }
  const tint = tintFor(node.label);
  const r = node.radius * 0.8;
  return (
    <G opacity={dimmed ? 0.25 : 1}>
      {/* Glow in the person's own color. */}
      <Circle cx={node.x} cy={node.y} r={r * (selected ? 3 : 2.4)} fill={`url(#glow-${tint.slice(1)})`} />
      <Circle cx={node.x} cy={node.y} r={r} fill={`url(#${gradientId(tint)})`} />
      {selected && (
        <Circle cx={node.x} cy={node.y} r={r + 4} fill="none" stroke={colors.text} strokeWidth={1.5} />
      )}
      {showLabel && (
        <SvgText x={node.x} y={node.y + r + 16} fontSize={12} fontFamily={fonts.serif}
          fill={selected ? colors.text : colors.textSoft} textAnchor="middle">
          {node.label}
        </SvgText>
      )}
    </G>
  );
}

function ZoomButton({ label, accessibilityLabel, onPress }: { label: string; accessibilityLabel: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]} hitSlop={4}>
      <Text style={styles.zoomText}>{label}</Text>
    </Pressable>
  );
}

// Line keys (not boxes) that mirror the marks: color plus dash pattern.
export function EdgeLegend() {
  return (
    <View style={styles.legend} accessibilityRole="summary">
      {(Object.keys(EDGE_STYLES) as EdgeKind[]).map((kind) => (
        <View key={kind} style={styles.legendItem}>
          <Svg width={26} height={8}>
            <Line x1={1} y1={4} x2={25} y2={4} stroke={EDGE_STYLES[kind].color} strokeWidth={2.5}
              strokeDasharray={EDGE_STYLES[kind].dash} strokeLinecap="round" />
          </Svg>
          <Text style={styles.legendText}>{EDGE_STYLES[kind].label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
    borderRadius: radius.lg,
    backgroundColor: "#070504",
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  zoom: {
    position: "absolute",
    right: spacing.sm,
    bottom: spacing.sm,
    gap: spacing.xs,
  },
  zoomButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.7,
  },
  zoomText: {
    color: colors.text,
    fontSize: 18,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: spacing.md,
    rowGap: spacing.xs,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendText: {
    fontSize: 12,
    color: colors.muted,
  },
});
