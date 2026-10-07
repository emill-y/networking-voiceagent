// The live session: a glowing planet that breathes while it listens, with
// everyone Nomi has found so far orbiting it as moons.
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

import { Avatar } from "@/components/Avatar";
import { orb, useTheme } from "@/lib/theme";

const RINGS = [0.62, 0.86];

export function SessionOrbit({ size = 300, listening, people }: { size?: number; listening: boolean; people: string[] }) {
  const { colors, mode } = useTheme();
  const spin = useSharedValue(0);
  const breath = useSharedValue(1);

  useEffect(() => {
    spin.value = withRepeat(withTiming(360, { duration: 60_000, easing: Easing.linear }), -1);
    return () => cancelAnimation(spin);
  }, [spin]);

  useEffect(() => {
    if (listening) {
      breath.value = withRepeat(withSequence(withTiming(1.06, { duration: 1400 }), withTiming(1, { duration: 1400 })), -1);
    } else {
      cancelAnimation(breath);
      breath.value = withTiming(1);
    }
  }, [listening, breath]);

  const rotate = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const counter = useAnimatedStyle(() => ({ transform: [{ rotate: `${-spin.value}deg` }] }));
  const pulse = useAnimatedStyle(() => ({ transform: [{ scale: breath.value }] }));
  const planet = size * 0.34;
  const moon = Math.max(30, size * 0.12);

  return (
    <View style={{ width: size, height: size }} accessibilityLabel={`${people.length} people found`}>
      <Svg style={StyleSheet.absoluteFill} width={size} height={size}>
        <Defs>
          <RadialGradient id="so-glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={orb.glow} stopOpacity={mode === "dark" ? 0.45 : 0.3} />
            <Stop offset="1" stopColor={orb.glow} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#so-glow)" />
        {RINGS.map((r) => (
          <Circle key={r} cx={size / 2} cy={size / 2} r={(size / 2) * r} fill="none" stroke={colors.borderStrong}
            strokeWidth={1} strokeDasharray="2 6" />
        ))}
      </Svg>

      <Animated.View style={[StyleSheet.absoluteFill, styles.center, pulse]}>
        <Svg width={planet} height={planet}>
          <Defs>
            <RadialGradient id="so-planet" cx="36%" cy="30%" r="75%">
              <Stop offset="0" stopColor={orb.light} />
              <Stop offset="0.45" stopColor={orb.mid} />
              <Stop offset="0.85" stopColor={orb.deep} />
              <Stop offset="1" stopColor={orb.shadow} />
            </RadialGradient>
          </Defs>
          <Circle cx={planet / 2} cy={planet / 2} r={planet / 2} fill="url(#so-planet)" />
        </Svg>
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, rotate]}>
        {people.map((name, i) => {
          const ring = RINGS[i % RINGS.length] * (size / 2);
          const angle = (i * 137.5 * Math.PI) / 180 - Math.PI / 2;
          const x = size / 2 + ring * Math.cos(angle) - moon / 2;
          const y = size / 2 + ring * Math.sin(angle) - moon / 2;
          return (
            <Animated.View key={name} entering={ZoomIn.springify().damping(14)} style={[styles.moon, { left: x, top: y }]}>
              <Animated.View style={counter}>
                <Avatar name={name} size={moon} />
              </Animated.View>
            </Animated.View>
          );
        })}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  moon: { position: "absolute" },
});
