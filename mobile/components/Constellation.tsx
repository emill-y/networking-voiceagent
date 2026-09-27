import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, Line, RadialGradient, Stop } from "react-native-svg";

import { colors, personTints } from "@/lib/theme";

// A slowly turning constellation: people (in their tints) connected around
// you. Decorative; it hints at what Nomi builds without needing any data.
const NODES = [
  { x: 0.5, y: 0.5, r: 9, you: true },
  { x: 0.22, y: 0.3, r: 6 }, { x: 0.36, y: 0.14, r: 4 }, { x: 0.7, y: 0.2, r: 5.5 },
  { x: 0.84, y: 0.42, r: 4.5 }, { x: 0.78, y: 0.72, r: 6 }, { x: 0.55, y: 0.86, r: 4 },
  { x: 0.28, y: 0.76, r: 5 }, { x: 0.12, y: 0.55, r: 4 }, { x: 0.62, y: 0.38, r: 3.5 },
  { x: 0.4, y: 0.62, r: 3.5 },
];
const LINKS: [number, number][] = [
  [0, 1], [0, 3], [0, 5], [0, 7], [0, 9], [0, 10], [1, 2], [1, 8], [3, 4], [4, 5], [5, 6],
  [6, 7], [7, 8], [2, 9], [3, 9], [10, 7], [9, 4],
];

export function Constellation({ size = 280 }: { size?: number }) {
  const spin = useSharedValue(0);
  const pulse = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 90_000, easing: Easing.linear }), -1, false);
    pulse.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => {
      cancelAnimation(spin);
      cancelAnimation(pulse);
    };
  }, [spin, pulse]);

  const rotate = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const glow = useAnimatedStyle(() => ({ opacity: 0.5 + pulse.value * 0.5, transform: [{ scale: 0.95 + pulse.value * 0.1 }] }));

  const pos = (n: (typeof NODES)[number]) => ({ cx: n.x * size, cy: n.y * size });
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no">
      <Animated.View style={[StyleSheet.absoluteFill, glow]}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="constellationGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={colors.glowWarm} stopOpacity={0.35} />
              <Stop offset="1" stopColor={colors.glowWarm} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#constellationGlow)" />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, rotate]}>
        <Svg width={size} height={size}>
          {LINKS.map(([a, b], i) => (
            <Line key={i} x1={NODES[a].x * size} y1={NODES[a].y * size} x2={NODES[b].x * size} y2={NODES[b].y * size}
              stroke={colors.text} strokeOpacity={a === 0 ? 0.22 : 0.12} strokeWidth={1} />
          ))}
          {NODES.map((n, i) =>
            n.you ? (
              <Circle key={i} {...pos(n)} r={n.r} fill={colors.text} />
            ) : (
              <Circle key={i} {...pos(n)} r={n.r} fill={personTints[i % personTints.length]} fillOpacity={0.9} />
            ),
          )}
        </Svg>
      </Animated.View>
    </View>
  );
}
