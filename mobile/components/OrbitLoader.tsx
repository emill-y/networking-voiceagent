import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from "react-native-reanimated";

import { Txt } from "@/components/Txt";
import { makeStyles, space, useTheme } from "@/lib/theme";

// A quiet loader: three dots that breathe in turn.
function Dot({ delay, size }: { delay: number; size: number }) {
  const { colors } = useTheme();
  const v = useSharedValue(0.25);
  useEffect(() => {
    v.value = withDelay(delay, withRepeat(withTiming(1, { duration: 520, easing: Easing.inOut(Easing.quad) }), -1, true));
    return () => cancelAnimation(v);
  }, [delay, v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value }));
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.text }, style]} />;
}

export function OrbitLoader({ label, size = 72 }: { label?: string; size?: number }) {
  const s = useStyles();
  const dot = Math.max(6, Math.round(size / 9));
  return (
    <View style={s.wrap} accessibilityRole="progressbar" accessibilityLabel={label ?? "Loading"}>
      <View style={[s.dots, { gap: dot * 0.8 }]}>
        <Dot delay={0} size={dot} />
        <Dot delay={170} size={dot} />
        <Dot delay={340} size={dot} />
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

const useStyles = makeStyles(() =>
  StyleSheet.create({
    wrap: { alignItems: "center", gap: space.md },
    dots: { flexDirection: "row", alignItems: "center" },
    page: { flex: 1, minHeight: 320, alignItems: "center", justifyContent: "center", paddingVertical: space.xxl },
  }),
);
