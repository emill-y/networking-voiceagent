import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { Icon, type IconName } from "@/components/Icon";
import { colors, radius, spacing } from "@/lib/theme";

type Props = {
  title: string;
  onPress: () => void;
  variant?: "primary" | "quiet" | "danger";
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
};

// A button that's only as wide as its label (unlike Button, which fills the row).
export function PillButton({ title, onPress, variant = "quiet", icon, loading, disabled }: Props) {
  const textColor = variant === "primary" ? colors.background : variant === "danger" ? "#FFB4A8" : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.base,
        styles[variant],
        (hovered || pressed) && styles.active,
        (disabled || loading) && styles.disabled,
      ]}
    >
      {variant === "primary" && (
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id="pill-primary" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#FFA066" />
              <Stop offset="1" stopColor={colors.accent} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="100" fill="url(#pill-primary)" />
        </Svg>
      )}
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator size="small" color={textColor} />
        ) : icon ? (
          <Icon name={icon} size={16} color={textColor} />
        ) : null}
        <Text style={[styles.text, { color: textColor }]}>{title}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
    minHeight: 44,
    paddingHorizontal: spacing.md + 4,
    borderRadius: radius.md,
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
  },
  primary: {
    borderColor: "transparent",
  },
  quiet: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: colors.cardBorder,
  },
  danger: {
    backgroundColor: "rgba(255, 90, 75, 0.1)",
    borderColor: "rgba(255, 120, 105, 0.3)",
  },
  active: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    position: "relative",
    zIndex: 1,
  },
  text: {
    fontSize: 15,
    fontWeight: "600",
  },
});
