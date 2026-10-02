import { StyleSheet, Text, View } from "react-native";

import { colors, spacing, type } from "@/lib/theme";

// Every page opens the same way: a small orange label, a big title, and a
// line saying what the page is for.
export function PageHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={type.display}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export const eyebrowStyle = {
  fontSize: 12,
  fontWeight: "700" as const,
  letterSpacing: 1.8,
  textTransform: "uppercase" as const,
  color: colors.accent,
};

const styles = StyleSheet.create({
  header: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  eyebrow: eyebrowStyle,
  subtitle: {
    fontSize: 16,
    lineHeight: 23,
    color: colors.muted,
  },
});
