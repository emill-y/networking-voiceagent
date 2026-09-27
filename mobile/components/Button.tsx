import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { Icon, type IconName } from "@/components/Icon";
import { colors, radius, spacing } from "@/lib/theme";

type Props = {
  title: string;
  onPress: () => void;
  variant?: "primary" | "quiet" | "danger";
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
};

export function Button({ title, onPress, variant = "primary", disabled, loading, icon }: Props) {
  const inactive = disabled || loading;
  const primary = variant === "primary";
  const textColor = primary ? colors.background : variant === "danger" ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed }) => [
        styles.base,
        !primary && styles.quiet,
        pressed && styles.pressed,
        inactive && styles.disabled,
      ]}
    >
      {primary && (
        // Warm ivory-to-sand gradient: the one place the accent gets to shine.
        <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id="primary" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#F6EFE4" />
              <Stop offset="1" stopColor={colors.accentBright} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="100" fill="url(#primary)" />
        </Svg>
      )}
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={styles.row}>
          {icon && <Icon name={icon} size={18} color={textColor} />}
          <Text style={[styles.text, { color: textColor }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  quiet: {
    backgroundColor: "rgba(242, 238, 232, 0.07)",
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.4,
  },
  row: {
    position: "relative",
    zIndex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  text: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
