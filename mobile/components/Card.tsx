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

// The one surface: white paper with a hairline border.
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

const useStyles = makeStyles(({ colors, shadow }) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadow.card,
    },
    hover: { backgroundColor: colors.surfaceHover, borderColor: colors.borderStrong },
    none: { padding: 0, overflow: "hidden" },
    sm: { padding: space.sm },
    md: { padding: space.md + 4 },
    lg: { padding: space.lg },
  }),
);
