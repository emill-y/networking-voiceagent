import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, G, Line, RadialGradient, Stop, Text as SvgText } from "react-native-svg";

import { colors, fonts, orb, radius, tintFor } from "@/lib/theme";

// Where people sit, as fractions of the canvas around "You" in the middle:
// an inner ring of six and an outer ring of eight, slightly irregular so it
// reads as a network rather than a clock face.
const SLOTS: [number, number][] = [
  [0.4, -0.05], [0.18, 0.4], [-0.24, 0.36], [-0.42, -0.02], [-0.2, -0.4], [0.22, -0.38],
  [0.82, 0.3], [0.5, 0.78], [-0.06, 0.86], [-0.62, 0.62], [-0.86, 0.12], [-0.7, -0.52],
  [-0.12, -0.84], [0.62, -0.66],
];
// Ghost-to-ghost links: neighbours on the rings and a few spokes between them.
const LINKS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
  [0, 6], [1, 7], [2, 8], [3, 10], [4, 12], [5, 13], [6, 7], [9, 10], [11, 12], [13, 6],
];

type Person = { id: string; name: string };

type Props = {
  height: number;
  // Real people take the first seats (up to 14); the rest stay as placeholders.
  people?: Person[];
  // Content shown over the lower part of the canvas (e.g. a call to action).
  children?: ReactNode;
  compact?: boolean;
};

// A network-shaped canvas that's never empty: placeholder people waiting to
// be met, with whoever you've already remembered glowing among them.
export function GhostNetwork({ height, people = [], children, compact }: Props) {
  const [width, setWidth] = useState(0);
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 2600 }), -1, true);
  }, [pulse]);
  const ghostStyle = useAnimatedStyle(() => ({ opacity: 0.55 + pulse.value * 0.45 }));

  // Keep the constellation in the upper part when there's text over the bottom.
  const cy = children ? height * 0.4 : height / 2;
  const rx = Math.min(width * 0.44, (children ? height * 0.36 : height * 0.44) * 1.9);
  const ry = children ? height * 0.34 : height * 0.42;
  const at = (i: number) => ({ x: width / 2 + SLOTS[i][0] * rx, y: cy + SLOTS[i][1] * ry });
  const real = people.slice(0, SLOTS.length);
  const isReal = (i: number) => i < real.length;
  const tints = [...new Set(real.map((p) => tintFor(p.name)))];
  const youR = compact ? 14 : 20;

  return (
    <View
      style={[styles.frame, { height }]}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <>
          <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <RadialGradient id="gn-canvas" cx="50%" cy={`${(cy / height) * 100}%`} r="60%">
                <Stop offset="0" stopColor={orb.glow} stopOpacity={0.16} />
                <Stop offset="1" stopColor={orb.glow} stopOpacity={0} />
              </RadialGradient>
              <RadialGradient id="gn-you" cx="35%" cy="30%" r="75%">
                <Stop offset="0" stopColor={orb.light} />
                <Stop offset="0.45" stopColor={orb.mid} />
                <Stop offset="0.85" stopColor={orb.deep} />
                <Stop offset="1" stopColor={orb.shadow} />
              </RadialGradient>
              <RadialGradient id="gn-glow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={orb.glow} stopOpacity={0.5} />
                <Stop offset="1" stopColor={orb.glow} stopOpacity={0} />
              </RadialGradient>
              {tints.map((tint) => (
                <RadialGradient key={tint} id={`gn-${tint.slice(1)}`} cx="35%" cy="30%" r="75%">
                  <Stop offset="0" stopColor="#FFF3E6" />
                  <Stop offset="0.4" stopColor={tint} />
                  <Stop offset="1" stopColor={tint} stopOpacity={0.6} />
                </RadialGradient>
              ))}
              {tints.map((tint) => (
                <RadialGradient key={`h${tint}`} id={`gnh-${tint.slice(1)}`} cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={tint} stopOpacity={0.45} />
                  <Stop offset="1" stopColor={tint} stopOpacity={0} />
                </RadialGradient>
              ))}
            </Defs>
            <Circle cx={width / 2} cy={cy} r={Math.max(width, height) * 0.7} fill="url(#gn-canvas)" />

            {/* Spokes from you to the people you've met. */}
            {real.map((_, i) => {
              const p = at(i);
              return <Line key={`s${i}`} x1={width / 2} y1={cy} x2={p.x} y2={p.y} stroke={orb.mid} strokeOpacity={0.28} />;
            })}

            {/* People you've met. */}
            {real.map((person, i) => {
              const p = at(i);
              const tint = tintFor(person.name);
              const r = compact ? 7 : 10;
              return (
                <G key={person.id}>
                  <Circle cx={p.x} cy={p.y} r={r * 2.6} fill={`url(#gnh-${tint.slice(1)})`} />
                  <Circle cx={p.x} cy={p.y} r={r} fill={`url(#gn-${tint.slice(1)})`} />
                  <SvgText x={p.x} y={p.y + r + 14} fontSize={compact ? 10 : 12} fontFamily={fonts.serif}
                    fill={colors.textSoft} textAnchor="middle">
                    {person.name.split(" ")[0]}
                  </SvgText>
                </G>
              );
            })}

            {/* You, in the middle. */}
            <Circle cx={width / 2} cy={cy} r={youR * 2.6} fill="url(#gn-glow)" />
            <Circle cx={width / 2} cy={cy} r={youR} fill="url(#gn-you)" />
            <SvgText x={width / 2} y={cy + youR + 15} fontSize={compact ? 10 : 12} fontFamily={fonts.serifBold}
              fill={colors.text} textAnchor="middle">
              You
            </SvgText>
          </Svg>

          {/* Placeholders: people you haven't met yet, breathing softly. */}
          <Animated.View style={[StyleSheet.absoluteFill, ghostStyle]} pointerEvents="none">
            <Svg width={width} height={height}>
              {LINKS.filter(([a, b]) => !isReal(a) || !isReal(b)).map(([a, b]) => {
                const p = at(a);
                const q = at(b);
                return (
                  <Line key={`l${a}-${b}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y}
                    stroke={colors.text} strokeOpacity={0.08} strokeDasharray="3 5" />
                );
              })}
              {SLOTS.map((_, i) => {
                if (isReal(i)) return null;
                const p = at(i);
                return (
                  <G key={`g${i}`}>
                    {i < 6 && (
                      <Line x1={width / 2} y1={cy} x2={p.x} y2={p.y} stroke={orb.mid} strokeOpacity={0.1}
                        strokeDasharray="2 6" />
                    )}
                    <Circle cx={p.x} cy={p.y} r={compact ? 5 : i < 6 ? 8 : 6}
                      fill="rgba(255, 220, 200, 0.03)" stroke="rgba(255, 220, 200, 0.28)" strokeDasharray="2 3" />
                  </G>
                );
              })}
            </Svg>
          </Animated.View>
        </>
      )}
      {children && <View style={styles.overlay}>{children}</View>}
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
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 8,
  },
});
