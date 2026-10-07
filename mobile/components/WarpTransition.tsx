// The jump between pages: a burst of star streaks rushing past from the
// center of the screen, over in half a second. Runs on every route change
// except the first paint, and never for reduced motion.
import { useEffect, useRef } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, Line, RadialGradient, Stop } from "react-native-svg";

import { orb, useTheme } from "@/lib/theme";

// Fixed streaks (angle, start, length as fractions of the radius).
const STREAKS = Array.from({ length: 64 }, (_, i) => {
  const a = (i * 137.508 * Math.PI) / 180;
  const k = ((i * 7919) % 97) / 97;
  return { a, start: 0.18 + k * 0.45, len: 0.12 + ((i * 31) % 17) / 40, w: 0.6 + (i % 3) * 0.5 };
});

export function WarpTransition({ routeKey }: { routeKey: string }) {
  const { width, height } = useWindowDimensions();
  const { mode } = useTheme();
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced) return;
    p.value = 0;
    p.value = withSequence(withTiming(1, { duration: 560, easing: Easing.out(Easing.cubic) }), withTiming(0, { duration: 0 }));
  }, [routeKey, reduced, p]);

  const style = useAnimatedStyle(() => ({
    opacity: p.value === 0 ? 0 : Math.sin(Math.min(1, p.value * 1.15) * Math.PI) * (mode === "dark" ? 0.7 : 0.4),
    transform: [{ scale: 0.55 + p.value * 1.1 }],
  }));

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.hypot(cx, cy);
  const color = mode === "dark" ? "#FFF4E8" : "#5E5850";

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id="warp-core" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={orb.glow} stopOpacity={0.35} />
            <Stop offset="1" stopColor={orb.glow} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={cx} cy={cy} r={radius * 0.5} fill="url(#warp-core)" />
        {STREAKS.map((s, i) => {
          const r1 = s.start * radius;
          const r2 = (s.start + s.len) * radius;
          return (
            <Line key={i} x1={cx + Math.cos(s.a) * r1} y1={cy + Math.sin(s.a) * r1}
              x2={cx + Math.cos(s.a) * r2} y2={cy + Math.sin(s.a) * r2}
              stroke={i % 9 === 0 ? orb.mid : color} strokeOpacity={0.55} strokeWidth={s.w} strokeLinecap="round" />
          );
        })}
      </Svg>
    </Animated.View>
  );
}
