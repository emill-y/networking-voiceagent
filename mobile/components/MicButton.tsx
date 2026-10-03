import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

import { Icon } from "@/components/Icon";
import { orb } from "@/lib/theme";

type Props = {
  onPress: () => void;
  recording?: boolean;
  disabled?: boolean;
  size?: number;
  accessibilityLabel: string;
};

// The record orb. At rest it breathes slowly, inviting a tap; while
// recording, rings ripple outward. Warm light, not sci-fi.
export function MicButton({ onPress, recording = false, disabled, size = 112, accessibilityLabel }: Props) {
  const breath = useSharedValue(0);
  const ripple = useSharedValue(0);

  useEffect(() => {
    breath.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(breath);
  }, [breath]);

  useEffect(() => {
    if (!recording) {
      cancelAnimation(ripple);
      ripple.value = 0;
      return;
    }
    ripple.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false);
  }, [recording, ripple]);

  const halo = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breath.value * (recording ? 0.14 : 0.07) }],
    opacity: 0.55 + breath.value * 0.35,
  }));
  const ring = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + ripple.value * 0.7 }],
    opacity: recording ? 0.6 * (1 - ripple.value) : 0,
  }));

  const box = size * 1.75;
  return (
    <View style={[styles.wrapper, { width: box, height: box }]}>
      {/* Glow */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, halo]}>
        <Svg width={box} height={box}>
          <Defs>
            <RadialGradient id="orbGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0.35" stopColor={orb.glow} stopOpacity={recording ? 0.75 : 0.55} />
              <Stop offset="1" stopColor={orb.glow} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={box / 2} cy={box / 2} r={box / 2} fill="url(#orbGlow)" />
        </Svg>
      </Animated.View>
      {/* Ripple while recording */}
      <Animated.View
        pointerEvents="none"
        style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, ring]}
      />
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: !!disabled }}
        style={({ pressed }) => [
          { width: size, height: size, borderRadius: size / 2 },
          styles.orb,
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        <Svg style={StyleSheet.absoluteFill} width={size} height={size}>
          <Defs>
            <RadialGradient id="orbFill" cx="35%" cy="28%" r="80%">
              <Stop offset="0" stopColor={orb.light} />
              <Stop offset="0.4" stopColor={orb.mid} />
              <Stop offset="0.78" stopColor={orb.deep} />
              <Stop offset="1" stopColor={orb.shadow} />
            </RadialGradient>
          </Defs>
          <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#orbFill)" />
        </Svg>
        {/* Above the gradient (positioned siblings paint on top on the web). */}
        <View style={styles.glyph}>
          {recording ? (
            <View style={styles.stopGlyph} />
          ) : (
            <Icon name="mic" size={size * 0.34} color="#FFFFFF" />
          )}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: orb.mid,
  },
  orb: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: orb.glow,
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
  disabled: {
    opacity: 0.4,
  },
  glyph: {
    position: "relative",
    zIndex: 1,
  },
  stopGlyph: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
  },
});
