// The network visualization, shared by Home (a compact preview) and Map
// (full interaction: drag to pan, pinch or scroll to zoom, tap to select).
// Every mark means something: you at the center, a circle per person, a
// small ring per shared place (event, company), and lines that say why two
// people are connected.
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import Svg, { Circle, Defs, G, Line, RadialGradient, Stop, Text as SvgText } from "react-native-svg";

import { IconButton } from "@/components/Button";
import { Txt } from "@/components/Txt";
import { hitTest, neighbors, YOU_ID, type MapLayout, type MapNode } from "@/lib/networkLayout";
import { font, makeStyles, orb, radius, space, tintFor, useTheme, type Theme } from "@/lib/theme";
import type { EdgeKind } from "@/types/api";

// Three reasons two people are connected. Color plus dash pattern, so color
// is never the only cue.
export function edgeStyles(colors: Theme["colors"]): Record<EdgeKind, { color: string; dash?: string; label: string }> {
  return {
    organization: { color: colors.edgeWork, label: "Work or school" },
    event: { color: colors.edgeEvent, dash: "6 5", label: "Same event" },
    interests: { color: colors.edgeInterest, dash: "1.5 5", label: "Shared interests" },
  };
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

type Props = {
  layout: MapLayout;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  // Compact: a still preview (Home). No gestures or controls.
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function NetworkGraph({ layout, selectedId = null, onSelect, compact, style }: Props) {
  const s = useStyles();
  const { colors, mode } = useTheme();
  const styles = useMemo(() => edgeStyles(colors), [colors]);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const frame = useRef<View>(null);
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const saved = useSharedValue({ scale: 1, tx: 0, ty: 0 });

  function fit(animated: boolean) {
    if (!viewport.width || !viewport.height) return;
    const pad = compact ? 0.92 : 0.9;
    const next = Math.min(compact ? 1.2 : 1.6, Math.min(viewport.width / layout.width, viewport.height / layout.height) * pad);
    const nextTx = (viewport.width - layout.width * next) / 2;
    const nextTy = (viewport.height - layout.height * next) / 2;
    scale.value = animated ? withTiming(next) : next;
    tx.value = animated ? withTiming(nextTx) : nextTx;
    ty.value = animated ? withTiming(nextTy) : nextTy;
  }

  useEffect(() => {
    fit(false);
    // Refit when the data or the available space changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, viewport.width, viewport.height]);

  function zoomAt(factor: number, cx = viewport.width / 2, cy = viewport.height / 2, animated = true) {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.value * factor));
    const ratio = next / scale.value;
    const nx = cx - (cx - tx.value) * ratio;
    const ny = cy - (cy - ty.value) * ratio;
    scale.value = animated ? withTiming(next, { duration: 160 }) : next;
    tx.value = animated ? withTiming(nx, { duration: 160 }) : nx;
    ty.value = animated ? withTiming(ny, { duration: 160 }) : ny;
  }

  // Mouse wheel and trackpad zoom on the web, around the pointer.
  useEffect(() => {
    if (compact || Platform.OS !== "web") return;
    const el = frame.current as unknown as HTMLElement | null;
    if (!el?.addEventListener) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      // Trackpad pinch arrives as ctrl+wheel with small deltas.
      const intensity = e.ctrlKey ? 0.012 : 0.0018;
      zoomAt(Math.exp(-e.deltaY * intensity), e.clientX - rect.left, e.clientY - rect.top, false);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact, viewport.width, viewport.height]);

  function handleTap(x: number, y: number) {
    const hit = hitTest(layout, (x - tx.value) / scale.value, (y - ty.value) / scale.value);
    onSelect?.(hit && hit.id !== YOU_ID ? (hit.id === selectedId ? null : hit.id) : null);
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
      tx.value = e.focalX - (e.focalX - saved.value.tx) * ratio;
      ty.value = e.focalY - (e.focalY - saved.value.ty) * ratio;
      scale.value = next;
    });
  const tap = Gesture.Tap()
    .maxDistance(10)
    .onEnd((e, success) => {
      if (success) scheduleOnRN(handleTap, e.x, e.y);
    });
  const gesture = Gesture.Simultaneous(pinch, pan, tap);

  const canvasStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const focus = useMemo(() => {
    if (!selectedId) return null;
    return new Set([selectedId, ...neighbors(layout, selectedId).map((n) => n.id)]);
  }, [layout, selectedId]);
  const byId = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout]);
  const you = layout.nodes.find((n) => n.kind === "you");
  const people = layout.nodes.filter((n) => n.kind === "person");
  const reach = you ? Math.max(80, ...people.map((n) => Math.hypot(n.x - you.x, n.y - you.y))) : 0;
  const showAllLabels = compact ? layout.nodes.length <= 14 : layout.nodes.length <= 50;

  const canvas = (
    <Animated.View style={[{ width: layout.width, height: layout.height, transformOrigin: "0 0" }, canvasStyle]}>
      <Svg width={layout.width} height={layout.height}>
        <Defs>
          <RadialGradient id="ng-you" cx="38%" cy="32%" r="72%">
            <Stop offset="0" stopColor={orb.light} />
            <Stop offset="0.5" stopColor={orb.mid} />
            <Stop offset="1" stopColor={orb.deep} />
          </RadialGradient>
          <RadialGradient id="ng-halo" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={colors.accent} stopOpacity={mode === "dark" ? 0.35 : 0.22} />
            <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {/* Orbits around you: how far out the network reaches. */}
        {you && [0.55, 1].map((k) => (
          <Circle key={k} cx={you.x} cy={you.y} r={reach * k} fill="none" stroke={colors.orbit} strokeWidth={1} />
        ))}
        <G>
          {layout.edges.map((edge, i) => {
            const a = byId.get(edge.source);
            const b = byId.get(edge.target);
            if (!a || !b) return null;
            const touches = selectedId ? edge.source === selectedId || edge.target === selectedId : true;
            if (edge.kind === "you") {
              return (
                <Line key={`y${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colors.edgeYou}
                  strokeOpacity={selectedId ? 0.35 : 1} strokeWidth={1} />
              );
            }
            const st = styles[edge.kind];
            return (
              <Line key={`e${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={st.color}
                strokeWidth={touches && selectedId ? 2.4 : 1.5} strokeDasharray={st.dash} strokeLinecap="round"
                strokeOpacity={touches ? 0.85 : 0.12} />
            );
          })}
        </G>
        <G>
          {layout.nodes.map((node) => (
            <NodeMark key={node.id} node={node} selected={node.id === selectedId} colors={colors} mode={mode}
              edgeColor={node.edgeKind ? styles[node.edgeKind].color : colors.textTertiary}
              dimmed={!!focus && !focus.has(node.id) && node.id !== YOU_ID}
              showLabel={showAllLabels || !!focus?.has(node.id) || node.radius > 18} />
          ))}
        </G>
      </Svg>
    </Animated.View>
  );

  return (
    <View
      ref={frame}
      style={[s.frame, style]}
      onLayout={(e: LayoutChangeEvent) => setViewport({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      {compact ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">{canvas}</View>
      ) : (
        <GestureDetector gesture={gesture}>
          <View style={[StyleSheet.absoluteFill, s.grab]} accessible={false}>{canvas}</View>
        </GestureDetector>
      )}
      {!compact && (
        <View style={s.controls}>
          <IconButton icon="plus" label="Zoom in" onPress={() => zoomAt(1.35)} size={32} />
          <IconButton icon="minus" label="Zoom out" onPress={() => zoomAt(1 / 1.35)} size={32} />
          <IconButton icon="fit" label="Fit the whole network" onPress={() => fit(true)} size={32} />
        </View>
      )}
    </View>
  );
}

function NodeMark({
  node,
  selected,
  dimmed,
  showLabel,
  colors,
  mode,
  edgeColor,
}: {
  node: MapNode;
  selected: boolean;
  dimmed: boolean;
  showLabel: boolean;
  colors: Theme["colors"];
  mode: Theme["mode"];
  edgeColor: string;
}) {
  if (node.kind === "you") {
    return (
      <G>
        <Circle cx={node.x} cy={node.y} r={node.radius * 2.6} fill="url(#ng-halo)" />
        <Circle cx={node.x} cy={node.y} r={node.radius} fill="url(#ng-you)" />
        <SvgText x={node.x} y={node.y + node.radius + 15} fontSize={11} fontFamily={font.heading}
          fill={colors.textSecondary} textAnchor="middle" {...halo(colors.sunken)}>You</SvgText>
      </G>
    );
  }
  if (node.kind === "group") {
    // A shared place everyone here has in common ("Cal Hacks", "Stripe").
    return (
      <G opacity={dimmed ? 0.25 : 1}>
        <Circle cx={node.x} cy={node.y} r={7} fill={colors.bg} stroke={edgeColor} strokeWidth={2} />
        <SvgText x={node.x} y={node.y - 12} fontSize={11} fontFamily={font.heading} fill={colors.textSecondary} textAnchor="middle" {...halo(colors.sunken)}>
          {node.label}
        </SvgText>
      </G>
    );
  }
  const tint = tintFor(node.label, mode);
  const r = node.radius * 0.72;
  return (
    <G opacity={dimmed ? 0.22 : 1}>
      {selected && <Circle cx={node.x} cy={node.y} r={r + 6} fill="none" stroke={colors.text} strokeWidth={1.5} />}
      <Circle cx={node.x} cy={node.y} r={r} fill={tint} fillOpacity={mode === "dark" ? 0.9 : 0.85} />
      {showLabel && (
        <SvgText x={node.x} y={node.y + r + 15} fontSize={12} fontFamily={font.heading}
          fill={selected ? colors.text : colors.textSecondary} textAnchor="middle" {...halo(colors.sunken)}>
          {node.label}
        </SvgText>
      )}
    </G>
  );
}

// An outline in the background color behind labels, so lines never cut through names.
function halo(color: string) {
  return { stroke: color, strokeWidth: 3, strokeLinejoin: "round" as const, ...({ paintOrder: "stroke" } as object) };
}

// Line keys that mirror the marks: color plus dash pattern.
export function EdgeLegend() {
  const s = useStyles();
  const { colors } = useTheme();
  const styles = edgeStyles(colors);
  return (
    <View style={s.legend}>
      {(Object.keys(styles) as EdgeKind[]).map((kind) => (
        <View key={kind} style={s.legendItem}>
          <EdgeKey kind={kind} />
          <Txt variant="caption" tone="secondary">{styles[kind].label}</Txt>
        </View>
      ))}
    </View>
  );
}

export function EdgeKey({ kind }: { kind: EdgeKind }) {
  const { colors } = useTheme();
  const st = edgeStyles(colors)[kind];
  return (
    <Svg width={22} height={8}>
      <Line x1={1} y1={4} x2={21} y2={4} stroke={st.color} strokeWidth={2.4} strokeDasharray={st.dash} strokeLinecap="round" />
    </Svg>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    frame: {
      overflow: "hidden",
      borderRadius: radius.lg,
      backgroundColor: colors.sunken,
      borderWidth: 1,
      borderColor: colors.border,
    },
    grab: { cursor: "grab" } as object,
    controls: { position: "absolute", right: space.sm, top: space.sm, gap: space.xxs },
    legend: { flexDirection: "row", flexWrap: "wrap", columnGap: space.md, rowGap: space.xxs },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  }),
);
