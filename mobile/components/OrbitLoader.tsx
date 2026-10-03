import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { Txt } from "@/components/Txt";
import { makeStyles, space, useTheme } from "@/lib/theme";

// Nomi's loading state: a node with two small planets in orbit. For longer
// waits (a page's first load, search, finding events). Content-level waits
// use skeletons instead.
export function OrbitLoader({ label, size = 72 }: { label?: string; size?: number }) {
  const s = useStyles();
  const { colors } = useTheme();
  const inner = useSharedValue(0);
  const outer = useSharedValue(0);

  useEffect(() => {
    inner.value = withRepeat(withTiming(360, { duration: 2400, easing: Easing.linear }), -1);
    outer.value = withRepeat(withTiming(360, { duration: 4200, easing: Easing.linear }), -1);
    return () => {
      cancelAnimation(inner);
      cancelAnimation(outer);
    };
  }, [inner, outer]);

  const innerStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${inner.value}deg` }] }));
  const outerStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-outer.value}deg` }] }));
  const ring = (d: number) => ({ width: d, height: d, borderRadius: d / 2 });
  const core = size * 0.22;
  const small = Math.max(5, size * 0.09);

  return (
    <View style={s.wrap} accessibilityRole="progressbar" accessibilityLabel={label ?? "Loading"}>
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <View style={[s.ring, ring(size)]} />
        <View style={[s.ring, ring(size * 0.6)]} />
        <View style={[s.core, ring(core), { backgroundColor: colors.accent }]} />
        <Animated.View style={[StyleSheet.absoluteFill, outerStyle]}>
          <View style={[s.planet, ring(small), { top: -small / 2 + 0.5, left: size / 2 - small / 2, backgroundColor: colors.textSecondary }]} />
        </Animated.View>
        <Animated.View style={[s.innerOrbit, { width: size * 0.6, height: size * 0.6 }, innerStyle]}>
          <View style={[s.planet, ring(small * 0.85), { top: -(small * 0.85) / 2 + 0.5, left: (size * 0.6) / 2 - (small * 0.85) / 2, backgroundColor: colors.accent }]} />
        </Animated.View>
      </View>
      {label ? <Txt variant="small" tone="secondary" align="center">{label}</Txt> : null}
    </View>
  );
}

// Fills its container and centers the loader (a page's first load).
export function PageLoader({ label }: { label?: string }) {
  const s = useStyles();
  return (
    <View style={s.page}>
      <OrbitLoader label={label} />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    wrap: { alignItems: "center", gap: space.md },
    ring: { position: "absolute", borderWidth: 1, borderColor: colors.borderStrong },
    core: { shadowColor: colors.accent, shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
    innerOrbit: { position: "absolute" },
    planet: { position: "absolute" },
    page: { flex: 1, minHeight: 320, alignItems: "center", justifyContent: "center", paddingVertical: space.xxl },
  }),
);
