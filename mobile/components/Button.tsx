import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { colors, radius, spacing } from "@/lib/theme";

type Props = {
  title: string;
  onPress: () => void;
  variant?: "primary" | "quiet" | "danger";
  disabled?: boolean;
  loading?: boolean;
};

export function Button({ title, onPress, variant = "primary", disabled, loading }: Props) {
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" && styles.primary,
        variant !== "primary" && styles.quiet,
        pressed && styles.pressed,
        inactive && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.background : colors.text} />
      ) : (
        <Text
          style={[
            styles.text,
            variant === "primary" && styles.primaryText,
            variant === "danger" && styles.dangerText,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    backgroundColor: colors.text,
  },
  quiet: {
    backgroundColor: colors.raised,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.4,
  },
  text: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.text,
    letterSpacing: 0.2,
  },
  primaryText: {
    color: colors.background,
  },
  dangerText: {
    color: colors.danger,
  },
});
