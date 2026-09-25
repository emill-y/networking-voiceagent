import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";

import { colors } from "@/lib/theme";

type Props = {
  onPress: () => void;
  recording?: boolean;
  disabled?: boolean;
  size?: number;
  accessibilityLabel: string;
};

// The central capture control. While recording, a soft ring breathes
// around it — calm, not sci-fi.
export function MicButton({ onPress, recording = false, disabled, size = 112, accessibilityLabel }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!recording) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [recording, pulse]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  return (
    <View style={[styles.wrapper, { width: size * 1.6, height: size * 1.6 }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring,
          { width: size, height: size, borderRadius: size / 2 },
          { opacity: recording ? ringOpacity : 0, transform: [{ scale: ringScale }] },
        ]}
      />
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: !!disabled }}
        style={({ pressed }) => [
          styles.button,
          { width: size, height: size, borderRadius: size / 2 },
          recording && styles.recording,
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        {recording ? <View style={styles.stopGlyph} /> : <MicGlyph />}
      </Pressable>
    </View>
  );
}

// A minimal line-drawn microphone built from views, so no icon font is needed.
function MicGlyph() {
  return (
    <View style={styles.glyph}>
      <View style={styles.capsule} />
      <View style={styles.cradle} />
      <View style={styles.stem} />
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
    borderWidth: 1,
    borderColor: colors.accent,
  },
  button: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(242, 238, 232, 0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  recording: {
    backgroundColor: colors.raised,
    borderColor: colors.accent,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.4,
  },
  glyph: {
    alignItems: "center",
  },
  capsule: {
    width: 16,
    height: 26,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.text,
  },
  cradle: {
    width: 26,
    height: 14,
    marginTop: -8,
    borderBottomLeftRadius: 13,
    borderBottomRightRadius: 13,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderColor: colors.text,
  },
  stem: {
    width: 1.5,
    height: 7,
    backgroundColor: colors.text,
  },
  stopGlyph: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: colors.text,
  },
});
