// The galaxy behind every page: two layers of stars drifting at different
// speeds (parallax), a few that twinkle, soft nebula glows, and now and then
// a shooting star. The drift is driven by the clock, so moving between pages
// never makes the sky jump. Still for people who ask for reduced motion.
import { useEffect, useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, G, Line, LinearGradient, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";

import { useTheme } from "@/lib/theme";

const TILE = 720;

type Star = { x: number; y: number; r: number; o: number };

// Deterministic, so the sky looks the same on every page and every visit.
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function makeStars(seed: number, count: number, minR: number, maxR: number): Star[] {
  const rand = seeded(seed);
  return Array.from({ length: count }, () => ({
    x: rand() * TILE,
    y: rand() * TILE,
    r: minR + rand() * (maxR - minR),
    o: 0.35 + rand() * 0.65,
  }));
}

const FAR = makeStars(7, 140, 0.4, 0.9);
const NEAR = makeStars(42, 38, 0.9, 1.6);
const BRIGHT = makeStars(1234, 9, 1.4, 2.2).map((s, i) => ({ ...s, x: (s.x / TILE) * 100, y: (s.y / TILE) * 100, phase: i % 3 }));

// A layer of stars tiled across the page and drifting upward forever.
function Drift({ id, stars, color, duration, opacity }: { id: string; stars: Star[]; color: string; duration: number; opacity: number }) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const p = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    // Start where the clock says, so every page shares one sky.
    const phase = (Date.now() % duration) / duration;
    p.value = phase;
    p.value = withSequence(
      withTiming(1, { duration: duration * (1 - phase), easing: Easing.linear }),
      withRepeat(withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration, easing: Easing.linear })), -1),
    );
    return () => cancelAnimation(p);
  }, [p, duration, reduced]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -p.value * TILE }] }));
  const w = Math.ceil(width / TILE + 1) * TILE;
  const h = Math.ceil(height / TILE + 1) * TILE + TILE;

  return (
    <Animated.View style={[styles.layer, { width: w, height: h, opacity }, style]}>
      <Svg width={w} height={h}>
        <Defs>
          <Pattern id={id} patternUnits="userSpaceOnUse" width={TILE} height={TILE}>
            {stars.map((s, i) => (
              <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill={color} fillOpacity={s.o} />
            ))}
          </Pattern>
        </Defs>
        <Rect width={w} height={h} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

function Twinkles({ color }: { color: string }) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(t);
  }, [t, reduced]);
  const a = useAnimatedStyle(() => ({ opacity: 0.25 + t.value * 0.75 }));
  const b = useAnimatedStyle(() => ({ opacity: 1 - t.value * 0.7 }));
  const c = useAnimatedStyle(() => ({ opacity: 0.5 + Math.sin(t.value * Math.PI) * 0.5 }));
  const groups = [a, b, c];
  return (
    <>
      {groups.map((g, gi) => (
        <Animated.View key={gi} style={[StyleSheet.absoluteFill, g]}>
          <Svg width="100%" height="100%">
            {BRIGHT.filter((s) => s.phase === gi).map((s, i) => (
              <Sparkle key={i} x={(s.x / 100) * width} y={(s.y / 100) * height} r={s.r} color={color} />
            ))}
          </Svg>
        </Animated.View>
      ))}
    </>
  );
}

// A four-point glint: a dot with two faint cross rays.
function Sparkle({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  return (
    <G transform={`translate(${x} ${y})`}>
      <Line x1={-r * 4} y1={0} x2={r * 4} y2={0} stroke={color} strokeOpacity={0.35} strokeWidth={0.7} />
      <Line x1={0} y1={-r * 4} x2={0} y2={r * 4} stroke={color} strokeOpacity={0.35} strokeWidth={0.7} />
      <Circle cx={0} cy={0} r={r} fill={color} />
    </G>
  );
}

function ShootingStar({ color }: { color: string }) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    p.value = withRepeat(
      withSequence(withTiming(0, { duration: 0 }), withDelay(11_000, withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }))),
      -1,
    );
    return () => cancelAnimation(p);
  }, [p, reduced]);
  const style = useAnimatedStyle(() => ({
    opacity: p.value === 0 || p.value === 1 ? 0 : Math.sin(p.value * Math.PI),
    transform: [{ translateX: width * 0.85 - p.value * width * 0.5 }, { translateY: height * 0.05 + p.value * height * 0.3 }, { rotate: "-31deg" }],
  }));
  if (reduced) return null;
  return (
    <Animated.View style={[styles.shooting, style]}>
      <Svg width={140} height={2}>
        <Defs>
          <LinearGradient id="bd-shoot" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={color} stopOpacity={0.9} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width={140} height={2} rx={1} fill="url(#bd-shoot)" />
      </Svg>
    </Animated.View>
  );
}

export function Backdrop({ quiet = false }: { quiet?: boolean }) {
  const { colors, mode } = useTheme();
  const dark = mode === "dark";
  const star = dark ? "#FFF4E8" : "#5E5850";
  const nebula = useMemo(
    () => (dark ? { warm: 0.16, cool: 0.1, coolColor: "#6D5BD0" } : { warm: 0.09, cool: 0.05, coolColor: "#7C6AD6" }),
    [dark],
  );
  return (
    <View style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none">
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id="bd-warm" cx="88%" cy="-6%" r="60%">
            <Stop offset="0" stopColor={colors.accent} stopOpacity={nebula.warm} />
            <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="bd-cool" cx="6%" cy="104%" r="55%">
            <Stop offset="0" stopColor={nebula.coolColor} stopOpacity={nebula.cool} />
            <Stop offset="1" stopColor={nebula.coolColor} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#bd-warm)" />
        <Rect width="100%" height="100%" fill="url(#bd-cool)" />
      </Svg>
      <Drift id="bd-far" stars={FAR} color={star} duration={240_000} opacity={dark ? (quiet ? 0.5 : 0.8) : 0.22} />
      <Drift id="bd-near" stars={NEAR} color={star} duration={110_000} opacity={dark ? (quiet ? 0.6 : 1) : 0.28} />
      {dark && !quiet && <Twinkles color={star} />}
      {dark && !quiet && <ShootingStar color={star} />}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
  layer: { position: "absolute", left: 0, top: 0 },
  shooting: { position: "absolute", left: 0, top: 0, width: 140, height: 2 },
});
