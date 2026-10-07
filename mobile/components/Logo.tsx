import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";

import { Txt } from "@/components/Txt";
import { space, useTheme } from "@/lib/theme";

const TILT = (-24 * Math.PI) / 180;

// The Nomi mark: a planet with one orbit and a small moon that travels it,
// slipping behind the planet on the far side.
export function LogoMark({ size = 26, still = false }: { size?: number; still?: boolean }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const moving = !still && !reduced;
  const t = useSharedValue(-0.42);

  useEffect(() => {
    if (!moving) return;
    t.value = withRepeat(withTiming(-0.42 + Math.PI * 2, { duration: 14_000, easing: Easing.linear }), -1);
    return () => cancelAnimation(t);
  }, [moving, t]);

  const k = size / 32;
  const moon = 2.2 * k;
  const moonStyle = useAnimatedStyle(() => {
    const ex = 14.5 * Math.cos(t.value);
    const ey = 6.5 * Math.sin(t.value);
    const x = 16 + ex * Math.cos(TILT) - ey * Math.sin(TILT);
    const y = 16 + ex * Math.sin(TILT) + ey * Math.cos(TILT);
    // Behind the planet on the far half of the orbit.
    const hidden = Math.sin(t.value) < 0 && Math.hypot(x - 16, y - 16) < 8.6;
    return { opacity: hidden ? 0 : 1, transform: [{ translateX: x * k - moon }, { translateY: y * k - moon }] };
  });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 32 32">
        <Defs>
          <RadialGradient id="nomi-planet" cx="38%" cy="32%" r="70%">
            <Stop offset="0" stopColor="#FFD9B8" />
            <Stop offset="0.5" stopColor={colors.accent} />
            <Stop offset="1" stopColor="#9A3B12" />
          </RadialGradient>
        </Defs>
        <Ellipse cx={16} cy={16} rx={14.5} ry={6.5} stroke={colors.textTertiary} strokeWidth={1.2} fill="none" transform="rotate(-24 16 16)" />
        <Circle cx={16} cy={16} r={8} fill="url(#nomi-planet)" />
      </Svg>
      <Animated.View
        pointerEvents="none"
        style={[{ position: "absolute", left: 0, top: 0, width: moon * 2, height: moon * 2, borderRadius: moon, backgroundColor: colors.text }, moonStyle]}
      />
    </View>
  );
}

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
      <LogoMark size={size} />
      <Txt variant="title" style={{ fontSize: size * 0.8, lineHeight: size }}>Nomi</Txt>
    </View>
  );
}
