import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { makeStyles, radius, space } from "@/lib/theme";

type Props = {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  // "none" for lists that draw their own rows edge to edge.
  padding?: "none" | "sm" | "md" | "lg";
  accessibilityLabel?: string;
};

// The one surface. Dark mode matches the website: frosted glass with a warm
// highlight along the top and left edges.
export function Card({ children, onPress, style, padding = "md", accessibilityLabel }: Props) {
  const s = useStyles();
  const pad = s[padding];
  if (!onPress) return <View style={[s.card, pad, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        s.card,
        pad,
        (hovered || pressed) && s.hover,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, shadow, mode }) =>
  StyleSheet.create({
    card: {
      backgroundColor: mode === "dark" ? "rgba(255, 240, 228, 0.045)" : colors.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      ...(mode === "dark" ? { borderTopColor: "rgba(255, 170, 120, 0.26)", borderLeftColor: "rgba(255, 170, 120, 0.16)" } : {}),
      ...(mode === "dark" ? ({ backdropFilter: "blur(14px)" } as object) : {}),
      ...shadow.card,
    },
    hover: {
      backgroundColor: mode === "dark" ? "rgba(255, 240, 228, 0.075)" : colors.surfaceHover,
      borderColor: colors.borderStrong,
      ...(mode === "dark" ? { borderTopColor: "rgba(255, 170, 120, 0.4)" } : {}),
    },
    none: { padding: 0, overflow: "hidden" },
    sm: { padding: space.sm },
    md: { padding: space.md + 4 },
    lg: { padding: space.lg },
  }),
);
