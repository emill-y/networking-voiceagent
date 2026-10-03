import { useEffect } from "react";
import { StyleSheet, View, type DimensionValue } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { makeStyles, radius, space } from "@/lib/theme";

// A placeholder block that gently pulses while content loads.
export function Skeleton({ width = "100%", height = 14, round }: { width?: DimensionValue; height?: number; round?: boolean }) {
  const s = useStyles();
  const pulse = useSharedValue(0.55);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[s.block, { width, height, borderRadius: round ? height / 2 : radius.sm }, style]} />;
}

// Rows like a list of people/follow-ups.
export function SkeletonRows({ rows = 4, avatar = true }: { rows?: number; avatar?: boolean }) {
  const s = useStyles();
  return (
    <View style={s.rows} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={s.row}>
          {avatar && <Skeleton width={36} height={36} round />}
          <View style={s.lines}>
            <Skeleton width={`${55 - (i % 3) * 10}%`} height={13} />
            <Skeleton width={`${35 + (i % 2) * 15}%`} height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    block: { backgroundColor: colors.skeleton },
    rows: { gap: space.md, paddingVertical: space.xs },
    row: { flexDirection: "row", alignItems: "center", gap: space.sm },
    lines: { flex: 1, gap: 7 },
  }),
);
